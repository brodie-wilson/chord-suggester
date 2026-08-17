import "./style.css"
import { PitchDetector, NoteSmoother } from "./pitch-detector.ts"
import {
  NOTE_NAMES,
  type ChordCategory,
  type ChordDefinition,
  getChordsForRoot,
  noteNameToChromaIndex,
} from "./chord-library.ts"
import {
  frequencyToMidiNote,
  suggestPosition,
  findNearbyPositions,
  formatPosition,
  OPEN_STRING_MIDI,
  type FretPosition,
} from "./fretboard.ts"
import { deriveVoicing, renderChordDiagramSVG, shapeToDiagram } from "./chord-diagram.ts"
import { getAllChordShapes } from "./chord-shapes.ts"
import { noteColor, noteColorSoft } from "./note-colors.ts"
import { renderGuitarWidget } from "./guitar-widget.ts"
import { playChord, playPitches, CHORD_DURATION_MS } from "./chord-audio.ts"

// ── Element refs ─────────────────────────────────────────────────────────
const micBtn = document.querySelector<HTMLButtonElement>("#mic-btn")!
const deviceSelect = document.querySelector<HTMLSelectElement>("#device-select")!
const detectedNoteEl = document.querySelector<HTMLSpanElement>("#detected-note")!
const positionDisplay = document.querySelector<HTMLDivElement>("#position-display")!
const positionValue = document.querySelector<HTMLSpanElement>("#position-value")!
const confidenceMeter = document.querySelector<HTMLDivElement>("#confidence-meter")!
const confidenceValue = document.querySelector<HTMLSpanElement>("#confidence-value")!
const inputStatus = document.querySelector<HTMLParagraphElement>("#input-status")!
const chordGrid = document.querySelector<HTMLDivElement>("#chord-grid")!
const atHint = document.querySelector<HTMLParagraphElement>("#at-hint")!
const atControls = document.querySelector<HTMLDivElement>("#at-controls")!
const atQueue = document.querySelector<HTMLDivElement>("#at-queue")!
const projectUrlInput = document.querySelector<HTMLInputElement>("#project-url")!
const openProjectBtn = document.querySelector<HTMLButtonElement>("#open-project-btn")!
const lastSentChord = document.querySelector<HTMLParagraphElement>("#last-sent-chord")!
const atStatus = document.querySelector<HTMLParagraphElement>("#at-status")!
const serverDot = document.querySelector<HTMLSpanElement>("#server-dot")!
const serverLabel = document.querySelector<HTMLSpanElement>("#server-label")!
const guitarWidgetEl = document.querySelector<HTMLDivElement>("#guitar-widget")!
const inputSourceToggle = document.querySelector<HTMLButtonElement>("#input-source-toggle")!
const micInputView = document.querySelector<HTMLDivElement>("#mic-input-view")!
const guitarInputView = document.querySelector<HTMLDivElement>("#guitar-input-view")!
const micStatusView = document.querySelector<HTMLDivElement>("#mic-status-view")!
const positionsGrid = document.querySelector<HTMLDivElement>("#positions-grid")!
const positionsHint = document.querySelector<HTMLParagraphElement>("#positions-hint")!
const positionsChord = document.querySelector<HTMLSpanElement>("#positions-chord")!

// ── State ─────────────────────────────────────────────────────────────────
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let stream: MediaStream | null = null
let pitchDetector: PitchDetector | null = null
const smoother = new NoteSmoother(10, 0.55)
let isListening = false
let currentCategory: ChordCategory = "standard"
let currentRootIndex = -1
let currentPosition: FretPosition | null = null
let audioLoop: number | null = null
let projectIsOpen = false
let floatBuf = new Float32Array(8192)
/** Chord whose positions the "All positions" panel is showing, if any. */
let positionsChordId: string | null = null

// ── Audio capture ─────────────────────────────────────────────────────────
async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices.filter(d => d.kind === "audioinput")
    deviceSelect.innerHTML = ""
    if (!inputs.length) {
      deviceSelect.innerHTML = "<option>No input devices found</option>"
      deviceSelect.disabled = true
      return
    }
    inputs.forEach((d, i) => {
      const opt = document.createElement("option")
      opt.value = d.deviceId
      opt.textContent = d.label || `Input ${i + 1}`
      deviceSelect.appendChild(opt)
    })
    deviceSelect.disabled = false
  } catch {
    /* permissions not yet granted */
  }
}

