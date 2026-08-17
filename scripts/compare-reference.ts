// Diffs the curated shapes against known-canonical fingerings — the ones a
// reference wall chart prints. Only chords with one settled standard form
// are asserted; anything the chart shows as a judgement call is skipped.

import { NOTE_NAMES } from "../src/chord-library.ts"
import { getAllChordShapes } from "../src/chord-shapes.ts"
import { OPEN_STRING_MIDI } from "../src/fretboard.ts"

const CANON: Array<[string, string, string]> = [
  // [root, chordId, expected fingering low-E → high-E, x = muted]
  ["A", "major", "x-0-2-2-2-0"], ["A", "minor", "x-0-2-2-1-0"], ["A", "dom7", "x-0-2-0-2-0"],
  ["A", "min7", "x-0-2-0-1-0"], ["A", "maj7", "x-0-2-1-2-0"], ["A", "sixth", "x-0-2-2-2-2"],
  ["A", "sus4", "x-0-2-2-3-0"],
  ["C", "major", "x-3-2-0-1-0"], ["C", "dom7", "x-3-2-3-1-0"], ["C", "maj7", "x-3-2-0-0-0"],
  ["C", "sixth", "x-3-2-2-1-0"],
  ["D", "major", "x-x-0-2-3-2"], ["D", "minor", "x-x-0-2-3-1"], ["D", "dom7", "x-x-0-2-1-2"],
  ["D", "min7", "x-x-0-2-1-1"], ["D", "maj7", "x-x-0-2-2-2"], ["D", "sixth", "x-x-0-2-0-2"],
  ["D", "sus4", "x-x-0-2-3-3"],
  ["E", "major", "0-2-2-1-0-0"], ["E", "minor", "0-2-2-0-0-0"], ["E", "dom7", "0-2-0-1-0-0"],
  ["E", "min7", "0-2-0-0-0-0"], ["E", "maj7", "0-2-1-1-0-0"], ["E", "sus4", "0-2-2-2-0-0"],
  ["G", "major", "3-2-0-0-0-3"], ["G", "dom7", "3-2-0-0-0-1"], ["G", "maj7", "3-2-0-0-0-2"],
  ["G", "sixth", "3-2-0-0-0-0"],
  // Movable barre forms the chart prints for roots with no open shape.
  ["F", "major", "1-3-3-2-1-1"], ["F", "minor", "1-3-3-1-1-1"], ["F", "dom7", "1-3-1-2-1-1"],
  ["F", "min7", "1-3-1-1-1-1"], ["F", "maj7", "1-3-2-2-1-1"],
  ["B", "major", "x-2-4-4-4-2"], ["B", "minor", "x-2-4-4-3-2"], ["B", "dom7", "x-2-4-2-4-2"],
  ["A#", "major", "x-1-3-3-3-1"], ["A#", "minor", "x-1-3-3-2-1"],
  ["F#", "major", "2-4-4-3-2-2"], ["F#", "minor", "2-4-4-2-2-2"],
  ["G#", "major", "4-6-6-5-4-4"], ["C#", "minor", "x-4-6-6-5-4"],
]

const fmt = (frets: (number | null)[]) => frets.map(f => (f === null ? "x" : f)).join("-")

let pass = 0
const fails: string[] = []

for (const [rootName, chordId, expected] of CANON) {
  const root = NOTE_NAMES.indexOf(rootName)
  const shapes = getAllChordShapes(root, chordId)
  const match = shapes.find(s => fmt(s.frets) === expected)
  if (match) {
    pass++
  } else {
    fails.push(
      `${rootName}/${chordId}\n    expected: ${expected}\n    offered:  ${shapes.map(s => fmt(s.frets)).join("   |   ")}`,
    )
  }
}

console.log(`Canonical fingerings matched: ${pass}/${CANON.length}\n`)
if (fails.length) {
  console.log("MISMATCHES:")
  for (const f of fails) console.log("  " + f + "\n")
}

// Spot-check the freshly rewritten 9th voicings actually spell the chord.
console.log("\n=== 9th-chord spelling check ===")
for (const [rootName, chordId] of [["C", "dom9"], ["C", "maj9"], ["C", "min9"], ["C", "dom7b9"]] as const) {
  const root = NOTE_NAMES.indexOf(rootName)
  for (const s of getAllChordShapes(root, chordId)) {
    const notes = s.frets
      .map((f, i) => (f === null ? null : NOTE_NAMES[(OPEN_STRING_MIDI[i] + f) % 12]))
      .filter(Boolean)
    console.log(`  ${rootName}${chordId.padEnd(8)} ${fmt(s.frets).padEnd(18)} [${s.kind}] -> ${[...new Set(notes)].join(" ")}`)
  }
}
