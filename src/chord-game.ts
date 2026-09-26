// "Beat the Clock" — a timed chord-recognition game.
//
// A chord name flashes and the player has five seconds to pick its fingering
// out of four diagrams. It runs entirely off the curated shape data the
// explorer already uses, and never touches Audiotool, so it works signed out.
//
// The interesting part is decoy selection. The prompt is a chord name alone,
// so ANY fingering of that chord is a correct answer — which means every decoy
// has to be a different chord. Picking them at random would make the game
// trivial (a 5-note jazz grip next to an open major is obvious), so decoys are
// drawn from near-misses first: same root with a different quality, or the same
// quality rooted a fret or two away. Those look genuinely alike as diagrams.

import { CHORD_LIBRARY, NOTE_NAMES, type ChordCategory, type ChordDefinition } from "./chord-library.ts"
import {
  KIND_LABELS,
  describeShapePosition,
  getAllChordShapes,
  shapePitches,
  type CuratedShape,
} from "./chord-shapes.ts"
import { renderChordDiagramSVG, shapeToDiagram } from "./chord-diagram.ts"
import { noteColor } from "./note-colors.ts"
import { playPitches } from "./chord-audio.ts"

const ROUND_MS = 5000
const REVEAL_MS = 1400
const OPTION_COUNT = 4
const BEST_STREAK_KEY = "chord-suggester:best-streak"

// ── Filters ───────────────────────────────────────────────────────────────
export type ShapeFilter = "open" | "barre"
export type PositionBand = "low" | "mid" | "high"

export interface GameFilters {
  categories: Set<ChordCategory>
  shapes: Set<ShapeFilter>
  positions: Set<PositionBand>
}

function defaultFilters(): GameFilters {
  return {
    categories: new Set<ChordCategory>(["standard", "jazz", "technical"]),
    shapes: new Set<ShapeFilter>(["open", "barre"]),
    positions: new Set<PositionBand>(["low", "mid", "high"]),
  }
}

// An open shape is read from the nut; anything else is a movable (barre) form.
function shapeFilterOf(shape: CuratedShape): ShapeFilter {
  return shape.baseFret === 0 ? "open" : "barre"
}

function positionBandOf(shape: CuratedShape): PositionBand {
  if (shape.baseFret <= 4) return "low"
  if (shape.baseFret <= 9) return "mid"
  return "high"
}

// ── Candidates ────────────────────────────────────────────────────────────
interface Candidate {
  rootChroma: number
  chord: ChordDefinition
  shape: CuratedShape
  /** Fret pattern, used to keep two options from looking identical. */
  signature: string
}

function chordLabel(rootChroma: number, chord: ChordDefinition): string {
  const root = NOTE_NAMES[rootChroma]
  return chord.symbol ? `${root}${chord.symbol}` : `${root} ${chord.name.toLowerCase()}`
}

