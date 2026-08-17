// Chord library: all chord definitions grouped into Standard, Jazz, and Technical.
// Each chord is defined by its semitone intervals from the root (0 = root).

export type ChordCategory = "standard" | "jazz" | "technical"

export interface ChordDefinition {
  id: string
  name: string
  symbol: string
  intervals: number[]
  category: ChordCategory
  description: string
  teachingNote: string
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

export const CHORD_LIBRARY: ChordDefinition[] = [
  // ── Standard ───────────────────────────────────────────────────────────
  {
    id: "major", name: "Major", symbol: "", intervals: [0, 4, 7], category: "standard",
    description: "The brightest, happiest chord. The foundation of most pop and rock music.",
    teachingNote: "Happy and bright — think 'Let It Be' or 'Sweet Home Alabama'.",
  },
  {
    id: "minor", name: "Minor", symbol: "m", intervals: [0, 3, 7], category: "standard",
    description: "Darker and more emotional than major. Adds depth and feeling.",
    teachingNote: "Moody and emotional — think 'Nothing Else Matters'.",
  },
  {
    id: "dom7", name: "Dominant 7th", symbol: "7", intervals: [0, 4, 7, 10], category: "standard",
    description: "A major chord with added tension. Creates a strong pull towards resolution.",
    teachingNote: "Bluesy and tense — wants to resolve. All over blues and rock riffs.",
  },
  {
    id: "maj7", name: "Major 7th", symbol: "maj7", intervals: [0, 4, 7, 11], category: "standard",
    description: "Dreamy and lush. Major chord with the 7th note added for colour.",
    teachingNote: "Smooth and dreamy — sounds like a film score or R&B.",
  },
  {
    id: "min7", name: "Minor 7th", symbol: "m7", intervals: [0, 3, 7, 10], category: "standard",
    description: "Soulful and relaxed. A minor chord with softened tension.",
    teachingNote: "Cool and laid-back — the foundation of soul and neo-soul.",
  },
  // ── Jazz ───────────────────────────────────────────────────────────────
  {
    id: "maj9", name: "Major 9th", symbol: "maj9", intervals: [0, 4, 7, 11, 14], category: "jazz",
    description: "Opens up a maj7 with the 9th for an airy, floating sound.",
    teachingNote: "Dreamy and open — adds a note of colour above the maj7.",
  },
  {
    id: "min9", name: "Minor 9th", symbol: "m9", intervals: [0, 3, 7, 10, 14], category: "jazz",
    description: "A lush, melancholic sound that's deeper than a plain minor 7th.",
    teachingNote: "Soulful and rich — adds warmth on top of the minor 7th.",
  },
  {
    id: "dom9", name: "Dominant 9th", symbol: "9", intervals: [0, 4, 7, 10, 14], category: "jazz",
    description: "Full-bodied jazz tension. The 9th adds colour to the dominant 7th.",
    teachingNote: "Funky and full — you'll hear this all over jazz and funk.",
  },
  {
    id: "maj13", name: "Major 13th", symbol: "maj13", intervals: [0, 4, 7, 11, 14, 21], category: "jazz",
    description: "A full, sophisticated sound stacking extensions on top of maj7.",
    teachingNote: "Rich and sophisticated — the major scale stacked up.",
  },
  {
    id: "min11", name: "Minor 11th", symbol: "m11", intervals: [0, 3, 7, 10, 14, 17], category: "jazz",
    description: "A floating, ethereal sound. Adds the 11th on top of minor 9th.",
    teachingNote: "Floating and atmospheric — great for moody jazz and neo-soul.",
  },
  {
    id: "dim7", name: "Diminished 7th", symbol: "dim7", intervals: [0, 3, 6, 9], category: "jazz",
    description: "Tense and mysterious. Built entirely from minor 3rd intervals.",
    teachingNote: "Spooky and tense — symmetrical shape makes it easy to transpose.",
  },
  {
    id: "halfdim", name: "Half-Diminished", symbol: "m7b5", intervals: [0, 3, 6, 10], category: "jazz",
    description: "Dark and unresolved. The ii chord in minor key progressions.",
    teachingNote: "Dark and unstable — a key chord in minor jazz.",
  },
  {
    id: "dom7b9", name: "Dominant 7b9", symbol: "7b9", intervals: [0, 4, 7, 10, 13], category: "jazz",
    description: "Maximum tension — the flatted 9th creates a dramatic clash.",
    teachingNote: "Very tense and dramatic — popular in flamenco and jazz.",
  },
  // ── Technical ──────────────────────────────────────────────────────────
  {
    id: "sus2", name: "Suspended 2nd", symbol: "sus2", intervals: [0, 2, 7], category: "technical",
    description: "Removes the 3rd, replaces it with the 2nd. Neither major nor minor.",
    teachingNote: "Floaty and ambiguous — no major or minor quality. Great for intros.",
  },
  {
    id: "sus4", name: "Suspended 4th", symbol: "sus4", intervals: [0, 5, 7], category: "technical",
    description: "Replaces the 3rd with the 4th. Creates tension that wants to resolve.",
    teachingNote: "Building tension — The Who and U2's The Edge use these everywhere.",
  },
  {
    id: "aug", name: "Augmented", symbol: "aug", intervals: [0, 4, 8], category: "technical",
    description: "A major chord with a raised 5th. Unstable and dreamlike.",
    teachingNote: "Unsettling and dreamlike — raises the 5th a semitone.",
  },
  {
    id: "dim", name: "Diminished", symbol: "dim", intervals: [0, 3, 6], category: "technical",
    description: "Two stacked minor 3rds. Very tense and dark — always wants to move.",
    teachingNote: "Maximum dark tension — used as a passing chord.",
  },
  {
    id: "add9", name: "Add 9", symbol: "add9", intervals: [0, 4, 7, 14], category: "technical",
    description: "Major chord with the 9th added but without the 7th.",
    teachingNote: "Bright and colourful without being jazzy — easier than a maj9.",
  },
  {
    id: "sixth", name: "Major 6th", symbol: "6", intervals: [0, 4, 7, 9], category: "technical",
    description: "Adds the 6th to a major chord for a lighter, vintage sound.",
    teachingNote: "Vintage and sweet — everywhere in early rock and pop.",
  },
  {
    id: "min6", name: "Minor 6th", symbol: "m6", intervals: [0, 3, 7, 9], category: "technical",
    description: "Adds the 6th to a minor chord. Bittersweet and sophisticated.",
    teachingNote: "Bittersweet — lightens a minor chord without losing its darkness.",
  },
  {
    id: "six9", name: "6/9", symbol: "6/9", intervals: [0, 4, 7, 9, 14], category: "technical",
    description: "Major plus the 6th and 9th but no 7th. Bright and modern.",
    teachingNote: "Modern and bright — popular in funk and pop. Sounds expensive.",
  },
]

export function getChordsForRoot(
  rootIndex: number,
  category: ChordCategory,
): Array<{ chord: ChordDefinition; notes: string[] }> {
  return CHORD_LIBRARY.filter(c => c.category === category).map(chord => ({
    chord,
    notes: chord.intervals.map(interval => {
      const noteIndex = (rootIndex + interval) % 12
      const useFlat = [1, 3, 5, 8, 10].includes(rootIndex)
      return useFlat ? NOTE_NAMES_FLAT[noteIndex] : NOTE_NAMES[noteIndex]
    }),
  }))
}

/** Convert a note name (e.g. "E", "Bb") back to its chroma index (0-11). */
export function noteNameToChromaIndex(noteName: string): number {
  const sharpIdx = NOTE_NAMES.indexOf(noteName)
  if (sharpIdx >= 0) return sharpIdx
  return NOTE_NAMES_FLAT.indexOf(noteName)
}
