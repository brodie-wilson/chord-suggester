// Chord audio preview via the Web Audio API — lets you hear a suggested
// chord before deciding whether to send it to Audiotool.

import { noteNameToChromaIndex } from "./chord-library.ts"

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  // Browsers suspend a freshly created/backgrounded context until a user
  // gesture resumes it — the click that calls playChord() counts as one.
  if (audioCtx.state === "suspended") void audioCtx.resume()
  return audioCtx
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Stacks each note upward from the previous one, starting near middle C, so
// a chord like C-E-G becomes MIDI 60-64-67 instead of three notes crammed
// into the same octave.
function notesToMidiPitches(notes: string[]): number[] {
  let previous = -Infinity
  return notes.map(n => {
    let pitch = 60 + noteNameToChromaIndex(n)
    while (pitch <= previous) pitch += 12
    previous = pitch
    return pitch
  })
}

const ATTACK = 0.02
const DECAY = 0.15
const HOLD = 0.9
const RELEASE = 0.5
const SUSTAIN_LEVEL = 0.55

/** Total time in ms a played chord takes to fully ring out. */
export const CHORD_DURATION_MS = Math.round((ATTACK + DECAY + HOLD + RELEASE) * 1000)

export function playChord(notes: string[]): void {
  playPitches(notesToMidiPitches(notes))
}

/** Plays an exact set of MIDI pitches — used to hear a specific fingering. */
export function playPitches(pitches: number[]): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const peak = 0.5 / pitches.length // more notes -> quieter each, avoids clipping

  for (const midi of pitches) {
    const osc = ctx.createOscillator()
    osc.type = "triangle"
    osc.frequency.value = midiToFrequency(midi)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + ATTACK)
    gain.gain.linearRampToValueAtTime(peak * SUSTAIN_LEVEL, now + ATTACK + DECAY)
    gain.gain.setValueAtTime(peak * SUSTAIN_LEVEL, now + ATTACK + DECAY + HOLD)
    gain.gain.linearRampToValueAtTime(0, now + ATTACK + DECAY + HOLD + RELEASE)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + ATTACK + DECAY + HOLD + RELEASE + 0.05)
  }
}
