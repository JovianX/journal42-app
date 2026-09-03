import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeVoiceTranscript } from './voiceTranscriptWords'
import type { SpeechEngineController, SpeechEngineSnapshot } from './types'

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

const INITIAL: SpeechEngineSnapshot = {
  status: 'idle',
  supported: true,
  error: null,
  finalText: '',
  interimText: '',
  inputLevel: 0,
  hearingVoice: false,
  loadMs: null,
  lastUpdateMs: null,
  updateCount: 0,
  statusDetail: 'Uses Chrome with an internet connection.',
}

function buildTranscript(results: SpeechRecognitionResultList) {
  let final = ''
  let interim = ''

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const chunk = result[0]?.transcript ?? ''
    if (result.isFinal) {
      final += chunk
    } else {
      interim += chunk
    }
  }

  return {
    finalText: final.trim() ? `${final.trim()} ` : '',
    interimText: interim,
  }
}

export function useWebSpeechEngine(): SpeechEngineController {
  const ctor = getSpeechRecognitionCtor()
  const [snapshot, setSnapshot] = useState<SpeechEngineSnapshot>(() => ({
    ...INITIAL,
    supported: Boolean(ctor),
    status: ctor ? 'ready' : 'unsupported',
    statusDetail: ctor
      ? 'Ready in Chrome. Needs internet.'
      : 'Use Chrome on desktop for this option.',
  }))

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const listeningRef = useRef(false)
  const stoppingRef = useRef(false)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const getTranscript = useCallback(
    () =>
      mergeVoiceTranscript(
        snapshotRef.current.finalText,
        snapshotRef.current.interimText,
      ),
    [],
  )

  const stop = useCallback(() => {
    listeningRef.current = false
    stoppingRef.current = true
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.abort()
    setSnapshot((current) => ({
      ...current,
      status: current.supported ? 'ready' : 'unsupported',
      interimText: '',
      inputLevel: 0,
      hearingVoice: false,
      statusDetail: 'Stopped.',
    }))
  }, [])

  const clear = useCallback(() => {
    setSnapshot((current) => ({
      ...current,
      finalText: '',
      interimText: '',
      lastUpdateMs: null,
      updateCount: 0,
      statusDetail: current.supported ? 'Cleared.' : current.statusDetail,
    }))
  }, [])

  const start = useCallback(async () => {
    if (!ctor) return

    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }

    listeningRef.current = false
    stoppingRef.current = false

    const recognition = new ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const { finalText, interimText } = buildTranscript(event.results)
      setSnapshot((current) => ({
        ...current,
        status: 'listening',
        error: null,
        finalText,
        interimText,
        hearingVoice: Boolean(interimText),
        inputLevel: interimText ? 0.55 : 0.12,
        lastUpdateMs: Math.round(performance.now()),
        updateCount: current.updateCount + 1,
        statusDetail: interimText ? 'Hearing you…' : 'Listening.',
      }))
    }

    recognition.onerror = (event) => {
      if (stoppingRef.current && event.error === 'aborted') {
        stoppingRef.current = false
        return
      }

      if (event.error === 'no-speech') {
        setSnapshot((current) => ({
          ...current,
          status: listeningRef.current ? 'listening' : 'ready',
          error: null,
          statusDetail: listeningRef.current
            ? 'Still listening — start speaking.'
            : current.statusDetail,
        }))
        return
      }

      if (event.error === 'aborted') return

      if (event.error === 'network') {
        listeningRef.current = false
        setSnapshot((current) => ({
          ...current,
          status: 'error',
          error: 'Web Speech needs Chrome and a working internet connection.',
          statusDetail: 'Could not reach Google speech servers.',
        }))
        return
      }

      const blocked = event.error === 'not-allowed'
      listeningRef.current = false
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        error: blocked
          ? 'Microphone permission denied.'
          : `Speech recognition error: ${event.error}.`,
        interimText: '',
        statusDetail: 'Error.',
      }))
    }

    recognition.onend = () => {
      if (!listeningRef.current) return
      window.setTimeout(() => {
        if (!listeningRef.current || recognitionRef.current !== recognition) return
        try {
          recognition.start()
        } catch {
          listeningRef.current = false
          setSnapshot((current) => ({
            ...current,
            status: 'ready',
            interimText: '',
            statusDetail: 'Session ended.',
          }))
        }
      }, 120)
    }

    recognitionRef.current = recognition
    listeningRef.current = true

    setSnapshot((current) => ({
      ...current,
      status: 'listening',
      error: null,
      statusDetail: 'Starting microphone…',
    }))

    try {
      recognition.start()
    } catch (error) {
      listeningRef.current = false
      recognitionRef.current = null
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Could not start speech recognition.',
        statusDetail: 'Error.',
      }))
    }
  }, [ctor])

  useEffect(() => () => {
    listeningRef.current = false
    recognitionRef.current?.abort()
    recognitionRef.current = null
  }, [])

  return {
    ...snapshot,
    requiresReload: false,
    loadModel: async () => true,
    isModelReady: () => Boolean(ctor),
    start,
    stop,
    clear,
    getTranscript,
  }
}
