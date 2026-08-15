const LANDING_DRAFT_KEY = 'j42_landing_draft'
const MAX_DRAFT_CHARS = 1200

function cleanDraft(value: string | null | undefined) {
  const cleaned = value?.trim() ?? ''
  if (!cleaned) return null
  return cleaned.slice(0, MAX_DRAFT_CHARS)
}

export function saveLandingDraft(text: string) {
  const cleaned = cleanDraft(text)
  if (!cleaned) return
  try {
    sessionStorage.setItem(
      LANDING_DRAFT_KEY,
      JSON.stringify({ text: cleaned, savedAt: Date.now() }),
    )
  } catch {
    // Private mode / quota: ignore.
  }
}

export function readLandingDraft(): string | null {
  try {
    const raw = sessionStorage.getItem(LANDING_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { text?: unknown }
    return typeof parsed.text === 'string' ? cleanDraft(parsed.text) : null
  } catch {
    return null
  }
}

export function clearLandingDraft() {
  try {
    sessionStorage.removeItem(LANDING_DRAFT_KEY)
  } catch {
    // ignore
  }
}

/** Pull ?draft= into sessionStorage and strip it from the URL. */
export function captureLandingDraftFromSearch(
  search: string = window.location.search,
) {
  const params = new URLSearchParams(search)
  const fromQuery = cleanDraft(params.get('draft'))
  if (fromQuery) saveLandingDraft(fromQuery)

  if (!params.has('draft')) return readLandingDraft()

  params.delete('draft')
  const next = `${window.location.pathname}${
    params.toString() ? `?${params}` : ''
  }${window.location.hash}`
  window.history.replaceState(null, '', next)
  return readLandingDraft()
}
