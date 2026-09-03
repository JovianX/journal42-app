import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeRms,
  downsampleTo16kQuality,
  isLikelyWhisperHallucination,
  isSpeechActive,
  prependOverlap,
  tailOverlap,
  takeAudioChunk,
} from './audioUtils'
import { closeMicrophone, openMicrophone } from './microphone'
import {
  effectiveWhisperDtype,
  WHISPER_JOURNAL_PROMPT,
  whisperQuantizationFallbackNote,
  whisperSettingsKey,
  type SpeechLabSettings,
} from './settings'
import { isQuantizedWhisperSessionError, loadWhisperPipeline } from './whisperPipeline'
import { mergeTranscripts } from './transcriptMerge'
import type { SpeechEngineController, SpeechEngineSnapshot } from './types'
import { SpeechSegmenter } from './vad'
import { mergeVoiceTranscript } from './voiceTranscriptWords'
import { SileroSpeechSegmenter } from './sileroSegmenter'
import { loadSileroVadSession } from './sileroVad'

type WhisperPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text?: string } | string>

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

export function useWhisperEngine(settings: SpeechLabSettings): SpeechEngineController {
  const [snapshot, setSnapshot] = useState<SpeechEngineSnapshot>(INITIAL)
  const [requiresReload, setRequiresReload] = useState(false)
  const settingsRef = useRef(settings)
  const transcriberRef = useRef<WhisperPipeline | null>(null)
  const loadedKeyRef = useRef<string | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const micRef = useRef<Awaited<ReturnType<typeof openMicrophone>> | null>(null)
  const segmenterRef = useRef<SpeechSegmenter | null>(null)
  const sileroSegmenterRef = useRef<SileroSpeechSegmenter | null>(null)
  const sampleRateRef = useRef(16_000)
  const listeningRef = useRef(false)
  const processingRef = useRef(false)
  const queueRef = useRef<Array<{ audio: Float32Array; rms: number }>>([])
  const pendingRef = useRef<Float32Array[]>([])
  const pendingLengthRef = useRef(0)
  const chunkSamplesRef = useRef(48_000)
  const overlapSamplesRef = useRef(0)
  const overlapTailRef = useRef<Float32Array | null>(null)
  const finalRef = useRef('')
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const modelKey = useMemo(() => whisperSettingsKey(settings), [settings])

  settingsRef.current = settings

  const unloadModel = useCallback(() => {
    transcriberRef.current = null
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
      statusDetail: 'Whisper settings changed. Reload the model.',
    }))
  }, [modelKey, unloadModel])

  const drainQueueRef = useRef<() => Promise<void>>(async () => {})

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    segmenterRef.current?.flush().forEach((segment) => {
      queueRef.current.push({ audio: segment, rms: computeRms(segment) })
    })
    segmenterRef.current = null
    void sileroSegmenterRef.current?.flush()
    sileroSegmenterRef.current = null
    closeMicrophone(micRef.current)
    micRef.current = null
    pendingRef.current = []
    pendingLengthRef.current = 0
    overlapTailRef.current = null
  }, [])

  const stop = useCallback(() => {
    listeningRef.current = false
    teardownAudio()
    void drainQueueRef.current()
    setSnapshot((current) => ({
      ...current,
      status: transcriberRef.current ? 'ready' : current.status,
      interimText: '',
      inputLevel: 0,
      hearingVoice: false,
      statusDetail: transcriberRef.current ? 'Stopped.' : current.statusDetail,
    }))
  }, [teardownAudio])

  const clear = useCallback(() => {
    finalRef.current = ''
    setSnapshot((current) => ({
      ...current,
      finalText: '',
      interimText: '',
      lastUpdateMs: null,
      updateCount: 0,
      statusDetail: transcriberRef.current ? 'Cleared.' : current.statusDetail,
    }))
  }, [])

  const drainQueue = useCallback(async () => {
    if (processingRef.current || !transcriberRef.current) return
    processingRef.current = true
    const activeSettings = settingsRef.current

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()
      if (!item || item.audio.length === 0) continue

      const vadMode = activeSettings.whisper.vadMode
      if (
        vadMode !== 'off' &&
        vadMode !== 'silero' &&
        !isSpeechActive(item.audio, activeSettings.whisper.rmsThreshold * 0.85)
      ) {
        continue
      }

      const started = performance.now()
      setSnapshot((current) => ({
        ...current,
        status: 'processing',
        statusDetail: 'Transcribing speech…',
      }))

      try {
        const audio = await downsampleTo16kQuality(
          item.audio,
          sampleRateRef.current,
        )
        const options: Record<string, unknown> = {}
        if (activeSettings.whisper.journalPrompt) {
          options.initial_prompt = WHISPER_JOURNAL_PROMPT
        }

        let raw: { text?: string } | string
        try {
          raw = await transcriberRef.current(audio, options)
        } catch {
          raw = await transcriberRef.current(audio)
        }

        const text =
          typeof raw === 'string'
            ? raw
            : (raw.text ?? '').trim()

        const keepText =
          text &&
          (!activeSettings.whisper.hallucinationFilter ||
            !isLikelyWhisperHallucination(text, item.rms))

        if (keepText) {
          finalRef.current = mergeTranscripts(finalRef.current, text)
        }

        const latency = Math.round(performance.now() - started)
        setSnapshot((current) => ({
          ...current,
          status: listeningRef.current ? 'listening' : 'ready',
          error: null,
          finalText: finalRef.current,
          interimText: keepText ? text : '',
          lastUpdateMs: latency,
          updateCount: current.updateCount + 1,
          statusDetail: listeningRef.current
            ? 'Listening. Transcribes when you speak.'
            : 'Stopped.',
        }))
      } catch (error) {
        setSnapshot((current) => ({
          ...current,
          status: 'error',
          error:
            error instanceof Error ? error.message : 'Whisper transcription failed.',
          statusDetail: 'Error while transcribing.',
        }))
        listeningRef.current = false
        break
      }
    }

    processingRef.current = false
  }, [])

  drainQueueRef.current = drainQueue

  const getTranscript = useCallback(
    () =>
      mergeVoiceTranscript(
        snapshotRef.current.finalText,
        snapshotRef.current.interimText,
      ),
    [],
  )

  const enqueueSegment = useCallback(
    (segment: Float32Array) => {
      const withOverlap = prependOverlap(segment, overlapTailRef.current)
      overlapTailRef.current = tailOverlap(
        withOverlap,
        overlapSamplesRef.current,
      )
      queueRef.current.push({
        audio: withOverlap,
        rms: computeRms(withOverlap),
      })
      void drainQueue()
    },
    [drainQueue],
  )

  const loadModel = useCallback(async () => {
    const activeSettings = settingsRef.current
    const nextKey = whisperSettingsKey(activeSettings)

    if (transcriberRef.current && loadedKeyRef.current === nextKey) {
      setRequiresReload(false)
      setSnapshot((current) => ({
        ...current,
        status: 'ready',
        statusDetail: 'Model already loaded.',
      }))
      return true
    }

    transcriberRef.current = null
    loadedKeyRef.current = null

    const started = performance.now()
    setSnapshot((current) => ({
      ...current,
      status: 'loading',
      error: null,
      statusDetail: 'Downloading Whisper model…',
    }))

    try {
      const requestedQuantization = activeSettings.whisper.quantization
      const plannedDtype = effectiveWhisperDtype(requestedQuantization)
      const fallbackNote = whisperQuantizationFallbackNote(
        requestedQuantization,
        plannedDtype,
      )

      if (fallbackNote) {
        setSnapshot((current) => ({
          ...current,
          status: 'loading',
          statusDetail: `Loading Whisper (${fallbackNote})…`,
        }))
      }

      const { transcriber, loadedDtype } = await loadWhisperPipeline(
        activeSettings.whisper.modelSize,
        requestedQuantization,
      )

      transcriberRef.current = transcriber
      loadedKeyRef.current = nextKey
      setRequiresReload(false)

      if (activeSettings.whisper.vadMode === 'silero') {
        setSnapshot((current) => ({
          ...current,
          status: 'loading',
          statusDetail: 'Downloading Silero VAD model…',
        }))
        await loadSileroVadSession()
      }

      const loadMs = Math.round(performance.now() - started)
      const dtypeLabel =
        whisperQuantizationFallbackNote(requestedQuantization, loadedDtype) ??
        loadedDtype

      setSnapshot((current) => ({
        ...current,
        status: 'ready',
        loadMs,
        statusDetail: `Loaded ${activeSettings.whisper.modelSize} (${dtypeLabel}) in ${(loadMs / 1000).toFixed(1)}s.`,
      }))
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not load Whisper.'
      const hint = isQuantizedWhisperSessionError(message)
        ? ' Select fp32 quantization in the panel below.'
        : ''

      setSnapshot((current) => ({
        ...current,
        status: 'error',
        error: `${message}${hint}`,
        statusDetail: 'Model load failed.',
      }))
      return false
    }
  }, [])

  const isModelReady = useCallback(
    () =>
      Boolean(
        transcriberRef.current &&
          loadedKeyRef.current === whisperSettingsKey(settingsRef.current),
      ),
    [],
  )

  const start = useCallback(async () => {
    if (!transcriberRef.current) {
      setSnapshot((current) => ({
        ...current,
        error: 'Load the model first.',
        statusDetail: 'Load the model before recording.',
      }))
      return
    }

    stop()

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
      return
    }

    sampleRateRef.current = mic.sampleRate
    chunkSamplesRef.current = Math.floor(
      (mic.sampleRate * activeSettings.whisper.chunkSeconds * 1000) / 1000,
    )
    overlapSamplesRef.current = Math.floor(
      (mic.sampleRate * activeSettings.whisper.overlapSeconds * 1000) / 1000,
    )
    overlapTailRef.current = null
    segmenterRef.current = null
    sileroSegmenterRef.current = null

    if (activeSettings.whisper.vadMode === 'silero') {
      setSnapshot((current) => ({
        ...current,
        status: 'loading',
        statusDetail: 'Starting Silero VAD…',
      }))
      try {
        sileroSegmenterRef.current = await SileroSpeechSegmenter.create({
          speechThreshold: activeSettings.whisper.sileroThreshold,
          negativeThreshold: Math.max(
            0.15,
            activeSettings.whisper.sileroThreshold - 0.15,
          ),
          sampleRate: 16_000,
          maxSegmentMs: activeSettings.whisper.chunkSeconds * 1000,
          minSpeechMs: 350,
          hangoverMs: 700,
          onSegment: (segment) => enqueueSegment(segment),
        })
      } catch (error) {
        setSnapshot((current) => ({
          ...current,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Could not start Silero VAD.',
          statusDetail: 'Silero VAD failed to load.',
        }))
        closeMicrophone(mic)
        return
      }
    } else if (
      activeSettings.whisper.vadMode === 'rms' ||
      activeSettings.whisper.vadMode === 'enhanced'
    ) {
      segmenterRef.current = new SpeechSegmenter({
        mode: activeSettings.whisper.vadMode,
        rmsThreshold: activeSettings.whisper.rmsThreshold,
        sampleRate: mic.sampleRate,
        maxSegmentMs: activeSettings.whisper.chunkSeconds * 1000,
        minSpeechMs: 350,
        hangoverMs: 700,
      })
    }

    const source = mic.audioContext.createMediaStreamSource(mic.stream)
    const processor = mic.audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      if (!listeningRef.current) return
      const input = event.inputBuffer.getChannelData(0)
      const frame = input.slice()

      if (activeSettings.whisper.vadMode === 'off') {
        pendingRef.current.push(frame)
        pendingLengthRef.current += frame.length

        let taken = takeAudioChunk(
          pendingRef.current,
          pendingLengthRef.current,
          chunkSamplesRef.current,
        )

        while (taken.chunk) {
          enqueueSegment(taken.chunk)
          taken = takeAudioChunk(
            taken.pending,
            taken.pendingLength,
            chunkSamplesRef.current,
          )
        }

        pendingRef.current = taken.pending
        pendingLengthRef.current = taken.pendingLength
        return
      }

      if (activeSettings.whisper.vadMode === 'silero') {
        sileroSegmenterRef.current?.push(frame, mic.sampleRate)
        return
      }

      const segments = segmenterRef.current?.feed(frame) ?? []
      for (const segment of segments) {
        enqueueSegment(segment)
      }
    }

    source.connect(processor)
    processor.connect(mic.audioContext.destination)

    micRef.current = mic
    processorRef.current = processor
    listeningRef.current = true

    setSnapshot((current) => ({
      ...current,
      status: 'listening',
      error: null,
      statusDetail:
        activeSettings.whisper.vadMode === 'off'
          ? `Listening. Fixed ${activeSettings.whisper.chunkSeconds}s chunks.`
          : activeSettings.whisper.vadMode === 'silero'
            ? 'Listening with Silero VAD segmentation.'
            : 'Listening. Transcribes speech segments.',
    }))
  }, [enqueueSegment, stop])

  useEffect(() => () => {
    listeningRef.current = false
    teardownAudio()
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
