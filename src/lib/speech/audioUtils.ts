import type { ResamplingMode } from './settings'

const TARGET_SAMPLE_RATE = 16_000

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]
    sum += value * value
  }
  return Math.sqrt(sum / samples.length)
}

export function isSpeechActive(samples: Float32Array, threshold = 0.012): boolean {
  return computeRms(samples) >= threshold
}

export function downsampleTo16kFast(
  samples: Float32Array,
  sourceSampleRate: number,
): Float32Array {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return samples.slice()
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.floor(samples.length / ratio)
  const output = new Float32Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    output[index] = samples[Math.floor(index * ratio)] ?? 0
  }

  return output
}

export async function downsampleTo16kQuality(
  samples: Float32Array,
  sourceSampleRate: number,
): Promise<Float32Array> {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return samples.slice()
  }

  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.round((samples.length / sourceSampleRate) * TARGET_SAMPLE_RATE)),
    TARGET_SAMPLE_RATE,
  )
  const buffer = offline.createBuffer(1, samples.length, sourceSampleRate)
  buffer.copyToChannel(new Float32Array(samples), 0)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

export function downsampleTo16kLinear(
  samples: Float32Array,
  sourceSampleRate: number,
): Float32Array {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return samples.slice()
  }

  const outputLength = Math.floor(
    (samples.length * TARGET_SAMPLE_RATE) / sourceSampleRate,
  )
  const output = new Float32Array(Math.max(1, outputLength))
  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE

  for (let index = 0; index < output.length; index += 1) {
    const sourceIndex = index * ratio
    const left = Math.floor(sourceIndex)
    const right = Math.min(left + 1, samples.length - 1)
    const weight = sourceIndex - left
    output[index] = samples[left] * (1 - weight) + samples[right] * weight
  }

  return output
}

export function resampleTo16kSync(
  samples: Float32Array,
  sourceSampleRate: number,
  mode: ResamplingMode,
): Float32Array {
  if (mode === 'fast') {
    return downsampleTo16kFast(samples, sourceSampleRate)
  }
  return downsampleTo16kLinear(samples, sourceSampleRate)
}

export function takeAudioChunk(
  pending: Float32Array[],
  pendingLength: number,
  chunkLength: number,
): { chunk: Float32Array | null; pending: Float32Array[]; pendingLength: number } {
  if (pendingLength < chunkLength) {
    return { chunk: null, pending, pendingLength }
  }

  const merged = new Float32Array(chunkLength)
  let offset = 0
  const nextPending: Float32Array[] = []

  while (offset < chunkLength && pending.length > 0) {
    const part = pending[0]
    const needed = chunkLength - offset
    if (part.length <= needed) {
      merged.set(part, offset)
      offset += part.length
      pending.shift()
      continue
    }

    merged.set(part.subarray(0, needed), offset)
    nextPending.push(part.subarray(needed))
    pending.shift()
    break
  }

  nextPending.push(...pending)
  const nextLength = nextPending.reduce((total, part) => total + part.length, 0)
  return { chunk: merged, pending: nextPending, pendingLength: nextLength }
}

export function prependOverlap(
  chunk: Float32Array,
  overlap: Float32Array | null,
): Float32Array {
  if (!overlap || overlap.length === 0) return chunk
  const merged = new Float32Array(overlap.length + chunk.length)
  merged.set(overlap, 0)
  merged.set(chunk, overlap.length)
  return merged
}

export function tailOverlap(samples: Float32Array, overlapSamples: number) {
  if (overlapSamples <= 0 || samples.length === 0) return null
  const start = Math.max(0, samples.length - overlapSamples)
  return samples.slice(start)
}

const WHISPER_HALLUCINATIONS = new Set([
  'you',
  'thank you',
  'thanks',
  'thanks for watching',
  'subscribe',
  'bye',
  'the',
  'a',
  'i',
])

export function isLikelyWhisperHallucination(text: string, rms: number): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s']/g, '')
    .trim()

  if (!normalized) return true
  if (rms >= 0.02) return false
  if (WHISPER_HALLUCINATIONS.has(normalized)) return true

  const words = normalized.split(/\s+/).filter(Boolean)
  if (rms < 0.01 && words.length <= 2 && words.every((word) => word.length <= 4)) {
    return true
  }

  return false
}
