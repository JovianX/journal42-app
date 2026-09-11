let desired = false
let sentinel: WakeLockSentinel | null = null
let watching = false
let inFlight: Promise<void> | null = null
let releaseTimer: number | null = null

function canRequestWakeLock() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

function onSentinelRelease() {
  sentinel = null
}

function cancelScheduledRelease() {
  if (releaseTimer === null) return
  window.clearTimeout(releaseTimer)
  releaseTimer = null
}

async function acquire() {
  if (!desired || !canRequestWakeLock()) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return
  }
  if (sentinel && !sentinel.released) return

  try {
    const next = await navigator.wakeLock.request('screen')
    if (!desired || next.released) {
      if (!next.released) await next.release()
      return
    }
    sentinel = next
    sentinel.addEventListener('release', onSentinelRelease)
  } catch {
    // Unsupported, permission denied, or battery saver — keep composing.
  }
}

function runAcquire() {
  const pending = (inFlight ?? Promise.resolve()).then(acquire, acquire)
  inFlight = pending.finally(() => {
    if (inFlight === pending) inFlight = null
  })
  return inFlight
}

function releaseNow() {
  const current = sentinel
  sentinel = null
  if (current && !current.released) {
    current.removeEventListener('release', onSentinelRelease)
    void current.release()
  }
}

function onVisibilityChange() {
  if (desired && document.visibilityState === 'visible') {
    void runAcquire()
  }
}

function ensureWatching() {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('visibilitychange', onVisibilityChange)
}

export function holdScreenWakeLock() {
  desired = true
  cancelScheduledRelease()
  ensureWatching()
  void runAcquire()
}

export function releaseScreenWakeLock() {
  desired = false
  cancelScheduledRelease()
  // Defer so React Strict Mode's immediate unmount/remount does not drop
  // a lock acquired from the mic tap's user gesture.
  releaseTimer = window.setTimeout(() => {
    releaseTimer = null
    if (!desired) releaseNow()
  }, 0)
}
