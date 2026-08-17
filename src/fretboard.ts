// Fretboard position modelling.
//
// HONESTY NOTE: a single-channel audio signal (regular pickup or mic) cannot
// tell us which string a note was physically played on — the same pitch is
// reachable on multiple strings/frets. So this module does NOT detect
// position, it SUGGESTS the most likely one using two heuristics real
// guitarists use: prefer positions close to what you just played (smooth hand
// movement), and with no prior context prefer lower frets.

export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const
export const STRING_NAMES = ["Low E (6)", "A (5)", "D (4)", "G (3)", "B (2)", "High E (1)"] as const

const MAX_FRET = 15

export interface FretPosition {
  stringIndex: number
  fret: number
}

export function frequencyToMidiNote(freq: number): number {
  if (freq <= 0) return -1
  return Math.round(69 + 12 * Math.log2(freq / 440))
}

export function findPositionsForMidiNote(midiNote: number): FretPosition[] {
  const positions: FretPosition[] = []
  OPEN_STRING_MIDI.forEach((openMidi, stringIndex) => {
    const fret = midiNote - openMidi
    if (fret >= 0 && fret <= MAX_FRET) positions.push({ stringIndex, fret })
  })
  return positions
}

export function suggestPosition(midiNote: number, previous: FretPosition | null): FretPosition | null {
  const candidates = findPositionsForMidiNote(midiNote)
  if (candidates.length === 0) return null

  if (previous) {
    let best = candidates[0]
    let bestScore = Infinity
    for (const candidate of candidates) {
      const fretDistance = Math.abs(candidate.fret - previous.fret)
      const stringDistance = Math.abs(candidate.stringIndex - previous.stringIndex)
      const score = fretDistance + stringDistance * 0.5
      if (score < bestScore) {
        bestScore = score
        best = candidate
      }
    }
    return best
  }

  return candidates.reduce((lowest, c) => (c.fret < lowest.fret ? c : lowest), candidates[0])
}

export function findNearbyPositions(
  noteIndex: number,
  anchorFret: number,
  handSpanFrets = 4,
): FretPosition[] {
  const minFret = Math.max(0, anchorFret - handSpanFrets)
  const maxFret = Math.min(MAX_FRET, anchorFret + handSpanFrets)

  const results: FretPosition[] = []
  OPEN_STRING_MIDI.forEach((openMidi, stringIndex) => {
    for (let fret = minFret; fret <= maxFret; fret++) {
      const midi = openMidi + fret
      if ((((midi % 12) + 12) % 12) === noteIndex) results.push({ stringIndex, fret })
    }
  })

  results.sort((a, b) => Math.abs(a.fret - anchorFret) - Math.abs(b.fret - anchorFret))
  return results
}

export function formatPosition(pos: FretPosition): string {
  const stringLabel = STRING_NAMES[pos.stringIndex]
  return pos.fret === 0 ? `${stringLabel} open` : `${stringLabel} fret ${pos.fret}`
}