async function startListening() {
  inputStatus.textContent = "Requesting microphone access…"
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceSelect.value || undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  } catch (err) {
    inputStatus.textContent = `Could not access microphone: ${(err as Error).message}`
    return
  }

  audioContext = new AudioContext()
  analyser = audioContext.createAnalyser()
  // 8192 gives low strings (~82Hz) roughly twice as many full periods as
  // 4096 did — the standard remedy for unreliable low-frequency tracking.
  analyser.fftSize = 8192
  analyser.smoothingTimeConstant = 0
  audioContext.createMediaStreamSource(stream).connect(analyser)
  pitchDetector = new PitchDetector(analyser, audioContext)
  floatBuf = new Float32Array(analyser.fftSize)
  smoother.reset()
  isListening = true
  micBtn.textContent = "Stop listening"
  micBtn.classList.add("is-active")
  inputStatus.textContent = `Listening — ${audioContext.sampleRate}Hz`
  await listDevices()
  scheduleDetection()
}

function stopListening() {
  if (audioLoop !== null) cancelAnimationFrame(audioLoop)
  stream?.getTracks().forEach(t => t.stop())
  void audioContext?.close()
  stream = null
  audioContext = null
  analyser = null
  pitchDetector = null
  isListening = false
  smoother.reset()
  currentRootIndex = -1
  currentPosition = null
  positionDisplay.hidden = true
  micBtn.textContent = "Start listening"
  micBtn.classList.remove("is-active")
  inputStatus.textContent = "Idle — waiting for input"
  detectedNoteEl.textContent = "—"
  confidenceMeter.style.width = "0%"
  confidenceValue.textContent = "—"
}

micBtn.addEventListener("click", () => {
  if (isListening) stopListening()
  else void startListening()
})

void listDevices()
navigator.mediaDevices?.addEventListener?.("devicechange", () => void listDevices())

// ── Note selection ───────────────────────────────────────────────────────
// Shared by both the mic pitch detector and the clickable cartoon guitar —
// either way we end up with a chroma (root note) and a fretboard position,
// the only difference being whether that position was guessed or exact.
function selectNote(chroma: number, position: FretPosition | null) {
  currentRootIndex = chroma
  detectedNoteEl.textContent = NOTE_NAMES[chroma]
  detectedNoteEl.style.color = noteColor(chroma)
  detectedNoteEl.classList.add("is-fresh")
  setTimeout(() => detectedNoteEl.classList.remove("is-fresh"), 300)

  currentPosition = position
  if (position) {
    positionDisplay.hidden = false
    positionValue.textContent = formatPosition(position)
  } else {
    positionDisplay.hidden = true
  }

  renderChords(chroma, currentCategory, currentPosition)
}

// ── Detection loop ────────────────────────────────────────────────────────
function scheduleDetection() {
  audioLoop = requestAnimationFrame(() => {
    if (!isListening || !analyser || !pitchDetector) return
    analyser.getFloatTimeDomainData(floatBuf)
    const result = pitchDetector.process(floatBuf)
    const smoothed = smoother.push(result.noteIndex, result.confidence)

    const pct = Math.round(result.confidence * 100)
    confidenceMeter.style.width = `${pct}%`
    confidenceValue.textContent = `${pct}%`

    // Only update when a genuinely new, confident note arrives. Silence or
    // low confidence (note decay, gaps between notes, pick noise) is ignored
    // rather than clearing the display — the last note stays on screen.
    if (smoothed >= 0 && smoothed !== currentRootIndex) {
      const midiNote = frequencyToMidiNote(result.frequency)
      const guessedPosition = suggestPosition(midiNote, currentPosition)
      selectNote(smoothed, guessedPosition)
    }

    scheduleDetection()
  })
}

// ── Cartoon guitar (no physical guitar needed) ──────────────────────────
renderGuitarWidget(guitarWidgetEl, (position, chroma) => {
  selectNote(chroma, position)
})

// The mic and guitar are two alternative ways to pick the same root note, so
// they share the Input card's slot instead of taking up separate panels.
const INPUT_SOURCE_KEY = "chord-suggester:input-source"
let inputSource: "mic" | "guitar" = localStorage.getItem(INPUT_SOURCE_KEY) === "guitar" ? "guitar" : "mic"

function applyInputSource() {
  const isGuitar = inputSource === "guitar"
  micInputView.hidden = isGuitar
  micStatusView.hidden = isGuitar
  guitarInputView.hidden = !isGuitar
  inputSourceToggle.textContent = isGuitar ? "🎤" : "🎸"
  inputSourceToggle.setAttribute("aria-label", isGuitar ? "Switch to microphone input" : "Switch to guitar input")
}

