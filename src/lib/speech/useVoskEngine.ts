import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeRms, resampleTo16kSync } from './audioUtils'
import { closeMicrophone, openMicrophone } from './microphone'
import {
  preloadPunctuationModel,
  restorePunctuation,
} from './restorePunctuation'
import {
  voskModelUrl,
  voskSettingsKey,
  type SpeechLabSettings,
} from './settings'
import type { KaldiRecognizer, Model } from 'vosk-browser'
import { mergeVoiceTranscript } from './voiceTranscriptWords'
import type { SpeechEngineController, SpeechEngineSnapshot } from './types'

const VOSK_SAMPLE_RATE = 16_000

const VOICE_RMS_ON = 0.018
const VOICE_RMS_OFF = 0.01

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
  statusDetail: 'Tune accuracy in the panel below, then load the model.',
}

export function useVoskEngine(settings: SpeechLabSettings): SpeechEngineController {
  const [snapshot, setSnapshot] = useState<SpeechEngineSnapshot>(INITIAL)
  const [requiresReload, setRequiresReload] = useState(false)
  const settingsRef = useRef(settings)
  const modelRef = useRef<Model | null>(null)
  const loadedKeyRef = useRef<string | null>(null)
  const recognizerRef = useRef<KaldiRecognizer | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const micRef = useRef<Awaited<ReturnType<typeof openMicrophone>> | null>(null)
  const listeningRef = useRef(false)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const punctuatingRef = useRef(false)
  const loadPromiseRef = useRef<Promise<boolean> | null>(null)

  const modelKey = useMemo(() => voskSettingsKey(settings), [settings])
  settingsRef.current = settings

  const unloadModel = useCallback(() => {
    modelRef.current?.terminate()
    modelRef.current = null
    loadedKeyRef.current = null
    setRequiresReload(false)
    setSnapshot((current) => ({
      ...current,
      status: 'idle',
      loadMs: null,
      statusDetail: 'Model unloaded. Load again after changing settings.',
    }))
  }, [])

  useEffect(() => {
    if (!loadedKeyRef.current) return
    if (loadedKeyRef.current === modelKey) return
    unloadModel()
    setRequiresReload(true)
    setSnapshot((current) => ({
      ...current,
      statusDetail: 'Vosk settings changed. Reload the model.',
    }))
  }, [modelKey, unloadModel])

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    recognizerRef.current?.retrieveFinalResult()
    recognizerRef.current?.remove()
    recognizerRef.current = null
    closeMicrophone(micRef.current)
    micRef.current = null
  }, [])

  const appendFinalPhrase = useCallback(async (rawText: string) => {
    const trimmed = rawText.trim()
    if (!trimmed) return

    const activeSettings = settingsRef.current
    const phrase = activeSettings.vosk.punctuation
      ? await restorePunctuation(trimmed)
      : trimmed

    finalRef.current = finalRef.current
      ? `${finalRef.current.trimEnd()} ${phrase}`
      : phrase

    setSnapshot((current) => ({
      ...current,
      status: 'listening',
      finalText: finalRef.current,
      interimText: '',
      lastUpdateMs: Math.round(performance.now()),
      updateCount: current.updateCount + 1,
      statusDetail: 'Heard a phrase.',
    }))
  }, [])

  const commitInterim = useCallback(async () => {
    const interim = interimRef.current.trim()
    if (!interim) return
    interimRef.current = ''
    await appendFinalPhrase(interim)
  }, [appendFinalPhrase])

  const stop = useCallback((): Promise<void> => {
    listeningRef.current = false
    return commitInterim().finally(() => {
      teardownAudio()
      setSnapshot((current) => ({
        ...current,
        status: modelRef.current ? 'ready' : current.status,
        finalText: finalRef.current,
        interimText: '',
        inputLevel: 0,
        hearingVoice: false,
        statusDetail: modelRef.current ? 'Stopped.' : current.statusDetail,
      }))
    })
  }, [commitInterim, teardownAudio])

  const getTranscript = useCallback(() => {
    return mergeVoiceTranscript(finalRef.current, interimRef.current)
  }, [])

  const clear = useCallback(() => {
    finalRef.current = ''
    interimRef.current = ''
    setSnapshot((current) => ({
      ...current,
      finalText: '',
      interimText: '',
      lastUpdateMs: null,
      updateCount: 0,
      statusDetail: modelRef.current ? 'Cleared.' : current.statusDetail,
    }))
  }, [])

  const loadModel = useCallback(async () => {
    const activeSettings = settingsRef.current
    const nextKey = voskSettingsKey(activeSettings)

    if (modelRef.current && loadedKeyRef.current === nextKey) {
      setRequiresReload(false)
      setSnapshot((current) => ({
        ...current,
        status: 'ready',
        statusDetail: 'Model already loaded.',
      }))
      if (activeSettings.vosk.punctuation) {
        void preloadPunctuationModel().catch(() => {})
      }
      return true
    }

    if (loadPromiseRef.current) return loadPromiseRef.current

    const loadPromise = (async () => {
      modelRef.current?.terminate()
      modelRef.current = null
      loadedKeyRef.current = null

      const started = performance.now()
      setSnapshot((current) => ({
        ...current,
        status: 'loading',
        error: null,
        statusDetail: `Downloading Vosk ${activeSettings.vosk.modelTier} model…`,
      }))

      try {
        const { createModel } = await import('vosk-browser')
        const model = await createModel(voskModelUrl(activeSettings.vosk.modelTier))

        modelRef.current = model
        loadedKeyRef.current = nextKey
        setRequiresReload(false)
        const loadMs = Math.round(performance.now() - started)
        setSnapshot((current) => ({
          ...current,
          status: 'ready',
          loadMs,
          statusDetail: `Loaded ${activeSettings.vosk.modelTier} in ${(loadMs / 1000).toFixed(1)}s.`,
        }))

        // Punctuation (~67MB) warms in parallel; never blocks listening.
        if (activeSettings.vosk.punctuation) {
          void preloadPunctuationModel().catch(() => {
            /* restorePunctuation falls back to basicPunctuation */
          })
        }

        return true
      } catch (error) {
        const tier = activeSettings.vosk.modelTier
        setSnapshot((current) => ({
          ...current,
          status: 'error',
          error:
            tier === 'large'
              ? 'Large Vosk model is not available from the public CDN yet. Switch back to Small.'
              : error instanceof Error
                ? error.message
                : 'Could not load Vosk model.',
          statusDetail: 'Model load failed.',
        }))
        return false
      }
    })()

    loadPromiseRef.current = loadPromise
    try {
      return await loadPromise
    } finally {
      if (loadPromiseRef.current === loadPromise) {
        loadPromiseRef.current = null
      }
    }
  }, [])

  const isModelReady = useCallback(
    () => Boolean(modelRef.current && loadedKeyRef.current === voskSettingsKey(settingsRef.current)),
    [],
  )

  const start = useCallback(async () => {
    const model = modelRef.current
    if (!model) {
      setSnapshot((current) => ({
        ...current,
        error: 'Load the model first.',
        statusDetail: 'Load the model before recording.',
      }))
      return false
    }

    void Promise.resolve(stop())

    const activeSettings = settingsRef.current
    let mic: Awaited<ReturnType<typeof openMicrophone>>
    try {
      mic = await openMicrophone(activeSettings.shared)
    } catch {
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        error: 'Microphone permission denied.',
        statusDetail: 'Could not access microphone.',
      }))
      return false
    }

    const recognizer = new model.KaldiRecognizer(VOSK_SAMPLE_RATE)
    if (activeSettings.vosk.wordTimestamps) {
      recognizer.setWords(true)
    }

    const source = mic.audioContext.createMediaStreamSource(mic.stream)
    const processor = mic.audioContext.createScriptProcessor(4096, 1, 1)

    recognizer.on('result', (message) => {
      if (message.event !== 'result') return
      const text = message.result.text?.trim()
      if (!text) return

      interimRef.current = ''
      if (punctuatingRef.current) return

      punctuatingRef.current = true
      void appendFinalPhrase(text).finally(() => {
        punctuatingRef.current = false
      })
    })

    recognizer.on('partialresult', (message) => {
      if (message.event !== 'partialresult') return
      const partial = message.result.partial?.trim() ?? ''
      interimRef.current = partial

      setSnapshot((current) => ({
        ...current,
        status: 'listening',
        finalText: finalRef.current,
        interimText: partial,
        updateCount: current.updateCount + 1,
        statusDetail: partial ? 'Streaming partial text…' : 'Listening.',
      }))
    })

    let levelFrame = 0
    let hearingVoice = false
    let smoothedLevel = 0
    processor.onaudioprocess = (event) => {
      if (!listeningRef.current) return
      try {
        const input = event.inputBuffer.getChannelData(0)
        levelFrame += 1
        if (levelFrame % 3 === 0) {
          const rms = computeRms(input)
          const rawLevel = Math.min(1, rms / 0.08)
          smoothedLevel = smoothedLevel * 0.7 + rawLevel * 0.3
          if (!hearingVoice && rms >= VOICE_RMS_ON) hearingVoice = true
          else if (hearingVoice && rms < VOICE_RMS_OFF) hearingVoice = false

          const nextHearing = hearingVoice
          const nextLevel = smoothedLevel
          setSnapshot((current) => {
            if (
              Math.abs(current.inputLevel - nextLevel) < 0.05 &&
              current.hearingVoice === nextHearing
            ) {
              return current
            }
            return {
              ...current,
              inputLevel: nextLevel,
              hearingVoice: nextHearing,
            }
          })
        }
        const pcm16k = resampleTo16kSync(
          input,
          mic.sampleRate,
          activeSettings.vosk.resampling,
        )
        recognizer.acceptWaveformFloat(pcm16k, VOSK_SAMPLE_RATE)
      } catch (error) {
        console.error('Vosk acceptWaveformFloat failed', error)
      }
    }

    source.connect(processor)
    processor.connect(mic.audioContext.destination)

    micRef.current = mic
    processorRef.current = processor
    recognizerRef.current = recognizer
    listeningRef.current = true

    setSnapshot((current) => ({
      ...current,
      status: 'listening',
      error: null,
      statusDetail: 'Listening. Partial text updates continuously.',
    }))
    return true
  }, [appendFinalPhrase, stop])

  useEffect(() => () => {
    listeningRef.current = false
    teardownAudio()
    modelRef.current?.terminate()
    modelRef.current = null
  }, [teardownAudio])

  return {
    ...snapshot,
    requiresReload,
    loadModel,
    isModelReady,
    start,
    stop,
    clear,
    getTranscript,
  }
}
