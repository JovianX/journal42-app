type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded?: boolean
  version?: string
  push?: (...args: unknown[]) => void
}

type PixelWindow = Window & {
  fbq?: FbqFn
  _fbq?: FbqFn
}

const COMPLETE_REGISTRATION_KEY = 'j42_fb_complete_registration'

let initialized = false

const DEFAULT_META_PIXEL_ID = '1957935677758041'

function getMetaPixelId() {
  return import.meta.env.VITE_META_PIXEL_ID?.trim() || DEFAULT_META_PIXEL_ID
}

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return

  const script = document.createElement('script')
  script.src = src
  script.async = true
  const first = document.getElementsByTagName('script')[0]
  first?.parentNode?.insertBefore(script, first)
}

export function initMetaPixel() {
  if (!import.meta.env.PROD) return
  const pixelId = getMetaPixelId()
  if (!pixelId || initialized) return

  const win = window as PixelWindow
  if (!win.fbq) {
    const fbq: FbqFn = (...args: unknown[]) => {
      if (fbq.callMethod) {
        fbq.callMethod(...args)
      } else {
        fbq.queue.push(args)
      }
    }
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.push = fbq
    win.fbq = fbq
    win._fbq = fbq
  }

  loadScript('https://connect.facebook.net/en_US/fbevents.js')
  win.fbq('init', pixelId)
  initialized = true
}

export function trackMetaPageView() {
  if (!import.meta.env.PROD) return
  initMetaPixel()
  const win = window as PixelWindow
  if (typeof win.fbq === 'function') {
    win.fbq('track', 'PageView')
  }
}

export function trackCompleteRegistration() {
  if (!import.meta.env.PROD) return
  initMetaPixel()

  try {
    if (sessionStorage.getItem(COMPLETE_REGISTRATION_KEY) === '1') return
    sessionStorage.setItem(COMPLETE_REGISTRATION_KEY, '1')
  } catch {
    // Private mode: still send once this call.
  }

  const win = window as PixelWindow
  if (typeof win.fbq === 'function') {
    win.fbq('track', 'CompleteRegistration')
  }
}
