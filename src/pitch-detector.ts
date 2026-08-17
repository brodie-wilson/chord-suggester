// YIN pitch detection algorithm (de Cheveigné & Kawahara, 2002).
// More accurate than FFT peak-picking for guitar: finds the fundamental
// directly from the time-domain waveform, with a confidence threshold to
// suppress false readings during silence or noisy transients.

const YIN_THRESHOLD = 0.15
const MIN_FREQ = 60
const MAX_FREQ = 1200

export interface PitchResult {
  frequency: number
  confidence: number
  noteIndex: number
}

export class PitchDetector {
  private buffer: Float32Array
  private readonly bufferSize: number
  private readonly sampleRate: number

  constructor(analyser: AnalyserNode, audioContext: AudioContext) {
    this.sampleRate = audioContext.sampleRate
    this.bufferSize = analyser.fftSize
    this.buffer = new Float32Array(this.bufferSize)
  }

  process(input: Float32Array): PitchResult {
    const n = Math.min(input.length, this.bufferSize)
    this.buffer = input.slice(0, n)
    return this.yin(this.buffer)
  }

  private yin(buf: Float32Array): PitchResult {
    const n = buf.length
    const halfN = Math.floor(n / 2)

    const minPeriod = Math.floor(this.sampleRate / MAX_FREQ)
    const maxPeriod = Math.floor(this.sampleRate / MIN_FREQ)
    // Only compute up to maxPeriod — periods beyond that are below MIN_FREQ
    // and never searched. Restricting the range (rather than scanning the
    // whole half-buffer) frees up budget for a larger analysis window, which
    // is the standard remedy for unreliable low-frequency pitch tracking.
    const scanLimit = Math.min(maxPeriod, halfN - 1)

    // Step 1: Difference function
    const diff = new Float32Array(scanLimit + 1)
    for (let tau = 1; tau <= scanLimit; tau++) {
      let sum = 0
      for (let i = 0; i < halfN; i++) {
        const delta = buf[i] - buf[i + tau]
        sum += delta * delta
      }
      diff[tau] = sum
    }

    // Step 2: Cumulative mean normalised difference
    const cmnd = new Float32Array(scanLimit + 1)
    cmnd[0] = 1
    let runningSum = 0
    for (let tau = 1; tau <= scanLimit; tau++) {
      runningSum += diff[tau]
      cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 0
    }

    // Step 3: Absolute threshold
    let bestTau = -1
    let bestVal = Infinity
    let foundThreshold = false

    for (let tau = minPeriod; tau <= scanLimit; tau++) {
      if (cmnd[tau] < YIN_THRESHOLD) {
        while (tau + 1 <= scanLimit && cmnd[tau + 1] < cmnd[tau]) tau++
        bestTau = tau
        bestVal = cmnd[tau]
        foundThreshold = true
        break
      }
      if (cmnd[tau] < bestVal) {
        bestVal = cmnd[tau]
        bestTau = tau
      }
    }

    if (bestTau < 0) return { frequency: 0, confidence: 0, noteIndex: -1 }

    // Step 4: Parabolic interpolation for sub-sample accuracy
    const betterTau = this.interpolate(cmnd, bestTau)
    const frequency = this.sampleRate / betterTau
    const confidence = foundThreshold ? 1 - bestVal : Math.max(0, 1 - bestVal * 4)

    if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
      return { frequency: 0, confidence: 0, noteIndex: -1 }
    }

    return { frequency, confidence, noteIndex: this.frequencyToNoteIndex(frequency) }
  }

  private interpolate(cmnd: Float32Array, tau: number): number {
    if (tau <= 0 || tau >= cmnd.length - 1) return tau
    const x0 = cmnd[tau - 1]
    const x1 = cmnd[tau]
    const x2 = cmnd[tau + 1]
    const denom = 2 * (2 * x1 - x0 - x2)
    if (Math.abs(denom) < 1e-10) return tau
    return tau + (x0 - x2) / denom
  }

  private frequencyToNoteIndex(freq: number): number {
    const semitonesFromA4 = 12 * Math.log2(freq / 440)
    const rounded = Math.round(semitonesFromA4)
    return ((((rounded % 12) + 12) % 12) + 9) % 12
  }
}

/** Holds a detected note across frames to avoid jitter between notes. */
export class NoteSmoother {
  private noteVotes: number[] = []
  private windowSize: number
  private requiredConsensus: number

  constructor(windowFrames = 8, consensus = 0.6) {
    this.windowSize = windowFrames
    this.requiredConsensus = consensus
  }

  push(noteIndex: number, confidence: number): number {
    if (confidence > 0.6 && noteIndex >= 0) this.noteVotes.push(noteIndex)
    else this.noteVotes.push(-1)
    if (this.noteVotes.length > this.windowSize) this.noteVotes.shift()

    const counts = new Array(12).fill(0)
    let validCount = 0
    for (const v of this.noteVotes) {
      if (v >= 0) {
        counts[v]++
        validCount++
      }
    }
    if (validCount < this.windowSize * 0.4) return -1

    const bestNote = counts.indexOf(Math.max(...counts))
    return counts[bestNote] / this.windowSize >= this.requiredConsensus ? bestNote : -1
  }

  reset(): void {
    this.noteVotes = []
  }
}
