export type WhisperModelSize = 'tiny' | 'base' | 'small'
export type Quantization = 'q4' | 'q8' | 'fp32'

/** Quantized Whisper ONNX fails on ORT 1.25+ (transformers.js 4.2). Use fp32 instead. */
export const WHISPER_QUANTIZED_BROKEN = true

export function effectiveWhisperDtype(quantization: Quantization): Quantization {
  if (WHISPER_QUANTIZED_BROKEN && quantization !== 'fp32') {
    return 'fp32'
  }
  return quantization
}

export function whisperQuantizationFallbackNote(
  requested: Quantization,
  loaded: Quantization,
): string | null {
  if (requested === loaded) return null
  return `${loaded} (quantized ${requested} unavailable in this browser build)`
}
export type VadMode = 'off' | 'rms' | 'enhanced' | 'silero'
export type VoskModelTier = 'small' | 'large'
export type ResamplingMode = 'fast' | 'quality'

export type SpeechLabSettings = {
  shared: {
    autoGainControl: boolean
    noiseSuppression: boolean
    echoCancellation: boolean
  }
  whisper: {
    modelSize: WhisperModelSize
    quantization: Quantization
    chunkSeconds: 3 | 6 | 8
    overlapSeconds: 0 | 1 | 2
    vadMode: VadMode
    rmsThreshold: number
    sileroThreshold: number
    hallucinationFilter: boolean
    journalPrompt: boolean
  }
  vosk: {
    modelTier: VoskModelTier
    resampling: ResamplingMode
    wordTimestamps: boolean
    punctuation: boolean
  }
}

export const DEFAULT_SPEECH_LAB_SETTINGS: SpeechLabSettings = {
  shared: {
    autoGainControl: false,
    noiseSuppression: true,
    echoCancellation: true,
  },
  whisper: {
    modelSize: 'tiny',
    quantization: 'q4',
    chunkSeconds: 6,
    overlapSeconds: 1,
    vadMode: 'enhanced',
    rmsThreshold: 0.012,
    sileroThreshold: 0.5,
    hallucinationFilter: true,
    journalPrompt: true,
  },
  vosk: {
    modelTier: 'small',
    resampling: 'quality',
    wordTimestamps: false,
    // Off by default: the punctuation ONNX is ~67MB and was blocking first
    // listens in production (local usually already had it cached).
    punctuation: false,
  },
}

const STORAGE_KEY = 'j42-voice-lab-settings'

export function loadSpeechLabSettings(): SpeechLabSettings {
  if (typeof window === 'undefined') return DEFAULT_SPEECH_LAB_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SPEECH_LAB_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SpeechLabSettings>
    return {
      shared: { ...DEFAULT_SPEECH_LAB_SETTINGS.shared, ...parsed.shared },
      whisper: {
        ...DEFAULT_SPEECH_LAB_SETTINGS.whisper,
        ...parsed.whisper,
        quantization:
          parsed.whisper?.quantization === 'q8'
            ? 'q4'
            : (parsed.whisper?.quantization ??
              DEFAULT_SPEECH_LAB_SETTINGS.whisper.quantization),
        sileroThreshold:
          parsed.whisper?.sileroThreshold ??
          DEFAULT_SPEECH_LAB_SETTINGS.whisper.sileroThreshold,
      },
      vosk: { ...DEFAULT_SPEECH_LAB_SETTINGS.vosk, ...parsed.vosk },
    }
  } catch {
    return DEFAULT_SPEECH_LAB_SETTINGS
  }
}

export function saveSpeechLabSettings(settings: SpeechLabSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function whisperModelId(size: WhisperModelSize) {
  return `onnx-community/whisper-${size}.en`
}

export function whisperSettingsKey(settings: SpeechLabSettings) {
  return `${settings.whisper.modelSize}:${settings.whisper.quantization}`
}

export function voskSettingsKey(settings: SpeechLabSettings) {
  return `${settings.vosk.modelTier}:${settings.vosk.punctuation ? 'punct' : 'raw'}`
}

const VOSK_MODEL_URLS: Record<VoskModelTier, string> = {
  small:
    'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
  large:
    'https://ccoreilly.github.io/vosk-browser/models/vosk-model-en-us-0.22-lgraph.tar.gz',
}

export function voskModelUrl(tier: VoskModelTier) {
  return VOSK_MODEL_URLS[tier]
}

export const WHISPER_JOURNAL_PROMPT =
  'A personal journal entry in conversational English.'
