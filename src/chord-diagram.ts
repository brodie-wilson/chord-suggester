// Produces the fretboard shape shown under each chord card, using the
// curated, real chord shapes in chord-shapes.ts. A chord has 2-3 real
// shapes spread across the neck (open, and one or two barred positions);
// this picks whichever one sits closest to the fret you actually played, so
// the diagram reflects where on the neck you're currently playing — the
// same chord shows up differently in open position vs. further up — while
// every option shown is still a real, correct, hand-checked fingering.

import { getChordShape, type CuratedShape } from "./chord-shapes.ts"

export interface ChordVoicing {
  frets: (number | null)[]
  rootStringIndex: number | null
}

export interface DiagramWindow {
  openPosition: boolean
  start: number
}

export function deriveVoicing(
  rootChroma: number,
  chordId: string,
  anchorFret: number,
): { voicing: ChordVoicing; window: DiagramWindow } {
  const shape = getChordShape(rootChroma, chordId, anchorFret)
  if (!shape) {
    // Every chord in CHORD_LIBRARY has a curated shape (verified by
    // scripts/audit-shapes.ts during development) — this is only a safety
    // net in case that ever falls out of sync.
    return { voicing: { frets: new Array(6).fill(null), rootStringIndex: null }, window: { openPosition: true, start: 0 } }
  }
  const window: DiagramWindow = { openPosition: shape.baseFret === 0, start: shape.baseFret }
  return { voicing: { frets: shape.frets, rootStringIndex: shape.rootStringIndex }, window }
}

/** Turn any curated shape into the pair the renderer expects. */
export function shapeToDiagram(shape: CuratedShape): {
  voicing: ChordVoicing
  window: DiagramWindow
} {
  return {
    voicing: { frets: shape.frets, rootStringIndex: shape.rootStringIndex },
    window: { openPosition: shape.baseFret === 0, start: shape.baseFret },
  }
}

/**
 * Finds the flattened finger in a shape. Two cases occur in real fingerings:
 * a full barre at the shape's lowest fret (the index laid across the neck,
 * as in every E/A-shape barre chord), or a partial barre *above* the lowest
 * note (as in C9 = x-3-2-3-3-3, where the ring finger flattens across the
 * top three strings while the index takes the D string a fret below).
 */
function findBarre(frets: (number | null)[], openPosition: boolean): number[] {
  const fretted = frets
    .map((fret, string) => ({ fret, string }))
    .filter((v): v is { fret: number; string: number } => v.fret !== null && v.fret > 0)
  if (openPosition || fretted.length === 0) return []

  // The classic full barre: the index laid across every string sharing the
  // shape's lowest fret, as in any E/A-shape barre chord.
  const lowest = Math.min(...fretted.map(v => v.fret))
  const onLowest = fretted.filter(v => v.fret === lowest).map(v => v.string)
  if (onLowest.length >= 2) return onLowest

  // Otherwise only flatten a finger when the shape genuinely needs it —
  // more stopped notes than a hand has fingers, as in C9 = x-3-2-3-3-3,
  // where the ring finger covers the top three strings.
  if (fretted.length <= 4) return []
  let best: number[] = []
  for (const target of new Set(fretted.map(v => v.fret))) {
    let run: number[] = []
    for (let s = 0; s < 6; s++) {
      if (frets[s] === target) {
        run.push(s)
        if (run.length > best.length) best = [...run]
      } else {
        run = []
      }
    }
  }
  return best.length >= 2 ? best : []
}

/**
 * Numbers the fingers. Every stopped note — and the barre, counted once —
 * is ordered by fret, so the hand reads naturally from the nut upward. For
 * the A-major barre at fret 5 that gives index barre, 2 on the G string,
 * then 3 and 4 on the A and D strings, matching the standard fingering;
 * for C9 it gives index on the D string, middle on the A, then the ring
 * finger barring the top three.
 */
function assignFingers(frets: (number | null)[], barreStrings: number[]): Map<number, number> {
  const fingers = new Map<number, number>()
  const barreFret = barreStrings.length ? frets[barreStrings[0]]! : null

  type Unit = { fret: number; strings: number[]; isBarre: boolean; string: number }
  const units: Unit[] = frets
    .map((fret, string) => ({ fret, string }))
    .filter((v): v is { fret: number; string: number } => v.fret !== null && v.fret > 0)
    .filter(v => !barreStrings.includes(v.string))
    .map(v => ({ fret: v.fret, strings: [v.string], isBarre: false, string: v.string }))

  if (barreFret !== null) {
    units.push({ fret: barreFret, strings: barreStrings, isBarre: true, string: Math.min(...barreStrings) })
  }

  // Within one fret a single stopped note is taken before a barre, since the
  // flattened finger has to sit behind the fingers already committed.
  units.sort(
    (a, b) => a.fret - b.fret || Number(a.isBarre) - Number(b.isBarre) || a.string - b.string,
  )

  let next = 1
  for (const unit of units) {
    if (next > 4) break
    for (const s of unit.strings) fingers.set(s, next)
    next++
  }
  return fingers
}

