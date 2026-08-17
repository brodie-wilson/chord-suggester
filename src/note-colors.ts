// Assigns each of the 12 chromatic notes a distinct, consistent hue, ordered
// by the circle of fifths rather than plain chromatic order — so notes that
// are harmonically close (a fifth apart) also sit close together in hue,
// matching the visual logic of a real circle-of-fifths chart.

const WHEEL_POSITION_BY_CHROMA = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]

export function noteColor(chromaIndex: number, saturation = 68, lightness = 52): string {
  const position = WHEEL_POSITION_BY_CHROMA[((chromaIndex % 12) + 12) % 12]
  const hue = (position / 12) * 360
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export function noteColorSoft(chromaIndex: number): string {
  return noteColor(chromaIndex, 75, 94)
}