/** Every fingering of every chord that passes the current filters. */
export function buildPool(filters: GameFilters): Candidate[] {
  const pool: Candidate[] = []
  for (const chord of CHORD_LIBRARY) {
    if (!filters.categories.has(chord.category)) continue
    for (let rootChroma = 0; rootChroma < 12; rootChroma++) {
      for (const shape of getAllChordShapes(rootChroma, chord.id)) {
        if (!filters.shapes.has(shapeFilterOf(shape))) continue
        if (!filters.positions.has(positionBandOf(shape))) continue
        pool.push({ rootChroma, chord, shape, signature: shape.frets.join(",") })
      }
    }
  }
  return pool
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface Round {
  prompt: string
  answer: Candidate
  options: Candidate[]
}

/**
 * One round: a target plus three decoys of OTHER chords, ordered so the
 * closest-looking wrong answers are preferred. Returns null when the pool
 * can't yield enough distinct options.
 */
export function buildRound(pool: Candidate[]): Round | null {
  if (pool.length < OPTION_COUNT) return null

  const answer = pick(pool)
  const isSameChord = (c: Candidate) =>
    c.rootChroma === answer.rootChroma && c.chord.id === answer.chord.id

  // Anything that is not the prompted chord is a legitimate wrong answer.
  const wrong = pool.filter(c => !isSameChord(c))

  const sameRoot = shuffle(wrong.filter(c => c.rootChroma === answer.rootChroma))
  const sameQuality = shuffle(wrong.filter(c => c.chord.id === answer.chord.id))
  const rest = shuffle(wrong)

  const options: Candidate[] = [answer]
  const usedSignatures = new Set([answer.signature])
  // One chord may only appear once, or two options could both be "correct".
  const usedChords = new Set([`${answer.rootChroma}:${answer.chord.id}`])

  for (const candidate of [...sameRoot, ...sameQuality, ...rest]) {
    if (options.length === OPTION_COUNT) break
    const chordKey = `${candidate.rootChroma}:${candidate.chord.id}`
    if (usedChords.has(chordKey)) continue
    if (usedSignatures.has(candidate.signature)) continue
    usedChords.add(chordKey)
    usedSignatures.add(candidate.signature)
    options.push(candidate)
  }

  if (options.length < OPTION_COUNT) return null
  return { prompt: chordLabel(answer.rootChroma, answer.chord), answer, options: shuffle(options) }
}

// ── Game state ────────────────────────────────────────────────────────────
type Phase = "idle" | "playing" | "revealing" | "over"

interface Stats {
  score: number
  streak: number
  bestStreak: number
  rounds: number
}

function loadBestStreak(): number {
  try {
    return Number(localStorage.getItem(BEST_STREAK_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBestStreak(value: number) {
  try {
    localStorage.setItem(BEST_STREAK_KEY, String(value))
  } catch {
    // Private windows and blocked site data are fine — the streak is a nicety.
  }
}

const filters = defaultFilters()
let phase: Phase = "idle"
let stats: Stats = { score: 0, streak: 0, bestStreak: loadBestStreak(), rounds: 0 }
let round: Round | null = null
let roundTimer: number | null = null
let revealTimer: number | null = null
let root: HTMLElement | null = null

function clearTimers() {
  if (roundTimer !== null) clearTimeout(roundTimer)
  if (revealTimer !== null) clearTimeout(revealTimer)
  roundTimer = null
  revealTimer = null
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// ── Rendering ─────────────────────────────────────────────────────────────
function renderFilters(container: HTMLElement) {
  const groups: {
    label: string
    options: { value: string; label: string }[]
    set: Set<string>
  }[] = [
    {
      label: "Chords",
      options: [
        { value: "standard", label: "Standard" },
        { value: "jazz", label: "Jazz" },
        { value: "technical", label: "Technical" },
      ],
      set: filters.categories as Set<string>,
    },
    {
      label: "Shapes",
      options: [
        { value: "open", label: "Open" },
        { value: "barre", label: "Barre" },
      ],
      set: filters.shapes as Set<string>,
    },
    {
      label: "Neck",
      options: [
        { value: "low", label: "Frets 0–4" },
        { value: "mid", label: "Frets 5–9" },
        { value: "high", label: "Frets 10+" },
      ],
      set: filters.positions as Set<string>,
    },
  ]

  const bar = el("div", "game__filters")
  for (const group of groups) {
    const wrap = el("div", "game__filter-group")
    wrap.appendChild(el("span", "game__filter-label", group.label))
    for (const option of group.options) {
      const chip = el("button", "game__chip", option.label)
      chip.type = "button"
      chip.dataset.value = option.value
      const sync = () => {
        const on = group.set.has(option.value)
        chip.classList.toggle("is-on", on)
        chip.setAttribute("aria-pressed", String(on))
      }
      chip.addEventListener("click", () => {
        // Never let a group be emptied — an empty group means an empty pool.
        if (group.set.has(option.value)) {
          if (group.set.size === 1) return
          group.set.delete(option.value)
        } else {
          group.set.add(option.value)
        }
        sync()
        refreshStartState()
      })
      sync()
      wrap.appendChild(chip)
    }
    bar.appendChild(wrap)
  }
  container.appendChild(bar)
}

function refreshStartState() {
  if (!root) return
  const pool = buildPool(filters)
  const probe = buildRound(pool)
  const startBtn = root.querySelector<HTMLButtonElement>("#game-start")
  const note = root.querySelector<HTMLParagraphElement>("#game-pool-note")
  const ok = probe !== null
  if (startBtn) startBtn.disabled = !ok
  if (note) {
    if (ok) {
      note.textContent = `${pool.length} fingerings in the mix`
    } else if (
      // An open shape sits at fret 0 by definition, so asking for open chords
      // anywhere but the first few frets is a contradiction, not a near miss.
      filters.shapes.size === 1 &&
      filters.shapes.has("open") &&
      !filters.positions.has("low")
    ) {
      note.textContent = "Open chords only live at frets 0–4 — add that neck range, or turn on Barre."
    } else {
      note.textContent = "Not enough chords in that mix — turn another filter back on."
    }
  }
}

function renderScore() {
  if (!root) return
  const set = (id: string, value: string) => {
    const node = root!.querySelector(`#${id}`)
    if (node) node.textContent = value
  }
  set("game-score", String(stats.score))
  set("game-streak", String(stats.streak))
  set("game-best", String(stats.bestStreak))
  const accuracy = stats.rounds === 0 ? 0 : Math.round((stats.score / stats.rounds) * 100)
  set("game-accuracy", `${accuracy}%`)
}

function renderRound() {
  if (!root || !round) return
  const promptEl = root.querySelector<HTMLElement>("#game-prompt")
  const grid = root.querySelector<HTMLElement>("#game-options")
  const bar = root.querySelector<HTMLElement>("#game-timer-bar")
  if (!promptEl || !grid || !bar) return

  promptEl.textContent = round.prompt
  root.querySelector("#game-feedback")!.textContent = "Which fingering is it?"
  grid.innerHTML = ""

  round.options.forEach((candidate, index) => {
    const card = el("button", "game__option")
    card.type = "button"
    card.dataset.index = String(index)
    card.setAttribute("aria-label", `Option ${index + 1}`)

    const diagram = el("div", "game__option-diagram")
    const { voicing, window: win } = shapeToDiagram(candidate.shape)
    diagram.innerHTML = renderChordDiagramSVG(voicing, win, noteColor(candidate.rootChroma))

    const meta = el("p", "game__option-meta", describeShapePosition(candidate.shape))
    card.append(diagram, meta)
    card.addEventListener("click", () => answerRound(index))
    grid.appendChild(card)
  })

  // Restart the drain: jump to full width with no transition, then animate.
  bar.style.transition = "none"
  bar.style.transform = "scaleX(1)"
  void bar.offsetWidth
  bar.style.transition = `transform ${ROUND_MS}ms linear`
  bar.style.transform = "scaleX(0)"
}

// ── Round lifecycle ───────────────────────────────────────────────────────
function nextRound() {
  const pool = buildPool(filters)
  const next = buildRound(pool)
  if (!next) {
    phase = "idle"
    refreshStartState()
    return
  }
  round = next
  phase = "playing"
  renderRound()
  roundTimer = window.setTimeout(() => resolveRound(null), ROUND_MS)
}

function answerRound(index: number) {
  if (phase !== "playing") return
  resolveRound(index)
}

function resolveRound(chosenIndex: number | null) {
  if (!root || !round || phase !== "playing") return
  clearTimers()
  phase = "revealing"

  const answerIndex = round.options.indexOf(round.answer)
  const correct = chosenIndex === answerIndex

  stats.rounds += 1
  if (correct) {
    stats.score += 1
    stats.streak += 1
    if (stats.streak > stats.bestStreak) {
      stats.bestStreak = stats.streak
      saveBestStreak(stats.bestStreak)
    }
  } else {
    stats.streak = 0
  }

  // Freeze the timer bar where it stopped rather than letting it keep draining.
  const bar = root.querySelector<HTMLElement>("#game-timer-bar")
  if (bar) {
    const current = getComputedStyle(bar).transform
    bar.style.transition = "none"
    bar.style.transform = current === "none" ? "scaleX(0)" : current
  }

  const cards = root.querySelectorAll<HTMLButtonElement>(".game__option")
  cards.forEach((card, i) => {
    card.disabled = true
    if (i === answerIndex) card.classList.add("is-correct")
    else if (i === chosenIndex) card.classList.add("is-wrong")
  })

  const feedback = root.querySelector<HTMLElement>("#game-feedback")!
  const where = describeShapePosition(round.answer.shape)
  const form = KIND_LABELS[round.answer.shape.kind]
  if (correct) feedback.textContent = `Correct — ${where}, ${form}.`
  else if (chosenIndex === null) feedback.textContent = `Out of time — it was the ${where} ${form}.`
  else feedback.textContent = `Not quite — it was the ${where} ${form}.`

  playPitches(shapePitches(round.answer.shape.frets))
  renderScore()

  revealTimer = window.setTimeout(() => {
    if (phase === "revealing") nextRound()
  }, REVEAL_MS)
}

function startGame() {
  stats = { score: 0, streak: 0, bestStreak: stats.bestStreak, rounds: 0 }
  renderScore()
  if (root) {
    root.querySelector("#game-setup")!.classList.add("is-hidden")
    root.querySelector("#game-play")!.classList.remove("is-hidden")
  }
  nextRound()
}

function endGame() {
  clearTimers()
  phase = "idle"
  round = null
  if (!root) return
  root.querySelector("#game-setup")!.classList.remove("is-hidden")
  root.querySelector("#game-play")!.classList.add("is-hidden")
  const summary = root.querySelector<HTMLElement>("#game-summary")!
  if (stats.rounds > 0) {
    const accuracy = Math.round((stats.score / stats.rounds) * 100)
    summary.textContent = `Last run: ${stats.score}/${stats.rounds} (${accuracy}%) — best streak ${stats.bestStreak}.`
    summary.hidden = false
  }
  refreshStartState()
}

// ── Mount ─────────────────────────────────────────────────────────────────
function build(container: HTMLElement) {
  container.innerHTML = ""

  const header = el("div", "game__header")
  header.appendChild(el("h2", "game__title", "Beat the Clock"))
  const closeBtn = el("button", "game__close", "✕")
  closeBtn.type = "button"
  closeBtn.id = "game-close"
  closeBtn.setAttribute("aria-label", "Close the game")
  closeBtn.addEventListener("click", () => closeGame())
  header.appendChild(closeBtn)
  container.appendChild(header)

  // Setup view
  const setup = el("div", "game__setup")
  setup.id = "game-setup"
  setup.appendChild(
    el("p", "game__lede", "A chord name flashes. You get five seconds to pick its fingering."),
  )
  renderFilters(setup)
  const note = el("p", "game__pool-note")
  note.id = "game-pool-note"
  setup.appendChild(note)
  const summary = el("p", "game__summary")
  summary.id = "game-summary"
  summary.hidden = true
  setup.appendChild(summary)
  const startBtn = el("button", "btn btn--primary game__start", "Start")
  startBtn.type = "button"
  startBtn.id = "game-start"
  startBtn.addEventListener("click", () => startGame())
  setup.appendChild(startBtn)
  container.appendChild(setup)

  // Play view
  const play = el("div", "game__play is-hidden")
  play.id = "game-play"

  const prompt = el("p", "game__prompt")
  prompt.id = "game-prompt"
  play.appendChild(prompt)

  const timer = el("div", "game__timer")
  const bar = el("div", "game__timer-bar")
  bar.id = "game-timer-bar"
  timer.appendChild(bar)
  play.appendChild(timer)

  const feedback = el("p", "game__feedback")
  feedback.id = "game-feedback"
  play.appendChild(feedback)

  const grid = el("div", "game__options")
  grid.id = "game-options"
  play.appendChild(grid)

  const scoreRow = el("div", "game__scores")
  for (const [id, label] of [
    ["game-score", "Score"],
    ["game-streak", "Streak"],
    ["game-best", "Best"],
    ["game-accuracy", "Accuracy"],
  ]) {
    const cell = el("div", "game__score")
    cell.appendChild(el("span", "game__score-label", label))
    const value = el("span", "game__score-value", "0")
    value.id = id
    cell.appendChild(value)
    scoreRow.appendChild(cell)
  }
  play.appendChild(scoreRow)

  const endBtn = el("button", "btn btn--ghost game__end", "End run")
  endBtn.type = "button"
  endBtn.addEventListener("click", () => endGame())
  play.appendChild(endBtn)

  container.appendChild(play)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") closeGame()
}

export function openGame(container: HTMLElement) {
  root = container
  build(container)
  container.hidden = false
  document.body.classList.add("game-open")
  document.addEventListener("keydown", onKeyDown)
  renderScore()
  refreshStartState()
}

export function closeGame() {
  clearTimers()
  phase = "idle"
  round = null
  document.removeEventListener("keydown", onKeyDown)
  document.body.classList.remove("game-open")
  if (root) root.hidden = true
  root = null
}
