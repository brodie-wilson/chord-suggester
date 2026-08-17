// Curated, real guitar chord shapes, organised the way guitarists actually
// learn the neck: the CAGED system.
//
// Every chord form on a guitar is one of five movable shapes, named after
// the open chord it derives from — C, A, G, E and D. Slide any of them up
// so its root lands on the right fret and you get that chord in that
// position, which is why a major chord has five places to play it. Each
// family below stores its shape as fret OFFSETS from the root fret, so the
// open chord is simply the shape at offset 0 (or fret 3 for C and G, whose
// roots sit above the rest of the shape).
//
// The C and G families reach *behind* their root, so their offsets go
// negative; buildShape moves such a shape up an octave rather than off the
// nut. Not every quality has all five forms — the C and G minor forms
// aren't playable in any useful way, so minor chords legitimately offer
// three positions rather than five.

import { NOTE_NAMES } from "./chord-library.ts"
import { OPEN_STRING_MIDI } from "./fretboard.ts"

type ShapeTemplate = (number | null)[]
export type ShapeKind = "c-shape" | "a-shape" | "g-shape" | "e-shape" | "d-shape"

interface Family {
  kind: ShapeKind
  /** String the root sits on: 0 = low E, 1 = A, 2 = D. */
  rootString: number
  /**
   * Root fret at which this family becomes the open chord it's named after
   * — 3 for C and G, whose roots sit above the rest of the shape, 0 for the
   * others. OPEN_GRIPS entries apply only at this fret.
   */
  openRootFret: number
  templates: Partial<Record<string, ShapeTemplate>>
}

const FAMILIES: Family[] = [
  {
    kind: "c-shape",
    rootString: 1,
    openRootFret: 3,
    templates: {
      major: [null, 0, -1, -3, -2, -3],
      dom7: [null, 0, -1, 0, -2, null],
      maj7: [null, 0, -1, -3, -3, -3],
      sixth: [null, 0, -1, -1, -2, -3],
      sus4: [null, 0, 0, -3, -2, -2],
    },
  },
  {
    kind: "a-shape",
    rootString: 1,
    openRootFret: 0,
    templates: {
      major: [null, 0, 2, 2, 2, 0],
      minor: [null, 0, 2, 2, 1, 0],
      dom7: [null, 0, 2, 0, 2, 0],
      maj7: [null, 0, 2, 1, 2, 0],
      min7: [null, 0, 2, 0, 1, 0],
      sixth: [null, 0, 2, 2, 2, 2],
      min6: [null, 0, 2, 2, 1, 2],
      sus4: [null, 0, 2, 2, 3, 0],
      sus2: [null, 0, 2, 2, 0, 0],
      // The 9th chords reach a fret or two below the root on the D string —
      // that is the standard jazz/funk grip (C9 = x-3-2-3-3-3).
      maj9: [null, 0, -1, 1, 0, 0],
      min9: [null, 0, -2, 0, 0, 0],
      dom9: [null, 0, -1, 0, 0, 0],
      dom7b9: [null, 0, -1, 0, -1, 0],
      maj13: [null, 0, 4, 1, 2, 0],
      min11: [null, 0, 0, 0, 1, 0],
      dim7: [null, 0, 1, -1, 1, null],
      halfdim: [null, 0, 1, 0, 1, 3],
      aug: [null, 0, 3, 2, 2, 1],
      dim: [null, 0, 1, 2, 1, null],
      add9: [null, 0, 2, 4, 2, 0],
      six9: [null, 0, 4, 4, 2, 0],
    },
  },
  {
    kind: "g-shape",
    rootString: 0,
    openRootFret: 3,
    templates: {
      major: [0, -1, -3, -3, -3, 0],
      dom7: [0, -1, -3, -3, -3, -2],
      maj7: [0, -1, -3, -3, -3, -1],
      sixth: [0, -1, -3, -3, -3, -3],
      sus4: [0, 0, -3, -3, -2, null],
    },
  },
  {
    kind: "e-shape",
    rootString: 0,
    openRootFret: 0,
    templates: {
      major: [0, 2, 2, 1, 0, 0],
      minor: [0, 2, 2, 0, 0, 0],
      dom7: [0, 2, 0, 1, 0, 0],
      maj7: [0, 2, 1, 1, 0, 0],
      min7: [0, 2, 0, 0, 0, 0],
      // Muted strings drop a tone already sounding elsewhere; the fuller
      // grips need five fingers once barred. OPEN_GRIPS keeps the familiar
      // open versions intact.
      sixth: [0, null, 2, 1, 2, null],
      min6: [0, 2, 2, 0, 2, 0],
      sus4: [0, 2, 2, 2, 0, 0],
      maj9: [0, null, 1, 1, null, 2],
      min9: [0, 2, 0, 0, 0, 2],
      dom9: [0, 2, 0, 1, 0, 2],
      maj13: [0, null, 1, 1, 2, 2],
      min11: [0, 0, 0, 0, 0, 2],
      dim7: [0, 1, 2, 0, 2, 0],
      halfdim: [0, 1, 0, 0, 3, 0],
      dom7b9: [0, 2, 0, 1, 0, 1],
      sus2: [0, 2, 2, null, null, 2],
      aug: [0, 3, null, 1, 1, null],
      dim: [0, 1, 2, 0, null, 0],
      add9: [0, 2, null, 1, null, 2],
      six9: [0, null, 2, 1, 2, 2],
    },
  },
  {
    kind: "d-shape",
    rootString: 2,
    openRootFret: 0,
    templates: {
      major: [null, null, 0, 2, 3, 2],
      minor: [null, null, 0, 2, 3, 1],
      dom7: [null, null, 0, 2, 1, 2],
      maj7: [null, null, 0, 2, 2, 2],
      min7: [null, null, 0, 2, 1, 1],
      sixth: [null, null, 0, 2, 0, 2],
      sus4: [null, null, 0, 2, 3, 3],
      sus2: [null, null, 0, 2, 3, 0],
    },
  },
]

