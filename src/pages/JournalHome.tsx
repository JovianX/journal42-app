import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from '../auth/useAuth'
import {
  requestReflection,
  type Reflection,
  type ReflectionHistoryItem,
} from '../lib/ai'

type Nugget = {
  id: string
  text: string
  createdAt: number
}

const STORAGE_KEY = 'journal42.nuggets'
const DRAFT_STORAGE_KEY = 'journal42.draft'
const SHOW_PROOFREAD = false

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function formatDayLabel(timestamp: number, now: number) {
  const day = startOfLocalDay(timestamp)
  const today = startOfLocalDay(now)
  const yesterdayDate = new Date(today)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.getTime()

  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp))
}

type DayGroup = {
  key: string
  label: string
  isToday: boolean
  nuggets: Nugget[]
}

function groupNuggetsByDay(nuggets: Nugget[], now: number): DayGroup[] {
  const todayKey = dayKey(now)
  const groups = new Map<string, DayGroup>()

  for (const nugget of nuggets) {
    const key = dayKey(nugget.createdAt)
    const existing = groups.get(key)
    if (existing) {
      existing.nuggets.push(nugget)
      continue
    }

    groups.set(key, {
      key,
      label: formatDayLabel(nugget.createdAt, now),
      isToday: key === todayKey,
      nuggets: [nugget],
    })
  }

  return Array.from(groups.values())
}

function loadNuggets(): Nugget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Nugget[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function previewText(text: string, max = 72) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max).trimEnd()}…`
}

function DayChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`nugget-day-chevron${expanded ? ' is-expanded' : ''}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function readComposerGap(frame: HTMLElement, gapRef: { current: number | null }) {
  if (gapRef.current !== null) return gapRef.current
  const inline = frame.style.marginBottom
  frame.style.marginBottom = ''
  gapRef.current = parseFloat(window.getComputedStyle(frame).marginBottom) || 0
  frame.style.marginBottom = inline
  return gapRef.current
}

function animateComposerFace(
  frame: HTMLElement | null,
  layers: Array<HTMLElement | null>,
  previousHeight: number,
  gapRef: { current: number | null },
) {
  const activeLayers = layers.filter((layer): layer is HTMLElement => layer !== null)
  if (!frame || activeLayers.length === 0) return

  const nextHeight = frame.offsetHeight
  if (Math.abs(nextHeight - previousHeight) < 1) {
    for (const layer of activeLayers) {
      layer.style.height = `${nextHeight}px`
    }
    return
  }

  const margin = readComposerGap(frame, gapRef)
  const delta = nextHeight - previousHeight

  for (const layer of activeLayers) {
    layer.style.transition = 'none'
    layer.style.height = `${previousHeight}px`
  }
  frame.style.transition = 'none'
  frame.style.marginBottom = `${margin - delta}px`
  void activeLayers[0].offsetHeight

  for (const layer of activeLayers) {
    layer.style.transition = ''
    layer.style.height = `${nextHeight}px`
  }
  frame.style.transition = ''
  frame.style.marginBottom = `${margin}px`
}

const DRAFT_REFLECT_MIN_CHARS = 20
const DRAFT_REFLECT_IDLE_MS = 900
const VOICE_PANEL_MS = 720
const HISTORY_LIMIT = 8

type VoiceTurn = {
  id: string
  comment?: string
  reflection: Reflection
}

function historyFromNuggets(nuggets: Nugget[], excludeId?: string): ReflectionHistoryItem[] {
  return nuggets
    .filter((nugget) => nugget.id !== excludeId)
    .slice(0, HISTORY_LIMIT)
    .map(({ text, createdAt }) => ({ text, createdAt }))
}

function ReflectionCopy({ reflection }: { reflection: Reflection }) {
  return (
    <>
      {reflection.text}
      {reflection.historyCite ? (
        <>
          {' '}
          Like <span className="reflection-cite">{reflection.historyCite}</span>.
        </>
      ) : null}
    </>
  )
}

type NuggetItemProps = {
  nugget: Nugget
  history: ReflectionHistoryItem[]
  user: User | null
  isFresh: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (text: string) => void
  onRemove: () => void
}

