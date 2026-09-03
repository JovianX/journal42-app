import { downsampleTo16kLinear } from './audioUtils'
import { SILERO_CHUNK_SAMPLES, SileroVadProcessor } from './sileroVad'

export type SileroSegmenterOptions = {
  speechThreshold: number
  negativeThreshold: number
  sampleRate: number
  maxSegmentMs: number
  minSpeechMs: number
  hangoverMs: number
  onSegment: (segment: Float32Array) => void
}

export class SileroSpeechSegmenter {
  private readonly options: SileroSegmenterOptions
  private readonly vad: SileroVadProcessor
  private pending16k: Float32Array[] = []
  private pending16kLength = 0
  private speechBuffer: Float32Array[] = []
  private speechBufferLength = 0
  private speechMs = 0
  private silenceMs = 0
  private inSpeech = false
  private draining = false

  private constructor(vad: SileroVadProcessor, options: SileroSegmenterOptions) {
    this.vad = vad
    this.options = options
  }

  static async create(options: SileroSegmenterOptions) {
    const vad = await SileroVadProcessor.create()
    return new SileroSpeechSegmenter(vad, options)
  }

  reset() {
    this.pending16k = []
    this.pending16kLength = 0
    this.speechBuffer = []
    this.speechBufferLength = 0
    this.speechMs = 0
    this.silenceMs = 0
    this.inSpeech = false
    this.vad.reset()
  }

  push(samples: Float32Array, sourceSampleRate: number) {
    const pcm16k = downsampleTo16kLinear(samples, sourceSampleRate)
    if (pcm16k.length === 0) return
    this.pending16k.push(pcm16k)
    this.pending16kLength += pcm16k.length
    void this.scheduleDrain()
  }

  async flush() {
    await this.drain(true)
  }

  private scheduleDrain() {
    if (this.draining) return
    this.draining = true
    void this.drain(false).finally(() => {
      this.draining = false
      if (this.pending16kLength >= SILERO_CHUNK_SAMPLES) {
        this.scheduleDrain()
      }
    })
  }

  private async drain(flush: boolean) {
    const frameMs = (SILERO_CHUNK_SAMPLES / this.options.sampleRate) * 1000

    while (this.pending16kLength >= SILERO_CHUNK_SAMPLES) {
      const chunk = this.takeChunk(SILERO_CHUNK_SAMPLES)
      if (!chunk) break

      const probability = await this.vad.processChunk(chunk)
      const isSpeech = this.inSpeech
        ? probability >= this.options.negativeThreshold
        : probability >= this.options.speechThreshold

      if (isSpeech) {
        this.inSpeech = true
        this.speechMs += frameMs
        this.silenceMs = 0
        this.appendSpeech(chunk)
      } else if (this.inSpeech) {
        this.silenceMs += frameMs
        this.appendSpeech(chunk)
      }

      const maxReached = this.segmentDurationMs() >= this.options.maxSegmentMs
      const ended =
        this.inSpeech &&
        this.speechMs >= this.options.minSpeechMs &&
        this.silenceMs >= this.options.hangoverMs

      if (ended || maxReached) {
        this.emitSegment()
      }
    }

    if (flush && this.inSpeech && this.speechMs >= this.options.minSpeechMs) {
      this.emitSegment()
    }
  }

  private emitSegment() {
    const segment = this.takeSegment()
    if (segment) {
      this.options.onSegment(segment)
    }
  }

  private takeChunk(length: number) {
    if (this.pending16kLength < length) return null

    const merged = new Float32Array(length)
    let offset = 0

    while (offset < length && this.pending16k.length > 0) {
      const part = this.pending16k[0]
      const needed = length - offset
      if (part.length <= needed) {
        merged.set(part, offset)
        offset += part.length
        this.pending16k.shift()
        continue
      }

      merged.set(part.subarray(0, needed), offset)
      this.pending16k[0] = part.subarray(needed)
      offset = length
    }

    this.pending16kLength -= length
    return merged
  }

  private appendSpeech(samples: Float32Array) {
    this.speechBuffer.push(samples)
    this.speechBufferLength += samples.length
  }

  private segmentDurationMs() {
    return (this.speechBufferLength / this.options.sampleRate) * 1000
  }

  private takeSegment(): Float32Array | null {
    if (this.speechBufferLength === 0) return null
    const merged = new Float32Array(this.speechBufferLength)
    let offset = 0
    for (const part of this.speechBuffer) {
      merged.set(part, offset)
      offset += part.length
    }
    this.speechBuffer = []
    this.speechBufferLength = 0
    this.speechMs = 0
    this.silenceMs = 0
    this.inSpeech = false
    return merged
  }
}
