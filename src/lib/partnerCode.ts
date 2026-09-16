const COOKIE_NAME = 'j42_a'
const STORAGE_KEY = 'j42_a'
const CLICK_KEY_PREFIX = 'j42_a_click:'
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60

export function normalizePartnerCode(value: string | null | undefined) {
  const code = value?.trim().toLowerCase() ?? ''
  if (!code) return ''
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(code)) return ''
  return code
}

function cookieDomain() {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'journal42.cloud' || host.endsWith('.journal42.cloud')) {
    return '.journal42.cloud'
  }
  return ''
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return ''
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const value = part.trim()
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length))
    }
  }
  return ''
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  const domain = cookieDomain()
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  const domainPart = domain ? `; Domain=${domain}` : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}${domainPart}`
}

function readLocalCode() {
  try {
    return normalizePartnerCode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return ''
  }
}

function writeLocalCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Private mode / quota: cookie may still work.
  }
}

export function readPartnerCode() {
  return (
    normalizePartnerCode(readCookie(COOKIE_NAME)) ||
    readLocalCode()
  )
}

function persistPartnerCode(code: string) {
  writeCookie(COOKIE_NAME, code)
  writeLocalCode(code)
}

function clickAlreadyCounted(code: string) {
  try {
    return localStorage.getItem(`${CLICK_KEY_PREFIX}${code}`) === '1'
  } catch {
    return false
  }
}

function markClickCounted(code: string) {
  try {
    localStorage.setItem(`${CLICK_KEY_PREFIX}${code}`, '1')
  } catch {
    // Ignore quota / private mode.
  }
}

export function capturePartnerCodeFromSearch(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
) {
  const existing = readPartnerCode()
  if (existing) return existing

  const params = new URLSearchParams(search)
  const incoming = normalizePartnerCode(params.get('a') || params.get('aff'))
  if (!incoming) return ''

  persistPartnerCode(incoming)
  return incoming
}

/** Persist first-touch code and count a unique click when `?a=` is present. */
export function trackPartnerLinkFromSearch(
  apiBase: string,
  search: string = typeof window === 'undefined' ? '' : window.location.search,
) {
  const params = new URLSearchParams(search)
  const incoming = normalizePartnerCode(params.get('a') || params.get('aff'))
  capturePartnerCodeFromSearch(search)
  if (!incoming || !apiBase) return

  if (clickAlreadyCounted(incoming)) return
  markClickCounted(incoming)

  void fetch(`${apiBase.replace(/\/$/, '')}/partner/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a: incoming }),
    keepalive: true,
    mode: 'cors',
  }).catch(() => {
    // Best-effort; attribution cookie still works.
  })
}
