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

export function scheduleIdleWork(work: () => void, timeoutMs = 2500) {
  const idle = window.requestIdleCallback?.bind(window)
  if (idle) {
    const id = idle(work, { timeout: timeoutMs })
    return () => window.cancelIdleCallback?.(id)
  }
  const timer = window.setTimeout(work, Math.min(1200, timeoutMs))
  return () => window.clearTimeout(timer)
}
