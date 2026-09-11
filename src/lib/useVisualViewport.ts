import { useEffect } from 'react'

const KEYBOARD_OPEN_PX = 80
const KEYBOARD_LINGER_PX = 180

function isTextField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true
  return el.isContentEditable
}

function syncVisualViewport() {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const obscured = Math.max(0, window.innerHeight - height)
  const editing = isTextField(document.activeElement)
  const open = obscured >= (editing ? KEYBOARD_OPEN_PX : KEYBOARD_LINGER_PX)
  const root = document.documentElement
  root.style.setProperty('--visual-viewport-height', `${height}px`)
  root.classList.toggle('is-keyboard-open', open)
}

function keepFocusedFieldVisible() {
  if (!document.documentElement.classList.contains('is-keyboard-open')) return

  const active = document.activeElement
  if (!isTextField(active) || !(active instanceof HTMLElement)) return

  const viewport = window.visualViewport
  if (!viewport) return

  const frame = active.closest('.nugget-composer-frame, .draft-voice-reply')
  const target = frame instanceof HTMLElement ? frame : active
  const rect = target.getBoundingClientRect()
  const viewBottom = viewport.offsetTop + viewport.height
  const overlap = rect.bottom - viewBottom + 16
  if (overlap > 1) {
    window.scrollBy({ top: overlap, behavior: 'instant' })
  }
}

if (typeof window !== 'undefined') {
  syncVisualViewport()
}

export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    let frame = 0

    function update(keepInView: boolean) {
      syncVisualViewport()
      if (!keepInView) return
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        keepFocusedFieldVisible()
      })
    }

    function onViewportResize() {
      update(true)
    }

    function onViewportMetrics() {
      update(false)
    }

    function onFocusIn() {
      update(true)
    }

    function onFocusOut() {
      requestAnimationFrame(() => update(false))
    }

    syncVisualViewport()
    viewport?.addEventListener('resize', onViewportResize)
    viewport?.addEventListener('scroll', onViewportMetrics)
    window.addEventListener('resize', onViewportMetrics)
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', onViewportResize)
      viewport?.removeEventListener('scroll', onViewportMetrics)
      window.removeEventListener('resize', onViewportMetrics)
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      const root = document.documentElement
      root.style.removeProperty('--visual-viewport-height')
      root.classList.remove('is-keyboard-open')
    }
  }, [])
}
