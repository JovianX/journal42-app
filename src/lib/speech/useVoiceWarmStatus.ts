import { useSyncExternalStore } from 'react'
import {
  getVoiceWarmSnapshot,
  subscribeVoskModelCache,
  type VoiceWarmSnapshot,
} from './voskModelCache'

function getServerSnapshot(): VoiceWarmSnapshot {
  return { phase: 'idle', error: null }
}

export function useVoiceWarmStatus() {
  return useSyncExternalStore(
    subscribeVoskModelCache,
    getVoiceWarmSnapshot,
    getServerSnapshot,
  )
}

export function voiceWarmStatusLabel(snapshot: VoiceWarmSnapshot): string | null {
  switch (snapshot.phase) {
    case 'queued':
      return 'Preparing voice…'
    case 'vosk':
      return 'Downloading voice model…'
    case 'punctuation':
      return 'Downloading punctuation…'
    case 'ready':
      return 'Voice ready'
    case 'error':
      return snapshot.error ?? 'Voice download failed'
    case 'skipped':
      return 'Voice download skipped on this connection'
    case 'idle':
    default:
      return null
  }
}
