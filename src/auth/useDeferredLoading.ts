import { useEffect, useRef, useState } from 'react'

const SHOW_DELAY_MS = 220
const MIN_VISIBLE_MS = 900

/**
 * Avoids a flash on fast auth: wait before showing, then keep it
 * visible long enough for the breath to feel intentional.
 */
export function useDeferredLoading(loading: boolean) {
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef<number | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const clearTimers = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }

    if (loading) {
      clearTimers()
      if (visible) return

      showTimerRef.current = window.setTimeout(() => {
        shownAtRef.current = Date.now()
        setVisible(true)
        showTimerRef.current = null
      }, SHOW_DELAY_MS)

      return clearTimers
    }

    if (!visible) {
      clearTimers()
      return
    }

    const elapsed = Date.now() - (shownAtRef.current ?? Date.now())
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)

    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      shownAtRef.current = null
      hideTimerRef.current = null
    }, remaining)

    return clearTimers
  }, [loading, visible])

  return visible
}