inputSourceToggle.addEventListener("click", () => {
  // Switching away from the mic should free it rather than leave it capturing
  // silently in the background while its controls are hidden.
  if (inputSource === "mic" && isListening) stopListening()
  inputSource = inputSource === "mic" ? "guitar" : "mic"
  localStorage.setItem(INPUT_SOURCE_KEY, inputSource)
  applyInputSource()
})

applyInputSource()

// ── All positions ─────────────────────────────────────────────────────────
function ordinal(n: number): string {
  const teen = n % 100
  if (teen >= 11 && teen <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

// The CAGED forms — every shape is one of the five open chords moved up.
const KIND_LABELS: Record<string, string> = {
  "c-shape": "C shape",
  "a-shape": "A shape",
  "g-shape": "G shape",
  "e-shape": "E shape",
  "d-shape": "D shape",
}

/** The actual sounding pitches of a fingering, low string to high. */
function shapePitches(frets: (number | null)[]): number[] {
  return frets
    .map((fret, string) => (fret === null ? null : OPEN_STRING_MIDI[string] + fret))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
}

function renderPositions() {
  if (positionsChordId === null || currentRootIndex < 0) return

  const chord = getChordsForRoot(currentRootIndex, currentCategory).find(
    c => c.chord.id === positionsChordId,
  )
  // The chosen chord lives in whichever category tab was open at the time;
  // switching tabs can leave it out of view, so drop the panel rather than
  // show positions for a chord that's no longer on screen.
  if (!chord) {
    clearPositions()
    return
  }

  const rootName = NOTE_NAMES[currentRootIndex]
  const shapes = getAllChordShapes(currentRootIndex, chord.chord.id)
  // Major has no symbol of its own, so spell it out rather than render "CMajor".
  positionsChord.textContent = chord.chord.symbol
    ? `${rootName}${chord.chord.symbol}`
    : `${rootName} ${chord.chord.name.toLowerCase()}`
  positionsHint.textContent = `${shapes.length} way${shapes.length === 1 ? "" : "s"} to play it — same chord, different spots on the neck.`

  positionsGrid.innerHTML = ""
  for (const shape of shapes) {
    const card = document.createElement("div")
    card.className = "position-card"

    const label = document.createElement("p")
    label.className = "position-card__label"
    label.textContent = shape.baseFret === 0 ? "Open position" : `${ordinal(shape.baseFret)} position`

    const kind = document.createElement("p")
    kind.className = "position-card__kind"
    kind.textContent = KIND_LABELS[shape.kind] ?? ""

    const diagram = document.createElement("div")
    diagram.className = "position-card__diagram"
    const { voicing, window: win } = shapeToDiagram(shape)
    diagram.innerHTML = renderChordDiagramSVG(voicing, win, noteColor(currentRootIndex))

    // Each position sends its own voicing, so an open C and a C up at the
    // 8th fret arrive in Audiotool in the octaves you'd actually play them.
    const pitches = shapePitches(shape.frets)
    const positionName = shape.baseFret === 0 ? "open" : `${ordinal(shape.baseFret)} pos`

    const actions = document.createElement("div")
    actions.className = "position-card__actions"

    const listenBtn = document.createElement("button")
    listenBtn.className = "btn btn--listen"
    listenBtn.type = "button"
    listenBtn.textContent = "🔊"
    listenBtn.title = "Hear this position"
    listenBtn.setAttribute("aria-label", `Hear ${positionName}`)
    listenBtn.addEventListener("click", () => {
      playPitches(pitches)
      listenBtn.disabled = true
      setTimeout(() => { listenBtn.disabled = false }, CHORD_DURATION_MS)
    })

    const sendBtn = document.createElement("button")
    sendBtn.className = "btn btn--send"
    sendBtn.type = "button"
    sendBtn.textContent = "Send"
    sendBtn.setAttribute("aria-label", `Send ${positionName} to Audiotool`)
    sendBtn.addEventListener("click", () =>
      void sendChordToAudiotool(rootName, chord.chord, chord.notes, sendBtn, {
        pitches,
        nameSuffix: ` (${positionName})`,
      }),
    )

    actions.append(listenBtn, sendBtn)
    card.append(label, kind, diagram, actions)
    positionsGrid.appendChild(card)
  }
}

function clearPositions() {
  positionsChordId = null
  positionsGrid.innerHTML = ""
  positionsChord.textContent = ""
  positionsHint.innerHTML =
    "Pick <strong>All positions</strong> on any chord above to see every way to play it up the neck."
}

// ── Chord rendering ───────────────────────────────────────────────────────
function renderChords(rootIndex: number, category: ChordCategory, position: FretPosition | null) {
  const rootName = NOTE_NAMES[rootIndex]
  const chords = getChordsForRoot(rootIndex, category)
  chordGrid.innerHTML = ""
  chords.forEach(({ chord, notes }) => {
    chordGrid.appendChild(buildChordCard(rootName, chord, notes, position))
  })
  // Keep the positions panel in step with whatever root is now detected.
  renderPositions()
}

function buildChordCard(
  rootName: string,
  chord: ChordDefinition,
  notes: string[],
  position: FretPosition | null,
): HTMLElement {
  const card = document.createElement("div")
  card.className = "chord-card"
  card.dataset.category = chord.category

  const header = document.createElement("div")
  header.className = "chord-card__header"
  const rootSpan = document.createElement("span")
  rootSpan.className = "chord-card__root"
  rootSpan.textContent = rootName
  const symbolSpan = document.createElement("span")
  symbolSpan.className = "chord-card__symbol"
  symbolSpan.textContent = chord.symbol
  header.append(rootSpan, symbolSpan)

  const name = document.createElement("p")
  name.className = "chord-card__name"
  name.textContent = chord.name

  const notePills = document.createElement("div")
  notePills.className = "chord-card__notes"
  notes.forEach(n => {
    const pill = document.createElement("span")
    pill.className = "chord-card__note-pill"
    const chroma = noteNameToChromaIndex(n)
    pill.style.color = noteColor(chroma)
    pill.style.backgroundColor = noteColorSoft(chroma)
    pill.style.borderColor = noteColor(chroma, 68, 80)

    const nameSpan = document.createElement("span")
    nameSpan.className = "chord-card__note-pill-name"
    nameSpan.textContent = n
    pill.appendChild(nameSpan)

    if (position) {
      const nearby = findNearbyPositions(chroma, position.fret, 4)
      if (nearby.length > 0) {
        const posSpan = document.createElement("span")
        posSpan.className = "chord-card__note-pill-position"
        posSpan.textContent = formatPosition(nearby[0])
        pill.appendChild(posSpan)
      }
    }
    notePills.appendChild(pill)
  })

  const chordChromas = notes.map(n => noteNameToChromaIndex(n))
  const { voicing, window: win } = deriveVoicing(chordChromas[0], chord.id, position?.fret ?? 0)
  const diagramWrapper = document.createElement("div")
  diagramWrapper.className = "chord-card__diagram"
  diagramWrapper.innerHTML = renderChordDiagramSVG(voicing, win, noteColor(chordChromas[0]))

  const desc = document.createElement("p")
  desc.className = "chord-card__description"
  desc.textContent = chord.description

  const posNote = document.createElement("p")
  posNote.className = "chord-card__position-note"
  posNote.textContent = win.openPosition
    ? "Shown in open position — the same chord has other shapes further up the neck."
    : `Shown as a standard fingering near fret ${win.start} — the same chord has other shapes too.`

  const teaching = document.createElement("p")
  teaching.className = "chord-card__teaching"
  teaching.textContent = `💡 ${chord.teachingNote}`

  const footer = document.createElement("div")
  footer.className = "chord-card__footer"
  const listenBtn = document.createElement("button")
  listenBtn.className = "btn btn--listen"
  listenBtn.type = "button"
  listenBtn.textContent = "🔊 Listen"
  listenBtn.addEventListener("click", () => {
    playChord(notes)
    listenBtn.disabled = true
    listenBtn.textContent = "♪ Playing…"
    setTimeout(() => {
      listenBtn.disabled = false
      listenBtn.textContent = "🔊 Listen"
    }, CHORD_DURATION_MS)
  })
  const positionsBtn = document.createElement("button")
  positionsBtn.className = "btn btn--positions"
  positionsBtn.type = "button"
  positionsBtn.textContent = "All positions"
  positionsBtn.addEventListener("click", () => {
    positionsChordId = chord.id
    renderPositions()
    document.querySelector("#positions-grid")?.scrollIntoView({ behavior: "smooth", block: "center" })
  })
  const sendBtn = document.createElement("button")
  sendBtn.className = "btn btn--send"
  sendBtn.textContent = "Send to Audiotool"
  sendBtn.addEventListener("click", () => void sendChordToAudiotool(rootName, chord, notes, sendBtn))
  footer.append(listenBtn, positionsBtn, sendBtn)

  card.append(header, name, diagramWrapper, notePills, posNote, desc, teaching, footer)
  return card
}

// ── Category tabs ─────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.remove("is-active")
      t.setAttribute("aria-selected", "false")
    })
    tab.classList.add("is-active")
    tab.setAttribute("aria-selected", "true")
    currentCategory = tab.dataset.category as ChordCategory
    if (currentRootIndex >= 0) renderChords(currentRootIndex, currentCategory, currentPosition)
  })
})

