import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechEngineController } from './types'
import {
  speechWordsFromTranscript,
  syncRevealedVoiceWords,
  type RevealedVoiceWord,
} from './voiceTranscriptWords'
const RECENT_WORD_COUNT = 4

export function useVoiceCompose(
  engine: SpeechEngineController,
  options: {
    value: string
    onChange: (value: string) => void
    focusInput?: () => void
  },
) {
  const { value, onChange, focusInput } = options
  const valueRef = useRef(value)
  valueRef.current = value
  const wordIdRef = useRef(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const [revealedWords, setRevealedWords] = useState<RevealedVoiceWord[]>([])

  const isListening =
    engine.status === 'listening' || engine.status === 'processing'
  const isLoading = engine.status === 'loading'
  const hearingVoice = isListening && engine.hearingVoice
  const level = Math.max(0, Math.min(1, engine.inputLevel))
  const recentWords = revealedWords.slice(-RECENT_WORD_COUNT)

  useEffect(() => {
    if (!voiceMode) {
      setRevealedWords([])
      wordIdRef.current = 0
      return
    }

    const nextWords = speechWordsFromTranscript(
      engine.finalText,
      engine.interimText,
    )
    setRevealedWords((previous) =>
      syncRevealedVoiceWords(previous, nextWords, wordIdRef),
    )
  }, [voiceMode, engine.finalText, engine.interimText])

  const exitVoiceMode = useCallback(
    async (appendTranscript: boolean) => {
      await engine.stop()
      if (appendTranscript) {
        const spoken = engine.getTranscript()
        if (spoken) {
          const current = valueRef.current
          onChange(current.trim() ? `${current.trimEnd()} ${spoken}` : spoken)
        }
      }
      engine.clear()
      setVoiceMode(false)
      setRevealedWords([])
      wordIdRef.current = 0
      window.requestAnimationFrame(() => {
        focusInput?.()
      })
    },
    [engine, focusInput, onChange],
  )

  const enterVoiceMode = useCallback(async () => {
    setVoiceMode(true)
    setRevealedWords([])
    wordIdRef.current = 0
    engine.clear()

    const needsLoad = !engine.isModelReady() || engine.requiresReload
    if (needsLoad) {
      const ready = await engine.loadModel()
      if (!ready) {
        setVoiceMode(false)
        return
      }
    }

    const started = await engine.start()
    if (started === false) {
      setVoiceMode(false)
    }
  }, [engine])

  const toggleVoiceMode = useCallback(async () => {
    if (voiceMode) {
      await exitVoiceMode(true)
      return
    }
    await enterVoiceMode()
  }, [enterVoiceMode, exitVoiceMode, voiceMode])

  useEffect(() => {
    if (!voiceMode) return
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        void exitVoiceMode(true)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [voiceMode, exitVoiceMode])

  const hint = isLoading
    ? 'Preparing mic…'
    : engine.status === 'error'
      ? 'Mic unavailable'
      : hearingVoice
        ? 'Hearing you'
        : 'Listening'

  return {
    voiceMode,
    isListening,
    isLoading,
    hearingVoice,
    level,
    recentWords,
    hint,
    error: engine.error,
    toggleVoiceMode,
    exitVoiceMode,
    enterVoiceMode,
  }
}