// Fuller open-position grips, used in place of the movable template when
// that template happens to land on the open strings. These are the shapes
// everyone learns first, and open strings make them playable with four
// fingers even where the barred form has to be thinned out.
const OPEN_GRIPS: Partial<Record<string, Partial<Record<string, ShapeTemplate>>>> = {
  E: {
    sixth: [0, 2, 2, 1, 2, 0],
    aug: [0, 3, 2, 1, 1, 0],
    sus2: [0, 2, 2, 4, 0, 2],
    add9: [0, 2, 2, 1, 0, 2],
    maj9: [0, 2, 1, 1, 0, 2],
    maj13: [0, 4, 1, 1, 0, 2],
    six9: [0, 4, 2, 1, 0, 2],
  },
  A: {
    dim7: [null, 0, 1, 2, 1, 2],
  },
  C: {
    sus4: [null, 3, 3, 0, 1, 1],
    dom7: [null, 3, 2, 3, 1, 0],
  },
  G: {
    sus4: [3, 3, 0, 0, 1, 3],
  },
}

export interface CuratedShape {
  frets: (number | null)[]
  rootStringIndex: number
  /** Which CAGED form this fingering comes from. */
  kind: ShapeKind
  /** Fret the diagram is drawn from; 0 means open position. */
  baseFret: number
  /** Fret the root itself sits on — what a played note is matched against. */
  rootFret: number
}

function fretFor(rootChroma: number, openMidi: number): number {
  return (((rootChroma - (openMidi % 12)) % 12) + 12) % 12
}

function buildShape(family: Family, chordId: string, rootChroma: number): CuratedShape | null {
  const template = family.templates[chordId]
  if (!template) return null

  let rootFret = fretFor(rootChroma, OPEN_STRING_MIDI[family.rootString])
  let frets = template.map(o => (o === null ? null : o + rootFret))
  // A shape reaching behind the nut is the same shape an octave up.
  if (frets.some(f => f !== null && f < 0)) {
    rootFret += 12
    frets = template.map(o => (o === null ? null : o + rootFret))
  }

  const openGrip = OPEN_GRIPS[NOTE_NAMES[rootChroma]]?.[chordId]
  if (openGrip && rootFret === family.openRootFret) frets = openGrip

  const fretted = frets.filter((f): f is number => f !== null && f > 0)
  if (fretted.length === 0) return null
  const maxFret = Math.max(...fretted)
  if (maxFret > 15) return null

  // Any open string means the shape is read from the nut; otherwise the
  // diagram starts at its lowest stopped fret.
  const hasOpen = frets.some(f => f === 0)
  const baseFret = hasOpen ? 0 : Math.min(...fretted)
  if (maxFret - baseFret >= 5) return null

  return { frets, rootStringIndex: family.rootString, kind: family.kind, baseFret, rootFret }
}

/**
 * Every real position for a root + chord quality, nut-first up the neck.
 * Major chords yield the full five CAGED forms; qualities whose C or G
 * forms aren't playable return the three that are.
 */
export function getAllChordShapes(rootChroma: number, chordId: string): CuratedShape[] {
  const shapes: CuratedShape[] = []
  const seen = new Set<string>()

  for (const family of FAMILIES) {
    const shape = buildShape(family, chordId, rootChroma)
    if (!shape) continue
    // Two families can land on the same grip — the open A chord is both the
    // A-shape at fret 0 and, for some qualities, another form's result.
    const signature = shape.frets.join(",")
    if (seen.has(signature)) continue
    seen.add(signature)
    shapes.push(shape)
  }

  return shapes.sort((a, b) => a.baseFret - b.baseFret || a.rootFret - b.rootFret)
}

/**
 * Picks whichever position sits closest to the fret you actually played, so
 * the same chord shows a different, still-correct fingering depending on
 * where on the neck you are.
 */
export function getChordShape(rootChroma: number, chordId: string, anchorFret: number): CuratedShape | null {
  const shapes = getAllChordShapes(rootChroma, chordId)
  if (shapes.length === 0) return null

  let best = shapes[0]
  let bestDistance = Math.abs(best.rootFret - anchorFret)
  for (const shape of shapes.slice(1)) {
    const distance = Math.abs(shape.rootFret - anchorFret)
    if (distance < bestDistance) {
      best = shape
      bestDistance = distance
    }
  }
  return best
}
