import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
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
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setDeferred(null)
      setInstalled(true)
    }

    function onDisplayModeChange(event: MediaQueryListEvent) {
      if (event.matches) setInstalled(true)
    }

    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener('change', onDisplayModeChange)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    setInstalled(isStandaloneDisplay())

    return () => {
      media.removeEventListener('change', onDisplayModeChange)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
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
          setDeferred(null)
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