export function renderChordDiagramSVG(
  voicing: ChordVoicing,
  window: DiagramWindow,
  rootDotColor: string,
): string {
  const stringXs = [46, 72, 98, 124, 150, 176]
  const markerY = 19
  const gridTop = 34
  const rowHeight = 31
  const rows = 5
  const gridBottom = gridTop + rows * rowHeight
  const width = 200
  const height = gridBottom + 10
  const left = stringXs[0]
  const right = stringXs[5]
  // Deep sepia rather than black — reads as ink on the parchment panels.
  const ink = "#2c1e10"

  const rowCentre = (fret: number) => {
    const rowIndex = window.openPosition ? fret : fret - window.start + 1
    return gridTop + (rowIndex - 0.5) * rowHeight
  }

  // The flattened finger is drawn as one solid bar rather than as separate
  // dots, which would read as an impossible four-finger stretch.
  const frettedNotes = voicing.frets
    .map((fret, string) => ({ fret, string }))
    .filter((v): v is { fret: number; string: number } => v.fret !== null && v.fret > 0)
  const barreStrings = findBarre(voicing.frets, window.openPosition)
  const barreFret = barreStrings.length ? voicing.frets[barreStrings[0]]! : 0
  const fingers = assignFingers(voicing.frets, barreStrings)

  const parts: string[] = []

  for (let r = 0; r <= rows; r++) {
    const y = gridTop + r * rowHeight
    parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${ink}" stroke-width="2" />`)
  }
  stringXs.forEach(x => {
    parts.push(`<line x1="${x}" y1="${gridTop}" x2="${x}" y2="${gridBottom}" stroke="${ink}" stroke-width="2" />`)
  })

  if (window.openPosition) {
    // Thick nut, the visual cue that this shape is played at the very top
    // of the neck rather than barred somewhere up it.
    parts.push(
      `<rect x="${left - 1}" y="${gridTop - 6}" width="${right - left + 2}" height="7" rx="2" fill="${ink}" />`,
    )
  } else {
    parts.push(
      `<text x="${left - 14}" y="${gridTop + rowHeight * 0.5 + 9}" font-size="26" font-weight="700" fill="${ink}" text-anchor="end">${window.start}</text>`,
    )
  }

  voicing.frets.forEach((fret, i) => {
    const x = stringXs[i]
    if (fret === null) {
      parts.push(
        `<text x="${x}" y="${markerY}" font-size="19" fill="${ink}" text-anchor="middle" font-weight="700">&#215;</text>`,
      )
    } else if (fret === 0) {
      parts.push(
        `<circle cx="${x}" cy="${markerY - 6}" r="7" fill="none" stroke="${ink}" stroke-width="2" />`,
      )
    }
  })

  if (barreStrings.length > 0) {
    const from = stringXs[Math.min(...barreStrings)]
    const to = stringXs[Math.max(...barreStrings)]
    const cy = rowCentre(barreFret)
    parts.push(
      `<rect x="${from - 11}" y="${cy - 11}" width="${to - from + 22}" height="22" rx="11" fill="${ink}" />`,
    )
    const barreFinger = fingers.get(barreStrings[0])
    if (barreFinger) {
      parts.push(
        `<text x="${(from + to) / 2}" y="${cy + 5}" font-size="14" font-weight="700" fill="#fff6e2" text-anchor="middle">${barreFinger}</text>`,
      )
    }
  }

  frettedNotes.forEach(({ fret, string }) => {
    if (barreStrings.includes(string)) return
    const x = stringXs[string]
    const cy = rowCentre(fret)
    const isRoot = string === voicing.rootStringIndex
    const finger = fingers.get(string)
    parts.push(
      `<circle cx="${x}" cy="${cy}" r="11" fill="${isRoot ? rootDotColor : ink}" />`,
    )
    if (finger) {
      parts.push(
        `<text x="${x}" y="${cy + 5}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">${finger}</text>`,
      )
    }
  })

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block">${parts.join("")}</svg>`
}
