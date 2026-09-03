import { useEffect } from 'react'
import { scheduleVoiceModelWarmup } from '../lib/speech/voskModelCache'

/** Starts Vosk/punctuation downloads as soon as the signed-in shell mounts. */
export default function VoiceModelWarmup() {
  useEffect(() => scheduleVoiceModelWarmup(), [])
  return null
}
