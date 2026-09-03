import type { Quantization } from './settings'
import { effectiveWhisperDtype, whisperModelId, type WhisperModelSize } from './settings'

type WhisperPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text?: string } | string>

export type LoadedWhisperPipeline = {
  transcriber: WhisperPipeline
  requestedDtype: Quantization
  loadedDtype: Quantization
}

export function isQuantizedWhisperSessionError(message: string) {
  return (
    message.includes('TransposeDQWeightsForMatMulNBits') ||
    message.includes('Missing required scale')
  )
}

export async function loadWhisperPipeline(
  modelSize: WhisperModelSize,
  requestedDtype: Quantization,
): Promise<LoadedWhisperPipeline> {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.useBrowserCache = true

  const modelId = whisperModelId(modelSize)
  const loadedDtype = effectiveWhisperDtype(requestedDtype)

  const transcriber = (await pipeline('automatic-speech-recognition', modelId, {
    dtype: loadedDtype,
  })) as WhisperPipeline

  return {
    transcriber,
    requestedDtype,
    loadedDtype,
  }
}