// ── Audiotool via the local bridge server ────────────────────────────────
// The browser SDK's OAuth login needs eval/WASM that some locked-down
// environments block outright. All Audiotool work is done by
// scripts/chord-server.mjs running in Node instead, which has no such
// restriction. The browser just makes plain fetch calls to it.

function bridgeErrorMessage(err: Error): string {
  const msg = err.message ?? String(err)
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("load failed")
  ) {
    return "Can't reach the local server. Start it in a second terminal: AUDIOTOOL_PAT=your_token npm run server"
  }
  return `Error: ${msg}`
}

async function checkServer() {
  try {
    const res = await fetch("/api/status")
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json()
    serverDot.classList.add("is-online")
    serverLabel.textContent = "Server connected"
    if (data.projectOpen && data.project) {
      projectIsOpen = true
      if (!projectUrlInput.value.trim()) projectUrlInput.value = data.project
      atStatus.textContent = "Project already open — click any chord to send it"
      atQueue.hidden = false
    } else if (!projectIsOpen) {
      atStatus.textContent = "Server ready — paste a project URL and click Open"
    }
  } catch {
    serverDot.classList.remove("is-online")
    serverLabel.textContent = "Server offline"
    atStatus.textContent =
      "Local server not running. In a second terminal: AUDIOTOOL_PAT=your_token npm run server"
  }
}

