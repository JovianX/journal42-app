import { computeRms } from './audioUtils'
import type { VadMode } from './settings'

export type EnergyVadMode = Exclude<VadMode, 'off' | 'silero'>

export type SegmenterOptions = {
  mode: EnergyVadMode
  rmsThreshold: number
  sampleRate: number
  maxSegmentMs: number
  minSpeechMs: number
  hangoverMs: number
}

export class SpeechSegmenter {
  private readonly options: SegmenterOptions
  private buffer: Float32Array[] = []
  private bufferLength = 0
  private speechMs = 0
  private silenceMs = 0
  private inSpeech = false

  constructor(options: SegmenterOptions) {
    this.options = options
  }

  reset() {
    this.buffer = []
    this.bufferLength = 0
    this.speechMs = 0
    this.silenceMs = 0
    this.inSpeech = false
  }

  feed(samples: Float32Array): Float32Array[] {
    const frameMs = (samples.length / this.options.sampleRate) * 1000
    const rms = computeRms(samples)
    const threshold = this.getThreshold()
    const isSpeech = rms >= threshold

    if (isSpeech) {
      this.inSpeech = true
      this.speechMs += frameMs
      this.silenceMs = 0
      this.append(samples)
    } else if (this.inSpeech) {
      this.silenceMs += frameMs
      this.append(samples)
    }

    const segments: Float32Array[] = []
    const maxReached = this.segmentDurationMs() >= this.options.maxSegmentMs
    const ended =
      this.inSpeech &&
      this.speechMs >= this.options.minSpeechMs &&
      this.silenceMs >= this.options.hangoverMs

    if (ended || maxReached) {
      const segment = this.takeSegment()
      if (segment) segments.push(segment)
    }

    return segments
  }

  flush(): Float32Array[] {
    if (!this.inSpeech || this.speechMs < this.options.minSpeechMs) {
      this.reset()
      return []
    }
    const segment = this.takeSegment()
    return segment ? [segment] : []
  }

  private getThreshold() {
    const base = this.options.rmsThreshold
    if (this.options.mode === 'rms') return base
    return this.inSpeech ? base * 0.72 : base
  }

  private append(samples: Float32Array) {
    this.buffer.push(samples.slice())
    this.bufferLength += samples.length
  }

  private segmentDurationMs() {
    return (this.bufferLength / this.options.sampleRate) * 1000
  }

  private takeSegment(): Float32Array | null {
    if (this.bufferLength === 0) return null
    const merged = new Float32Array(this.bufferLength)
    let offset = 0
    for (const part of this.buffer) {
      merged.set(part, offset)
      offset += part.length
    }
    this.reset()
    return merged
  }
}
