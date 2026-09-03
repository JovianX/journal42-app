import { useCallback, useEffect, useState } from 'react'
import {
  loadSpeechLabSettings,
  saveSpeechLabSettings,
  subscribeSpeechLabSettings,
  type SpeechLabSettings,
} from './settings'

export function useSpeechLabSettings() {
  const [settings, setSettings] = useState(loadSpeechLabSettings)

  useEffect(() => {
    return subscribeSpeechLabSettings(() => {
      setSettings(loadSpeechLabSettings())
    })
  }, [])

  const updateSettings = useCallback((next: SpeechLabSettings) => {
    setSettings(next)
    saveSpeechLabSettings(next)
  }, [])

  return [settings, updateSettings] as const
}
