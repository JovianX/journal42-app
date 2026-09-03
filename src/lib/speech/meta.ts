import type { SpeechEngineMeta } from './types'

export const SPEECH_ENGINE_META: SpeechEngineMeta[] = [
  {
    id: 'web-speech',
    title: 'Web Speech API',
    subtitle: 'Browser built-in dictation. Interim results while you speak.',
    privacy: 'cloud',
    modelNote: 'Chrome + internet required. Sends audio to Google.',
  },
  {
    id: 'whisper',
    title: 'Whisper (local)',
    subtitle: 'Whisper tiny runs in-browser via Transformers.js, ~2s chunks.',
    privacy: 'local',
    modelNote: 'First load downloads ~40 MB. Updates every ~2 seconds.',
  },
  {
    id: 'vosk',
    title: 'Vosk (local streaming)',
    subtitle: 'Lightweight Kaldi model with continuous partial results.',
    privacy: 'local',
    modelNote: 'First load downloads ~40 MB. Partial text while speaking; optional punctuation in Voice Lab.',
  },
]
