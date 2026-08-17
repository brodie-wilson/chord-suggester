// Comprehensive correctness audit of every curated chord shape.
//
// For each shape it works out the notes actually sounded, then checks them
// against the chord's interval definition and against basic playability.

import { CHORD_LIBRARY, NOTE_NAMES } from "../src/chord-library.ts"
import { getAllChordShapes } from "../src/chord-shapes.ts"
import { OPEN_STRING_MIDI } from "../src/fretboard.ts"

type Finding = { severity: "ERROR" | "WARN"; chord: string; shape: string; detail: string }
const findings: Finding[] = []

const INTERVAL_NAME: Record<number, string> = {
  0: "root", 1: "b9", 2: "9", 3: "b3", 4: "3", 5: "11/4", 6: "b5", 7: "5",
  8: "#5", 9: "6/13", 10: "b7", 11: "maj7",
}

function fmt(frets: (number | null)[]): string {
  return frets.map(f => (f === null ? "x" : f)).join("-")
}

let shapeCount = 0

for (const chord of CHORD_LIBRARY) {
  // Interval set reduced into one octave — what notes the chord may contain.
  const allowed = new Set(chord.intervals.map(i => i % 12))
  // Tones that define the chord's identity and must not be dropped.
  const essential = new Set<number>([0])
  const third = chord.intervals[1] % 12
  essential.add(third)
  const seventh = chord.intervals.find(i => i % 12 === 10 || i % 12 === 11)
  if (seventh !== undefined) essential.add(seventh % 12)
  // Symmetric chords lose their identity without every tone.
  if (chord.id === "dim7" || chord.id === "aug" || chord.id === "dim") {
    for (const i of chord.intervals) essential.add(i % 12)
  }
  // A chord named after an extension must actually contain that extension —
  // a "9" without its 9th is just a 7 chord wearing the wrong label.
  const NAMED_EXTENSION: Record<string, number> = {
    maj9: 2, min9: 2, dom9: 2, add9: 2, dom7b9: 1, maj13: 9, min11: 5, six9: 2, sus2: 2,
  }
  if (chord.id in NAMED_EXTENSION) essential.add(NAMED_EXTENSION[chord.id])

  for (let root = 0; root < 12; root++) {
    const label = `${NOTE_NAMES[root]}${chord.symbol || " " + chord.name.toLowerCase()}`
    const shapes = getAllChordShapes(root, chord.id)

    if (shapes.length === 0) {
      findings.push({ severity: "ERROR", chord: label, shape: "(none)", detail: "no curated shape at all" })
      continue
    }

    for (const shape of shapes) {
      shapeCount++
      const shapeStr = `${fmt(shape.frets)} [${shape.kind}]`

      const sounded = shape.frets
        .map((f, s) => (f === null ? null : OPEN_STRING_MIDI[s] + f))
        .filter((m): m is number => m !== null)

      if (sounded.length < 3) {
        findings.push({ severity: "ERROR", chord: label, shape: shapeStr, detail: `only ${sounded.length} strings sound` })
      }

      const degrees = new Set(sounded.map(m => (((m - root) % 12) + 12) % 12))

      // 1. Foreign notes — a note that isn't part of the chord at all.
      for (const d of degrees) {
        if (!allowed.has(d)) {
          findings.push({
            severity: "ERROR",
            chord: label,
            shape: shapeStr,
            detail: `contains ${NOTE_NAMES[(root + d) % 12]} (${INTERVAL_NAME[d] ?? d}), not in the chord`,
          })
        }
      }

      // 2. Missing essential tones.
      for (const e of essential) {
        if (!degrees.has(e)) {
          findings.push({
            severity: "ERROR",
            chord: label,
            shape: shapeStr,
            detail: `missing the ${INTERVAL_NAME[e] ?? e} (${NOTE_NAMES[(root + e) % 12]})`,
          })
        }
      }

      // 3. Missing optional colour tones — acceptable, but worth listing.
      for (const i of chord.intervals) {
        const d = i % 12
        if (!essential.has(d) && !degrees.has(d)) {
          findings.push({
            severity: "WARN",
            chord: label,
            shape: shapeStr,
            detail: `omits the ${INTERVAL_NAME[d] ?? d} (${NOTE_NAMES[(root + d) % 12]})`,
          })
        }
      }

      // 4. Bass note — chord charts overwhelmingly voice the root in the bass.
      const bassDegree = (((Math.min(...sounded) - root) % 12) + 12) % 12
      if (bassDegree !== 0) {
        findings.push({
          severity: "WARN",
          chord: label,
          shape: shapeStr,
          detail: `lowest note is the ${INTERVAL_NAME[bassDegree] ?? bassDegree}, not the root (inversion)`,
        })
      }

      // 5. Playability — fretted span and highest fret.
      const fretted = shape.frets.filter((f): f is number => f !== null && f > 0)
      if (fretted.length > 0) {
        const span = Math.max(...fretted) - Math.min(...fretted)
        if (span > 3) {
          findings.push({
            severity: span > 4 ? "ERROR" : "WARN",
            chord: label,
            shape: shapeStr,
            detail: `${span}-fret stretch`,
          })
        }
        if (Math.max(...fretted) > 12) {
          findings.push({ severity: "WARN", chord: label, shape: shapeStr, detail: `reaches fret ${Math.max(...fretted)}` })
        }
      }
    }
  }
}

const errors = findings.filter(f => f.severity === "ERROR")
const warns = findings.filter(f => f.severity === "WARN")

console.log(`Checked ${shapeCount} shapes across ${CHORD_LIBRARY.length} chord types x 12 roots.`)
console.log(`ERRORS: ${errors.length}   WARNINGS: ${warns.length}\n`)

function summarise(list: Finding[], title: string) {
  if (list.length === 0) return
  console.log(`=== ${title} ===`)
  const byDetail = new Map<string, Finding[]>()
  for (const f of list) {
    // Group by chord type + kind of problem, so 12 transpositions of the
    // same underlying template collapse into one line.
    const key = `${f.chord.replace(/^[A-G]#?/, "")} | ${f.detail.replace(/[A-G]#?/g, "N")}`
    if (!byDetail.has(key)) byDetail.set(key, [])
    byDetail.get(key)!.push(f)
  }
  for (const [key, group] of [...byDetail.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${group.length}x] ${key}`)
    for (const f of group.slice(0, 3)) console.log(`      ${f.chord.padEnd(12)} ${f.shape.padEnd(22)} ${f.detail}`)
    if (group.length > 3) console.log(`      … and ${group.length - 3} more`)
  }
  console.log()
}

summarise(errors, "ERRORS")
summarise(warns, "WARNINGS")