openProjectBtn.addEventListener("click", async () => {
  const url = projectUrlInput.value.trim()
  if (!url) return

  // The sync protocol only works against beta.audiotool.com — easy mix-up
  // since the domains look so similar, so catch it before a failed attempt.
  if (url.includes("www.audiotool.com")) {
    atStatus.textContent =
      "That's a www.audiotool.com link — swap it for the same project on beta.audiotool.com."
    return
  }

  atStatus.textContent = "Opening project…"
  openProjectBtn.disabled = true
  try {
    const res = await fetch("/api/open-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectUrl: url }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)

    projectIsOpen = true
    atStatus.textContent = "Project open — click any chord card to send it to your workspace"
    atQueue.hidden = false
  } catch (err) {
    atStatus.textContent = bridgeErrorMessage(err as Error)
  } finally {
    openProjectBtn.disabled = false
  }
})

async function sendChordToAudiotool(
  rootName: string,
  chord: ChordDefinition,
  notes: string[],
  btn: HTMLButtonElement,
  opts: { pitches?: number[]; nameSuffix?: string } = {},
) {
  const projectUrl = projectUrlInput.value.trim()
  if (!projectUrl) {
    atStatus.textContent = "Paste a project URL and click Open first."
    return
  }
  if (!projectIsOpen) {
    atStatus.textContent = "Click Open first to connect to the project."
    return
  }

  const chordName = `${rootName}${chord.symbol || chord.name}${opts.nameSuffix ?? ""}`
  const originalText = btn.textContent
  btn.textContent = "Sending…"
  btn.disabled = true
  try {
    const res = await fetch("/api/send-chord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectUrl, chordName, notes, pitches: opts.pitches }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)

    lastSentChord.textContent = chordName
    atQueue.hidden = false
    atStatus.textContent = `Sent ${chordName} to your workspace ✓`
    btn.textContent = "Sent ✓"
    setTimeout(() => {
      btn.textContent = originalText
    }, 1200)
  } catch (err) {
    atStatus.textContent = bridgeErrorMessage(err as Error)
    btn.textContent = originalText
  } finally {
    btn.disabled = false
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
atControls.hidden = false
atHint.textContent =
  "Paste a beta.audiotool.com project URL and click Open, then send any chord straight into your workspace."
void checkServer()
setInterval(() => void checkServer(), 10000)
