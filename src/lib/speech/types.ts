export type SpeechEngineId = 'web-speech' | 'whisper' | 'vosk'

export type SpeechEngineStatus =
  | 'unsupported'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'error'

export type SpeechEngineMeta = {
  id: SpeechEngineId
  title: string
  subtitle: string
  privacy: 'cloud' | 'local'
  modelNote?: string
}

export type SpeechEngineSnapshot = {
  status: SpeechEngineStatus
  supported: boolean
  error: string | null
  finalText: string
  interimText: string
  /** Normalized mic energy 0–1 while listening (0 when idle). */
  inputLevel: number
  /** True when recent mic energy crosses a speech threshold. */
  hearingVoice: boolean
  loadMs: number | null
  lastUpdateMs: number | null
  updateCount: number
  statusDetail: string
}

export type SpeechEngineController = SpeechEngineSnapshot & {
  requiresReload: boolean
  /** Returns true when the model is ready to start listening. */
  loadModel: () => Promise<boolean>
  isModelReady: () => boolean
  start: () => Promise<void>
  stop: () => void | Promise<void>
  clear: () => void
  getTranscript: () => string
}
