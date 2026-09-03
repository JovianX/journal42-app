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
    modelNote:
      'First visit downloads ~40 MB Vosk (+ ~67 MB punctuation) in the background. Partial text while speaking.',
  },
]