function NuggetItem({
  nugget,
  history,
  user,
  isFresh,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: NuggetItemProps) {
  const [editText, setEditText] = useState(nugget.text)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [reflectionLoading, setReflectionLoading] = useState(false)
  const [reflectionError, setReflectionError] = useState<string | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const itemRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const reflectionRequestRef = useRef(0)
  const menuId = useId()

  useEffect(() => {
    setReflection(null)
    setReflectionError(null)
    setReflectionLoading(false)
    reflectionRequestRef.current += 1
    setFlipped(false)
  }, [nugget.id, nugget.text])

  useEffect(() => {
    if (!isFresh) return
    const frame = window.requestAnimationFrame(() => {
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isFresh])

  useEffect(() => {
    if (!isEditing) return
    setFlipped(false)
    setMenuOpen(false)
    setConfirmRemove(false)
    setEditText(nugget.text)
    const frame = window.requestAnimationFrame(() => {
      const el = editRef.current
      if (!el) return
      autosizeTextarea(el)
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isEditing, nugget.text])

  useLayoutEffect(() => {
    if (!isEditing) return
    autosizeTextarea(editRef.current)
  }, [editText, isEditing])

  useEffect(() => {
    if (!menuOpen && !flipped) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
        setConfirmRemove(false)
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (flipped) {
          setFlipped(false)
          return
        }
        setMenuOpen(false)
        setConfirmRemove(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, flipped])

  function save() {
    const text = editText.trim()
    if (!text) return
    onSaveEdit(text)
  }

  function onEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelEdit()
      return
    }
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      save()
    }
  }

  function flipToReflection() {
    setMenuOpen(false)
    setConfirmRemove(false)
    setFlipped(true)

    if (reflection || reflectionLoading || !user) return
    if (nugget.text.trim().length < DRAFT_REFLECT_MIN_CHARS) {
      setReflectionError('Write a little more before reflecting.')
      return
    }

    const requestId = reflectionRequestRef.current + 1
    reflectionRequestRef.current = requestId
    setReflectionLoading(true)
    setReflectionError(null)

    void requestReflection({
      user,
      draft: nugget.text,
      history,
    })
      .then((next) => {
        if (reflectionRequestRef.current !== requestId) return
        setReflection(next)
      })
      .catch((error: unknown) => {
        if (reflectionRequestRef.current !== requestId) return
        setReflectionError(
          error instanceof Error ? error.message : 'Reflection unavailable.',
        )
      })
      .finally(() => {
        if (reflectionRequestRef.current !== requestId) return
        setReflectionLoading(false)
      })
  }

  function flipToThought() {
    setFlipped(false)
  }

  return (
    <li
      ref={itemRef}
      className={`nugget${isFresh ? ' nugget-fresh' : ''}${isEditing ? ' nugget-editing' : ''}${menuOpen ? ' is-menu-open' : ''}${flipped ? ' is-flipped' : ''}`}
    >
      {isEditing ? (
        <>
          <div className="nugget-meta">
            <span className="nugget-time">{formatTime(nugget.createdAt)}</span>
          </div>
          <textarea
            ref={editRef}
            className="nugget-edit-input"
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            onKeyDown={onEditKeyDown}
            rows={1}
            aria-label="Edit thought"
          />
          <div className="nugget-edit-actions">
            <span className="nugget-shortcut">Shift+Enter to save · Esc to cancel</span>
            <div className="nugget-edit-buttons">
              <button type="button" className="btn-ghost btn-compact" onClick={onCancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-compact"
                onClick={save}
                disabled={!editText.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="nugget-flip-scene">
          <div className={`nugget-flip-inner${flipped ? ' is-flipped' : ''}`}>
            <div className="nugget-face nugget-face-front">
              <div className="nugget-meta">
                <span className="nugget-time">{formatTime(nugget.createdAt)}</span>
                <button
                  type="button"
                  className="nugget-reflect-chip"
                  onClick={flipToReflection}
                  aria-label="Show reflection"
                >
                  reflect
                </button>
              </div>

              <button type="button" className="nugget-text" onClick={onStartEdit}>
                {nugget.text}
              </button>

              <div className={`nugget-more${menuOpen ? ' is-open' : ''}`} ref={menuRef}>
                <button
                  type="button"
                  className="nugget-more-trigger"
                  aria-label="Thought actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  onClick={() => {
                    setMenuOpen((current) => !current)
                    setConfirmRemove(false)
                  }}
                >
                  <span aria-hidden="true">···</span>
                </button>

                {menuOpen ? (
                  <div className="nugget-more-panel" id={menuId} role="menu">
                    {confirmRemove ? (
                      <>
                        <p className="nugget-more-confirm">Remove this thought?</p>
                        <div className="nugget-more-actions">
                          <button
                            type="button"
                            className="nugget-more-item"
                            role="menuitem"
                            onClick={() => setConfirmRemove(false)}
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className="nugget-more-item is-danger"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false)
                              setConfirmRemove(false)
                              onRemove()
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="nugget-more-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false)
                            onStartEdit()
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="nugget-more-item"
                          role="menuitem"
                          onClick={flipToReflection}
                        >
                          Reflect
                        </button>
                        <button
                          type="button"
                          className="nugget-more-item"
                          role="menuitem"
                          onClick={() => setConfirmRemove(true)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="nugget-face nugget-face-back" aria-hidden={!flipped}>
              <button
                type="button"
                className="nugget-reflection"
                onClick={flipToThought}
                aria-label="Back to thought"
              >
                <p className={`nugget-reflection-text${reflectionLoading ? ' is-forming' : ''}`}>
                  {reflectionLoading ? (
                    'Listening…'
                  ) : reflectionError ? (
                    reflectionError
                  ) : reflection ? (
                    <ReflectionCopy reflection={reflection} />
                  ) : (
                    'Tap reflect again when you’re ready.'
                  )}
                </p>
                <span className="nugget-reflection-hint">Tap to return</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function userLabel(displayName: string | null, email: string | null) {
  if (displayName?.trim()) return displayName.trim()
  if (email) return email
  return 'Signed in'
}

function userFirstName(displayName: string | null, email: string | null) {
  const name = displayName?.trim()
  if (name) return name.split(/\s+/)[0] ?? name
  if (email?.trim()) return email.trim().split('@')[0] ?? email.trim()
  return 'Signed in'
}

function userInitials(displayName: string | null, email: string | null) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email?.trim()) return email.trim().slice(0, 2).toUpperCase()
  return '?'
}

type AccountMenuProps = {
  displayName: string | null
  email: string | null
  photoURL: string | null
  signingOut: boolean
  onSignOut: () => void
}

function AccountMenu({
  displayName,
  email,
  photoURL,
  signingOut,
  onSignOut,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const nameId = useId()
  const fullLabel = userLabel(displayName, email)
  const shortLabel = displayName?.trim()
    ? userFirstName(displayName, email)
    : fullLabel
  const initials = userInitials(displayName, email)
  const showEmail = Boolean(email && displayName?.trim())
  const showPhoto = Boolean(photoURL && !photoFailed)

  useEffect(() => {
    setPhotoFailed(false)
  }, [photoURL])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    const focusFrame = window.requestAnimationFrame(() => {
      itemRef.current?.focus()
    })

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const avatar = showPhoto ? (
    <img
      className="account-menu-photo"
      src={photoURL!}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setPhotoFailed(true)}
    />
  ) : (
    <span className="account-menu-initials" aria-hidden="true">
      {initials}
    </span>
  )

  return (
    <div className={`account-menu${open ? ' is-open' : ''}${showPhoto ? ' has-photo' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${fullLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        {avatar}
      </button>

      {open ? (
        <div
          className="account-menu-panel"
          id={menuId}
          role="menu"
          aria-labelledby={nameId}
        >
          <div className="account-menu-identity">
            <span className="account-menu-avatar" aria-hidden="true">
              {showPhoto ? (
                <img
                  className="account-menu-photo"
                  src={photoURL!}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                initials
              )}
            </span>
            <div className="account-menu-copy">
              <p className="account-menu-name" id={nameId}>
                {shortLabel}
              </p>
              {showEmail ? <p className="account-menu-email">{email}</p> : null}
            </div>
          </div>
          <button
            ref={itemRef}
            type="button"
            className="account-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function JournalHome() {
  const { user, signOut } = useAuth()
  const [draft, setDraft] = useState(() => loadDraft())
  const [nuggets, setNuggets] = useState<Nugget[]>(() => loadNuggets())
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [proofread, setProofread] = useState(false)
  const [voiceThread, setVoiceThread] = useState<VoiceTurn[]>([])
  const [voicePanel, setVoicePanel] = useState<VoiceTurn[] | null>(null)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceReplyOpen, setVoiceReplyOpen] = useState(false)
  const [voiceReply, setVoiceReply] = useState('')
  const [voiceViewIndex, setVoiceViewIndex] = useState(0)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const voiceReplyRef = useRef<HTMLTextAreaElement>(null)
  const composerFrameRef = useRef<HTMLFormElement>(null)
  const composerFaceRef = useRef<HTMLDivElement>(null)
  const composerBarDockRef = useRef<HTMLDivElement>(null)
  const composerGapRef = useRef<number | null>(null)
  const voiceLockedRef = useRef(false)
  const voicePanelOpenRef = useRef(false)
  const listLabelId = useId()
  const dayGroups = useMemo(() => groupNuggetsByDay(nuggets, now), [nuggets, now])
  const reflectionHistory = useMemo(() => historyFromNuggets(nuggets), [nuggets])
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({})
  const viewedVoiceTurn = voicePanel?.[voiceViewIndex] ?? null
  const isViewingLatestVoice = Boolean(
    voicePanel && voiceViewIndex === voicePanel.length - 1,
  )
  const canViewEarlierVoice = voiceViewIndex > 0
  const canViewLaterVoice = Boolean(voicePanel && voiceViewIndex < voicePanel.length - 1)
  const showVoicePanel = Boolean(voicePanel && viewedVoiceTurn) || voiceLoading || Boolean(voiceError)

  useEffect(() => {
    if (voiceThread.length > 0 || voiceLoading || voiceError) {
      if (voiceThread.length > 0) {
        setVoicePanel(voiceThread)
        setVoiceViewIndex(voiceThread.length - 1)
      } else {
        setVoicePanel(null)
        setVoiceViewIndex(0)
      }
      if (voicePanelOpenRef.current) return

      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          voicePanelOpenRef.current = true
          setVoicePanelOpen(true)
        })
      })
      return () => window.cancelAnimationFrame(frame)
    }

    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    setVoiceViewIndex(0)
    const timer = window.setTimeout(() => {
      setVoicePanel(null)
      setVoiceReplyOpen(false)
      setVoiceReply('')
    }, VOICE_PANEL_MS)
    return () => window.clearTimeout(timer)
  }, [voiceThread, voiceLoading, voiceError])

  function isDayCollapsed(group: DayGroup) {
    if (group.key in collapsedDays) return collapsedDays[group.key]
    return !group.isToday
  }

  function toggleDay(key: string, currentlyCollapsed: boolean) {
    setCollapsedDays((current) => ({ ...current, [key]: !currentlyCollapsed }))
  }

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nuggets))
  }, [nuggets])

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, draft)
  }, [draft])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!justDroppedId) return
    const timer = window.setTimeout(() => setJustDroppedId(null), 900)
    return () => window.clearTimeout(timer)
  }, [justDroppedId])

  useEffect(() => {
    if (!justDroppedId) return
    const todayKey = dayKey(Date.now())
    setCollapsedDays((current) => {
      if (current[todayKey] !== true) return current
      return { ...current, [todayKey]: false }
    })
  }, [justDroppedId])

  useEffect(() => {
    if (!sending) return
    const timer = window.setTimeout(() => setSending(false), 320)
    return () => window.clearTimeout(timer)
  }, [sending])

  useEffect(() => {
    const trimmed = draft.trim()
    if (trimmed.length < DRAFT_REFLECT_MIN_CHARS || !user) {
      setVoiceThread([])
      setVoiceReplyOpen(false)
      setVoiceReply('')
      setVoiceLoading(false)
      setVoiceError(null)
      voiceLockedRef.current = false
      return
    }

    if (voiceLockedRef.current) return

    const controller = new AbortController()
    let cancelled = false

    const idleTimer = window.setTimeout(() => {
      setVoiceLoading(true)
      setVoiceError(null)
      setVoiceThread([])

      void requestReflection({
        user,
        draft: trimmed,
        history: reflectionHistory,
        signal: controller.signal,
      })
        .then((next) => {
          if (cancelled || voiceLockedRef.current) return
          setVoiceThread([
            {
              id: createId(),
              reflection: next,
            },
          ])
          setVoiceError(null)
        })
        .catch((error: unknown) => {
          if (cancelled || voiceLockedRef.current) return
          if (error instanceof DOMException && error.name === 'AbortError') return
          setVoiceThread([])
          setVoiceError(
            error instanceof Error ? error.message : 'Reflection unavailable.',
          )
        })
        .finally(() => {
          if (cancelled) return
          setVoiceLoading(false)
        })
    }, DRAFT_REFLECT_IDLE_MS)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(idleTimer)
      setVoiceLoading(false)
    }
  }, [draft, reflectionHistory, user])

  useLayoutEffect(() => {
    const frame = composerFrameRef.current
    const previousHeight = frame?.offsetHeight ?? 0
    autosizeTextarea(inputRef.current)
    animateComposerFace(
      frame,
      [composerFaceRef.current, composerBarDockRef.current],
      previousHeight,
      composerGapRef,
    )
  }, [draft])

  useLayoutEffect(() => {
    if (!voiceReplyOpen) return
    autosizeTextarea(voiceReplyRef.current)
    voiceReplyRef.current?.focus({ preventScroll: true })
  }, [voiceReplyOpen, voiceReply])

  function clearVoiceConversation() {
    setVoiceThread([])
    setVoiceReplyOpen(false)
    setVoiceReply('')
    setVoiceLoading(false)
    setVoiceError(null)
    voiceLockedRef.current = false
  }

  function openVoiceReply() {
    if (voiceLoading) return
    const latestIndex = Math.max((voicePanel?.length ?? voiceThread.length) - 1, 0)
    if (voiceViewIndex !== latestIndex) {
      setVoiceViewIndex(latestIndex)
    }
    setVoiceReplyOpen(true)
  }

  function closeVoiceReply() {
    setVoiceReplyOpen(false)
    setVoiceReply('')
  }

  function viewEarlierVoice() {
    if (!canViewEarlierVoice) return
    setVoiceReplyOpen(false)
    setVoiceReply('')
    setVoiceViewIndex((index) => Math.max(0, index - 1))
  }

  function viewLaterVoice() {
    if (!canViewLaterVoice || !voicePanel) return
    setVoiceViewIndex((index) => Math.min(voicePanel.length - 1, index + 1))
  }

  async function sendVoiceReply() {
    const steer = voiceReply.trim()
    if (!steer || voiceThread.length === 0 || !user || voiceLoading) return

    voiceLockedRef.current = true
    setVoiceLoading(true)
    setVoiceError(null)
    setVoiceReply('')
    setVoiceReplyOpen(false)

    try {
      const next = await requestReflection({
        user,
        draft: draft.trim(),
        history: reflectionHistory,
        reply: steer,
      })
      setVoiceThread((current) => [
        ...current,
        {
          id: createId(),
          comment: steer,
          reflection: next,
        },
      ])
    } catch (error: unknown) {
      setVoiceError(
        error instanceof Error ? error.message : 'Reflection unavailable.',
      )
    } finally {
      setVoiceLoading(false)
    }
  }

  function dropNugget() {
    const text = draft.trim()
    if (!text) return

    const nugget: Nugget = {
      id: createId(),
      text,
      createdAt: Date.now(),
    }

    setSending(true)
    setNuggets((current) => [nugget, ...current])
    setJustDroppedId(nugget.id)
    setEditingId(null)
    setDraft('')
    clearVoiceConversation()
    inputRef.current?.focus({ preventScroll: true })
  }

  function removeNugget(id: string) {
    setNuggets((current) => current.filter((nugget) => nugget.id !== id))
    if (editingId === id) setEditingId(null)
    inputRef.current?.focus({ preventScroll: true })
  }

  function saveNugget(id: string, text: string) {
    setNuggets((current) =>
      current.map((nugget) => (nugget.id === id ? { ...nugget, text } : nugget)),
    )
    setEditingId(null)
    inputRef.current?.focus({ preventScroll: true })
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      dropNugget()
    }
  }

  const canDrop = draft.trim().length > 0

  return (
    <div className="app-shell">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>

      <header className="app-header">
        <div className="app-logo">
          Journal<span>42</span>
        </div>
        <AccountMenu
          displayName={user?.displayName ?? null}
          email={user?.email ?? null}
          photoURL={user?.photoURL ?? null}
          signingOut={signingOut}
          onSignOut={onSignOut}
        />
      </header>

      <main className="app-main">
        <section className="journal-stage">
          <h1 className="journal-prompt">Get it out of your head.</h1>
          <p className="journal-hint">Start with whatever is loudest.</p>

          <div className={`composer-stack${voicePanelOpen ? ' has-voice' : ''}`}>
            <form
              ref={composerFrameRef}
              className={`nugget-composer-frame${sending ? ' is-sending' : ''}`}
              onSubmit={(event) => {
                event.preventDefault()
                dropNugget()
              }}
            >
              <div ref={composerFaceRef} className="nugget-composer-face" aria-hidden="true" />
              <div className="nugget-composer">
                <label className="sr-only" htmlFor="nugget-input">
                  Write a thought
                </label>
                <div className="nugget-composer-body">
                  <textarea
                    id="nugget-input"
                    ref={inputRef}
                    className="nugget-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder="What's rattling around up there?"
                    rows={1}
                    autoFocus
                  />
                </div>
                <div
                  className={`nugget-composer-bar nugget-composer-bar-sizer${SHOW_PROOFREAD ? ' has-proofread' : ''}`}
                  aria-hidden="true"
                >
                  {SHOW_PROOFREAD ? (
                    <div className="proofread-toggle">
                      <span className="proofread-toggle-label">Proofread</span>
                      <span className="proofread-switch">
                        <span className="proofread-switch-thumb" />
                      </span>
                    </div>
                  ) : null}
                  <button type="button" className="btn-primary btn-icon-only" tabIndex={-1} disabled>
                    <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M8 3v9.2m0 0L4.3 8.5M8 12.2 11.7 8.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div ref={composerBarDockRef} className="nugget-composer-bar-dock">
                <div className={`nugget-composer-bar${SHOW_PROOFREAD ? ' has-proofread' : ''}`}>
                  {SHOW_PROOFREAD ? (
                    <button
                      type="button"
                      role="switch"
                      className="proofread-toggle"
                      aria-checked={proofread}
                      onClick={() => setProofread((current) => !current)}
                    >
                      <span className="proofread-toggle-label">Proofread</span>
                      <span className="proofread-switch" aria-hidden="true">
                        <span className="proofread-switch-thumb" />
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="btn-primary btn-icon-only"
                    disabled={!canDrop}
                    aria-label="Save thought"
                  >
                    <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M8 3v9.2m0 0L4.3 8.5M8 12.2 11.7 8.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </form>

            <div className={`draft-voice-slot${voicePanelOpen ? ' is-open' : ''}`}>
              <div className="draft-voice-slot-inner">
                {showVoicePanel ? (
                  <aside className="draft-voice" aria-live="polite">
                    <div className="draft-voice-head">
                      <div className="draft-voice-head-main">
                        <p className="draft-voice-label">Reflection</p>
                        {voicePanel && voicePanel.length > 1 ? (
                          <div className="draft-voice-history" role="group" aria-label="Reflection history">
                            <button
                              type="button"
                              className="draft-voice-history-btn"
                              onClick={viewEarlierVoice}
                              disabled={!canViewEarlierVoice || voiceLoading}
                              aria-label="Earlier reflection"
                              title="Earlier"
                            >
                              <svg className="draft-voice-history-icon" viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                  d="M9.8 3.8 5.6 8l4.2 4.2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.45"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <span className="draft-voice-history-count">
                              {voiceViewIndex + 1} of {voicePanel.length}
                            </span>
                            <button
                              type="button"
                              className="draft-voice-history-btn"
                              onClick={viewLaterVoice}
                              disabled={!canViewLaterVoice || voiceLoading}
                              aria-label="Later reflection"
                              title="Later"
                            >
                              <svg className="draft-voice-history-icon" viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                  d="M6.2 3.8 10.4 8 6.2 12.2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.45"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {!voiceReplyOpen && viewedVoiceTurn && !voiceLoading ? (
                        <button
                          type="button"
                          className="draft-voice-reply-trigger"
                          onClick={openVoiceReply}
                          aria-label="Talk with the reflection"
                          title="Talk with the reflection"
                        >
                          <svg className="draft-voice-reply-icon" viewBox="0 0 16 16" aria-hidden="true">
                            <path
                              d="M3.2 3.4h6.6c.9 0 1.6.7 1.6 1.6v3.2c0 .9-.7 1.6-1.6 1.6H7.1L5.2 11.5V9.8H3.2c-.9 0-1.6-.7-1.6-1.6V5c0-.9.7-1.6 1.6-1.6Z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M9.4 6.8h3.4c.7 0 1.3.6 1.3 1.3v2.4c0 .7-.6 1.3-1.3 1.3h-1.2v1.3L9.8 11.8H9.4c-.7 0-1.3-.6-1.3-1.3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    {viewedVoiceTurn ? (
                      <div className="draft-voice-turn is-current" key={viewedVoiceTurn.id}>
                        {viewedVoiceTurn.comment ? (
                          <p className="draft-voice-comment">{viewedVoiceTurn.comment}</p>
                        ) : null}
                        <p className="draft-voice-text">
                          <ReflectionCopy reflection={viewedVoiceTurn.reflection} />
                        </p>
                      </div>
                    ) : null}

                    {voiceLoading ? (
                      <p className="draft-voice-text is-forming">Listening…</p>
                    ) : null}

                    {voiceError && !voiceLoading ? (
                      <p className="draft-voice-text is-error">{voiceError}</p>
                    ) : null}

                    {voiceReplyOpen && isViewingLatestVoice && !voiceLoading ? (
                      <div className="draft-voice-reply">
                        <div className="draft-voice-reply-field">
                          <textarea
                            ref={voiceReplyRef}
                            className="draft-voice-reply-input"
                            value={voiceReply}
                            onChange={(event) => setVoiceReply(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                closeVoiceReply()
                                return
                              }
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void sendVoiceReply()
                              }
                            }}
                            placeholder="Talk with the reflection…"
                            rows={1}
                            aria-label="Talk with the reflection"
                          />
                          {voiceReply.trim() ? (
                            <button
                              type="button"
                              className="draft-voice-reply-submit"
                              onClick={() => void sendVoiceReply()}
                              aria-label="Continue"
                            >
                              <svg className="draft-voice-reply-submit-icon" viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                  d="M6.2 3.8 11 8 6.2 12.2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.45"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="draft-voice-reply-submit is-dismiss"
                              onClick={closeVoiceReply}
                              aria-label="Close"
                            >
                              <svg className="draft-voice-reply-submit-icon" viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                  d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </aside>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="nugget-stream" aria-labelledby={listLabelId}>
          <div className="nugget-stream-head">
            <h2 id={listLabelId}>Thoughts</h2>
          </div>

          {nuggets.length === 0 ? (
            <p className="nugget-empty">
              Nothing here yet. Write the first thought and feel the space open up.
            </p>
          ) : (
            <div className="nugget-days">
              {dayGroups.map((group) => {
                const collapsed = isDayCollapsed(group)
                const headingId = `${listLabelId}-${group.key}`
                const latest = group.nuggets[0]

                return (
                  <section
                    key={group.key}
                    className={`nugget-day${group.isToday ? ' is-today' : ' is-earlier'}${collapsed ? ' is-collapsed' : ''}`}
                    aria-labelledby={headingId}
                  >
                    <button
                      type="button"
                      className="nugget-day-toggle"
                      id={headingId}
                      aria-expanded={!collapsed}
                      onClick={() => toggleDay(group.key, collapsed)}
                    >
                      <span className="nugget-day-toggle-row">
                        <span className="nugget-day-toggle-main">
                          {group.isToday ? null : (
                            <DayChevron expanded={!collapsed} />
                          )}
                          <span className="nugget-day-label">{group.label}</span>
                        </span>
                        <span className="nugget-day-count">
                          {group.nuggets.length}{' '}
                          {group.nuggets.length === 1 ? 'thought' : 'thoughts'}
                        </span>
                      </span>
                      {collapsed && latest ? (
                        <span className="nugget-day-preview">
                          {previewText(latest.text)}
                        </span>
                      ) : null}
                    </button>

                    {collapsed ? null : (
                      <ul className="nugget-list">
                        {group.nuggets.map((nugget) => (
                          <NuggetItem
                            key={nugget.id}
                            nugget={nugget}
                            history={historyFromNuggets(nuggets, nugget.id)}
                            user={user}
                            isFresh={justDroppedId === nugget.id}
                            isEditing={editingId === nugget.id}
                            onStartEdit={() => setEditingId(nugget.id)}
                            onCancelEdit={() => {
                              setEditingId(null)
                              inputRef.current?.focus({ preventScroll: true })
                            }}
                            onSaveEdit={(text) => saveNugget(nugget.id, text)}
                            onRemove={() => removeNugget(nugget.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
