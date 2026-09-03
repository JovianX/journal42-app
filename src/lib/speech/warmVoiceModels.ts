type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
}

/** Skip large background downloads on Save-Data or very slow links. */
export function shouldWarmVoiceModels() {
  if (typeof navigator === 'undefined') return false
  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection
  if (connection?.saveData) return false
  if (
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return false
  }
  return true
}

export function scheduleIdleWork(work: () => void, delayMs = 800) {
  // Prefer a short timer over requestIdleCallback so large model warms
  // actually start even while the main thread stays busy (lock UI, PWA).
  const timer = window.setTimeout(work, delayMs)
  return () => window.clearTimeout(timer)
}
