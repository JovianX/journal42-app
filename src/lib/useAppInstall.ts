import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallListener = () => void

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<InstallListener>()

function notifyInstallListeners() {
  for (const listener of listeners) listener()
}

function onBeforeInstall(event: Event) {
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  notifyInstallListeners()
}

function onAppInstalled() {
  deferredPrompt = null
  notifyInstallListeners()
}

let captured = false

export function captureAppInstallEvents() {
  if (typeof window === 'undefined' || captured) return
  captured = true
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onAppInstalled)
}

if (typeof window !== 'undefined') {
  captureAppInstallEvents()
}

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return Boolean(nav.standalone)
}

function isIosSafari() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  const webkit = /WebKit/.test(ua)
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit && notChrome
}

export type AppInstallState =
  | { kind: 'installed' }
  | { kind: 'prompt'; install: () => Promise<void>; busy: boolean }
  | { kind: 'ios-hint' }
  | { kind: 'unavailable' }

export function useAppInstall(): AppInstallState {
  const [installed, setInstalled] = useState(isStandaloneDisplay)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => deferredPrompt,
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function syncDeferred() {
      setDeferred(deferredPrompt)
    }

    function onDisplayModeChange(event: MediaQueryListEvent) {
      if (event.matches) setInstalled(true)
    }

    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener('change', onDisplayModeChange)
    listeners.add(syncDeferred)
    setInstalled(isStandaloneDisplay())
    syncDeferred()

    return () => {
      media.removeEventListener('change', onDisplayModeChange)
      listeners.delete(syncDeferred)
    }
  }, [])

  if (installed) {
    return { kind: 'installed' }
  }

  if (deferred) {
    return {
      kind: 'prompt',
      busy,
      install: async () => {
        if (busy) return
        setBusy(true)
        try {
          await deferred.prompt()
          await deferred.userChoice
          deferredPrompt = null
          setDeferred(null)
          notifyInstallListeners()
        } finally {
          setBusy(false)
        }
      },
    }
  }

  if (isIosSafari()) {
    return { kind: 'ios-hint' }
  }

  return { kind: 'unavailable' }
}
