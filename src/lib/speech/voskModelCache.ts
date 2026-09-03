import type { Model } from 'vosk-browser'
import { preloadPunctuationModel } from './restorePunctuation'
import {
  loadSpeechLabSettings,
  voskModelUrl,
  voskSettingsKey,
  type SpeechLabSettings,
} from './settings'
import { scheduleIdleWork, shouldWarmVoiceModels } from './warmVoiceModels'

type CacheEntry = {
  key: string
  model: Model
}

type Listener = () => void

let cache: CacheEntry | null = null
let inflight: { key: string; promise: Promise<Model> } | null = null
let warmStarted = false
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribeVoskModelCache(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCachedVoskModel(settings: SpeechLabSettings): Model | null {
  const key = voskSettingsKey(settings)
  return cache?.key === key ? cache.model : null
}

export async function ensureVoskModel(
  settings: SpeechLabSettings,
): Promise<Model> {
  const key = voskSettingsKey(settings)
  if (cache?.key === key) return cache.model
  if (inflight?.key === key) return inflight.promise

  if (cache && cache.key !== key) {
    cache.model.terminate()
    cache = null
    notify()
  }

  const promise = (async () => {
    const { createModel } = await import('vosk-browser')
    const model = await createModel(voskModelUrl(settings.vosk.modelTier))
    cache = { key, model }
    notify()
    return model
  })()

  inflight = { key, promise }
  notify()
  try {
    return await promise
  } finally {
    if (inflight?.promise === promise) inflight = null
    notify()
  }
}

export function isVoskModelLoading(settings: SpeechLabSettings) {
  return inflight?.key === voskSettingsKey(settings)
}

export function releaseVoskModel(settings?: SpeechLabSettings) {
  const key = settings ? voskSettingsKey(settings) : null
  if (!cache) return
  if (key && cache.key !== key) return
  cache.model.terminate()
  cache = null
  notify()
}

/** Start Vosk (+ punctuation) downloads without blocking the UI. */
export function warmVoiceModelsInBackground(
  settings: SpeechLabSettings = loadSpeechLabSettings(),
) {
  if (!shouldWarmVoiceModels()) return

  void ensureVoskModel(settings)
    .then(() => {
      if (!settings.vosk.punctuation) return
      return preloadPunctuationModel()
    })
    .catch(() => {
      /* Best-effort warm; mic path surfaces real errors. */
    })
}

/** Schedule a background warm after auth (safe across Strict Mode remounts). */
export function scheduleVoiceModelWarmup(
  settings: SpeechLabSettings = loadSpeechLabSettings(),
) {
  if (warmStarted) return () => {}
  if (!shouldWarmVoiceModels()) return () => {}

  return scheduleIdleWork(() => {
    if (warmStarted) return
    warmStarted = true
    warmVoiceModelsInBackground(settings)
  }, 600)
}
