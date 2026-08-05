import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from '../auth/useAuth'
import {
  requestReflection,
  toReflectionErrorMessage,
  type Reflection,
  type ReflectionHistoryItem,
} from '../lib/ai'
import {
  createNugget,
  deleteNugget,
  persistableDiscussion,
  setDraft as persistDraft,
  subscribeJournal,
  updateNugget,
  updateNuggetDiscussion,
  type DiscussionTurn,
  type Nugget,
} from '../lib/journalStore'
import AuthLoading from '../auth/AuthLoading'

const SHOW_PROOFREAD = false
const DRAFT_PERSIST_MS = 400

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
const DRAFT_REFLECT_IDLE_MS = 1800
const VOICE_PANEL_MS = 720
const HISTORY_LIMIT = 8

function historyFromNuggets(nuggets: Nugget[], excludeId?: string): ReflectionHistoryItem[] {
  return nuggets
    .filter((nugget) => nugget.id !== excludeId)
    .slice(0, HISTORY_LIMIT)
    .map(({ text, createdAt }) => ({ text, createdAt }))
}

function discussionFingerprint(discussion: DiscussionTurn[] | undefined) {
  if (!discussion?.length) return ''
  return discussion
    .map(
      (turn) =>
        `${turn.id}:${turn.comment ?? ''}:${turn.reflection?.text ?? ''}:${turn.reflection?.historyCite ?? ''}`,
    )
    .join('|')
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

function ReflectionOrbMark({ className }: { className?: string }) {
  return (
    <span
      className={`reflection-orb is-mark${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <span className="reflection-orb-aura" />
      <span className="reflection-orb-aura is-late" />
      <span className="reflection-orb-core" />
    </span>
  )
}

function FormingReflection({
  ariaLabel = 'Forming a reflection',
  variant = 'panel',
}: {
  ariaLabel?: string
  variant?: 'panel' | 'nugget'
}) {
  return (
    <div
      className={`forming-reflection forming-reflection-${variant}`}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <ReflectionOrbMark className="is-forming" />
      {variant === 'nugget' ? (
        <div className="forming-reflection-skeleton" aria-hidden="true">
          <span className="forming-reflection-line" style={{ width: '92%' }} />
          <span className="forming-reflection-line" style={{ width: '74%' }} />
          <span className="forming-reflection-line is-short" style={{ width: '48%' }} />
        </div>
      ) : null}
    </div>
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
  onDiscussionChange: (discussion: DiscussionTurn[]) => void
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
  onDiscussionChange,
  onRemove,
}: NuggetItemProps) {
  const [editText, setEditText] = useState(nugget.text)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [discussion, setDiscussion] = useState<DiscussionTurn[]>(
    () => nugget.discussion ?? [],
  )
  const [reply, setReply] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [reflectionLoading, setReflectionLoading] = useState(false)
  const [reflectionError, setReflectionError] = useState<string | null>(null)
  const [retryReply, setRetryReply] = useState<string | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const itemRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const reflectionRequestRef = useRef(0)
  const discussionDirtyRef = useRef(false)
  const menuId = useId()
  const storedFingerprint = discussionFingerprint(nugget.discussion)
  const hasStoredReflection = discussion.some((turn) => turn.reflection)
  const latestTurn = discussion[discussion.length - 1] ?? null
  const showReplyComposer =
    replyOpen && hasStoredReflection && !reflectionLoading

  useEffect(() => {
    discussionDirtyRef.current = false
    setDiscussion(nugget.discussion ?? [])
    setReflectionError(null)
    setReflectionLoading(false)
    setRetryReply(null)
    setReply('')
    setReplyOpen(false)
    reflectionRequestRef.current += 1
    setFlipped(false)
  }, [nugget.id, nugget.text])

  useEffect(() => {
    if (discussionDirtyRef.current) return
    setDiscussion(nugget.discussion ?? [])
  }, [nugget.id, storedFingerprint, nugget.discussion])

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

  useLayoutEffect(() => {
    if (!showReplyComposer) return
    autosizeTextarea(replyRef.current)
  }, [showReplyComposer, reply])

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
        if (reply.trim()) {
          setReply('')
          return
        }
        if (replyOpen) {
          setReplyOpen(false)
          return
        }
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
  }, [menuOpen, flipped, replyOpen, reply])

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

  function fetchTurn(steer = '', pendingId?: string) {
    if (reflectionLoading || !user) return
    if (nugget.text.trim().length < DRAFT_REFLECT_MIN_CHARS) {
      setReflectionError('Write a little more before reflecting.')
      return
    }

    const requestId = reflectionRequestRef.current + 1
    reflectionRequestRef.current = requestId
    setReflectionLoading(true)
    setReflectionError(null)
    if (steer) setRetryReply(steer)
    else setRetryReply(null)

    void requestReflection({
      user,
      draft: nugget.text,
      history,
      reply: steer,
    })
      .then((next) => {
        if (reflectionRequestRef.current !== requestId) return
        setDiscussion((current) => {
          let updated: DiscussionTurn[]
          if (steer) {
            if (pendingId && current.some((turn) => turn.id === pendingId)) {
              updated = current.map((turn) =>
                turn.id === pendingId ? { ...turn, reflection: next } : turn,
              )
            } else {
              updated = [
                ...current,
                { id: createId(), comment: steer, reflection: next },
              ]
            }
          } else {
            updated = [{ id: createId(), reflection: next }]
          }
          onDiscussionChange(persistableDiscussion(updated))
          return updated
        })
        discussionDirtyRef.current = true
        setReflectionError(null)
        setRetryReply(null)
      })
      .catch((error: unknown) => {
        if (reflectionRequestRef.current !== requestId) return
        setReflectionError(toReflectionErrorMessage(error))
      })
      .finally(() => {
        if (reflectionRequestRef.current !== requestId) return
        setReflectionLoading(false)
      })
  }

  function flipToReflection() {
    setMenuOpen(false)
    setConfirmRemove(false)
    setFlipped(true)

    if (reflectionLoading || !user) return
    if (hasStoredReflection && !reflectionError) return
    fetchTurn(retryReply ?? '')
  }

  function retryReflection() {
    if (reflectionLoading) return
    if (retryReply) {
      const pending = discussion.find(
        (turn) => turn.comment === retryReply && !turn.reflection,
      )
      if (pending) {
        fetchTurn(retryReply, pending.id)
        return
      }
      const pendingId = createId()
      discussionDirtyRef.current = true
      setDiscussion((current) => [...current, { id: pendingId, comment: retryReply }])
      fetchTurn(retryReply, pendingId)
      return
    }
    fetchTurn()
  }

  function sendReply() {
    const steer = reply.trim()
    if (!steer || !hasStoredReflection || !user || reflectionLoading) return

    const pendingId = createId()
    setReply('')
    setReflectionError(null)
    discussionDirtyRef.current = true
    setDiscussion((current) => [
      ...current.filter((turn) => turn.reflection),
      { id: pendingId, comment: steer },
    ])
    fetchTurn(steer, pendingId)
  }

  function flipToThought() {
    setReplyOpen(false)
    setReply('')
    setFlipped(false)
  }

  return (
    <li
      ref={itemRef}
      className={`nugget${isFresh ? ' nugget-fresh' : ''}${isEditing ? ' nugget-editing' : ''}${menuOpen ? ' is-menu-open' : ''}${flipped ? ' is-flipped' : ''}${hasStoredReflection ? ' has-reflection' : ''}`}
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
                  className={`nugget-reflect-chip${hasStoredReflection ? ' has-reflection' : ''}`}
                  onClick={flipToReflection}
                  aria-label={hasStoredReflection ? 'Show saved reflection' : 'Show reflection'}
                >
                  {hasStoredReflection ? 'reflected' : 'reflect'}
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
                          {hasStoredReflection ? 'View reflection' : 'Reflect'}
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
              <div className="nugget-reflection">
                {discussion.length > 0 ? (
                  <div className="nugget-discussion">
                    {discussion.map((turn) => (
                      <div
                        key={turn.id}
                        className={`nugget-discussion-turn${turn.reflection ? ' is-complete' : ' is-pending'}`}
                      >
                        {turn.comment ? (
                          <p className="nugget-discussion-comment">{turn.comment}</p>
                        ) : null}
                        {turn.reflection ? (
                          <p className="nugget-reflection-text">
                            <ReflectionCopy reflection={turn.reflection} />
                          </p>
                        ) : reflectionLoading ? (
                          <FormingReflection variant="nugget" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {reflectionLoading && (!latestTurn || latestTurn.reflection) ? (
                  <FormingReflection variant="nugget" />
                ) : null}

                {reflectionError && !reflectionLoading ? (
                  <div className="draft-voice-error">
                    <p className="nugget-reflection-text">{reflectionError}</p>
                    <button
                      type="button"
                      className="draft-voice-retry"
                      onClick={retryReflection}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}

                {!reflectionLoading &&
                !reflectionError &&
                discussion.length === 0 ? (
                  <p className="nugget-reflection-text">
                    Tap reflect again when you’re ready.
                  </p>
                ) : null}

                {hasStoredReflection && !reflectionLoading ? (
                  showReplyComposer ? (
                    <div className="nugget-discussion-reply">
                      <textarea
                        ref={replyRef}
                        className="nugget-discussion-reply-input"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            if (reply.trim()) {
                              setReply('')
                              return
                            }
                            setReplyOpen(false)
                            return
                          }
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            sendReply()
                          }
                        }}
                        rows={1}
                        aria-label="Continue reflection"
                        placeholder="Continue the thread…"
                      />
                      <button
                        type="button"
                        className="nugget-discussion-reply-submit"
                        onClick={sendReply}
                        disabled={!reply.trim()}
                        aria-label="Send"
                      >
                        Send
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="nugget-discussion-reply-trigger"
                      onClick={() => setReplyOpen(true)}
                    >
                      Continue
                    </button>
                  )
                ) : null}

                <button
                  type="button"
                  className="nugget-reflection-hint"
                  onClick={flipToThought}
                >
                  Tap to return
                </button>
              </div>
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
  const [draft, setDraft] = useState('')
  const [nuggets, setNuggets] = useState<Nugget[]>([])
  const [journalReady, setJournalReady] = useState(false)
  const [journalError, setJournalError] = useState<string | null>(null)
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [proofread, setProofread] = useState(false)
  const [voiceThread, setVoiceThread] = useState<DiscussionTurn[]>([])
  const [voicePanel, setVoicePanel] = useState<DiscussionTurn[] | null>(null)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceReplyOpen, setVoiceReplyOpen] = useState(false)
  const [voiceReply, setVoiceReply] = useState('')
  const [voiceViewIndex, setVoiceViewIndex] = useState(0)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceRetryReply, setVoiceRetryReply] = useState<string | null>(null)
  const [reflectionInvite, setReflectionInvite] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const voiceReplyRef = useRef<HTMLTextAreaElement>(null)
  const shouldRefocusReplyRef = useRef(false)
  const composerFrameRef = useRef<HTMLFormElement>(null)
  const composerFaceRef = useRef<HTMLDivElement>(null)
  const composerBarDockRef = useRef<HTMLDivElement>(null)
  const composerGapRef = useRef<number | null>(null)
  const voiceLockedRef = useRef(false)
  const voicePanelOpenRef = useRef(false)
  const voiceFetchAbortRef = useRef<AbortController | null>(null)
  const draftDirtyRef = useRef(false)
  const discussionDirtyRef = useRef(false)
  const draftPersistTimerRef = useRef<number | null>(null)
  const draftReadyRef = useRef(false)
  const nuggetsReadyRef = useRef(false)
  const voiceThreadRef = useRef<DiscussionTurn[]>([])
  const draftRef = useRef(draft)
  const listLabelId = useId()
  const dayGroups = useMemo(() => groupNuggetsByDay(nuggets, now), [nuggets, now])
  const reflectionHistory = useMemo(() => historyFromNuggets(nuggets), [nuggets])
  const showReflectionOrb = reflectionInvite && !voicePanelOpen

  voiceThreadRef.current = voiceThread
  draftRef.current = draft

  function markJournalReady() {
    if (draftReadyRef.current && nuggetsReadyRef.current) {
      setJournalReady(true)
    }
  }

  function clearDraftPersistTimer() {
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current)
      draftPersistTimerRef.current = null
    }
  }

  function scheduleDraftPersist(
    nextDraft: string,
    nextDiscussion?: DiscussionTurn[],
  ) {
    if (!user) return
    clearDraftPersistTimer()
    const uid = user.uid
    const discussion =
      nextDiscussion ?? persistableDiscussion(voiceThreadRef.current)
    draftPersistTimerRef.current = window.setTimeout(() => {
      draftPersistTimerRef.current = null
      void persistDraft(uid, nextDraft, discussion)
        .then(() => {
          draftDirtyRef.current = false
          discussionDirtyRef.current = false
        })
        .catch((error: unknown) => {
          setJournalError(
            error instanceof Error ? error.message : 'Could not save draft.',
          )
        })
    }, DRAFT_PERSIST_MS)
  }

  function onDraftChange(value: string) {
    draftDirtyRef.current = true
    setDraft(value)
    scheduleDraftPersist(value)
  }
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({})
  const viewedVoiceTurn = voicePanel?.[voiceViewIndex] ?? null
  const isViewingLatestVoice = Boolean(
    voicePanel && voiceViewIndex === voicePanel.length - 1,
  )
  const canViewEarlierVoice = voiceViewIndex > 0
  const canViewLaterVoice = Boolean(voicePanel && voiceViewIndex < voicePanel.length - 1)
  const hasVoiceReflection = Boolean(
    voicePanel?.some((turn) => turn.reflection) ||
      voiceThread.some((turn) => turn.reflection),
  )
  const showVoiceComposer =
    voiceReplyOpen &&
    isViewingLatestVoice &&
    (hasVoiceReflection || Boolean(voiceRetryReply))
  const showVoiceReplyTrigger =
    !voiceReplyOpen &&
    hasVoiceReflection &&
    isViewingLatestVoice &&
    !voiceLoading &&
    Boolean(viewedVoiceTurn?.reflection)
  const showVoicePanel =
    Boolean(viewedVoiceTurn) || voiceLoading || Boolean(voiceError)
  const showInitialForming =
    voiceLoading && (!viewedVoiceTurn || Boolean(viewedVoiceTurn.reflection))

  useEffect(() => {
    if (voiceThread.length > 0) {
      setVoicePanel(voiceThread)
      setVoiceViewIndex(voiceThread.length - 1)
      return
    }

    if (voiceLoading || voiceError) {
      return
    }

    const timer = window.setTimeout(() => {
      setVoicePanel(null)
      setVoiceViewIndex(0)
      if (!voicePanelOpenRef.current) {
        setVoiceReplyOpen(false)
        setVoiceReply('')
      }
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
    if (!user) {
      clearDraftPersistTimer()
      draftDirtyRef.current = false
      discussionDirtyRef.current = false
      draftReadyRef.current = false
      nuggetsReadyRef.current = false
      setJournalReady(false)
      setJournalError(null)
      setDraft('')
      setNuggets([])
      setVoiceThread([])
      voiceLockedRef.current = false
      return
    }

    draftReadyRef.current = false
    nuggetsReadyRef.current = false
    setJournalReady(false)
    setJournalError(null)

    const unsubscribe = subscribeJournal(user.uid, {
      onDraft: (remoteDraft, remoteDiscussion) => {
        if (!draftDirtyRef.current) {
          setDraft(remoteDraft)
        }
        if (!discussionDirtyRef.current && !draftDirtyRef.current) {
          const saved = persistableDiscussion(remoteDiscussion)
          if (
            discussionFingerprint(saved) !==
            discussionFingerprint(voiceThreadRef.current)
          ) {
            setVoiceThread(saved)
            if (saved.length > 0) {
              voiceLockedRef.current = true
              setReflectionInvite(true)
            } else {
              voiceLockedRef.current = false
            }
          }
        }
        draftReadyRef.current = true
        markJournalReady()
      },
      onNuggets: (remoteNuggets) => {
        setNuggets(remoteNuggets)
        nuggetsReadyRef.current = true
        markJournalReady()
      },
      onError: (error) => {
        setJournalError(error.message)
        draftReadyRef.current = true
        nuggetsReadyRef.current = true
        setJournalReady(true)
      },
    })

    return () => {
      clearDraftPersistTimer()
      unsubscribe()
    }
  }, [user])

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
      const hadDiscussion = voiceThreadRef.current.length > 0
      setReflectionInvite(false)
      setVoiceThread([])
      setVoiceReplyOpen(false)
      setVoiceReply('')
      setVoiceLoading(false)
      setVoiceError(null)
      setVoiceRetryReply(null)
      voiceLockedRef.current = false
      voicePanelOpenRef.current = false
      setVoicePanelOpen(false)
      voiceFetchAbortRef.current?.abort()
      voiceFetchAbortRef.current = null
      if (hadDiscussion) {
        discussionDirtyRef.current = true
        scheduleDraftPersist(draft, [])
      }
      return
    }

    if (voiceLockedRef.current) return

    setReflectionInvite(false)
    setVoiceThread([])
    setVoiceError(null)
    setVoiceRetryReply(null)
    setVoiceLoading(false)
    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    setVoiceReplyOpen(false)
    setVoiceReply('')
    voiceFetchAbortRef.current?.abort()
    voiceFetchAbortRef.current = null

    const idleTimer = window.setTimeout(() => {
      setReflectionInvite(true)
    }, DRAFT_REFLECT_IDLE_MS)

    return () => {
      window.clearTimeout(idleTimer)
    }
  }, [draft, user])

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
    if (!showVoiceComposer || !voicePanelOpen) return
    autosizeTextarea(voiceReplyRef.current)
  }, [showVoiceComposer, voicePanelOpen, voiceReply])

  useLayoutEffect(() => {
    if (!voicePanelOpen || !showVoiceComposer || voiceLoading) return
    if (!shouldRefocusReplyRef.current) return
    shouldRefocusReplyRef.current = false
    voiceReplyRef.current?.focus({ preventScroll: true })
  }, [voicePanelOpen, showVoiceComposer, voiceLoading, voiceReplyOpen])

  function closeVoicePanel() {
    voiceFetchAbortRef.current?.abort()
    voiceFetchAbortRef.current = null
    setVoiceLoading(false)
    setVoiceError(null)
    setVoiceRetryReply(null)
    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    setVoiceReplyOpen(false)
    setVoiceReply('')
  }

  function fetchReflection(reply = '', pendingId?: string) {
    if (!user || voiceLoading) return
    const trimmed = draft.trim()
    if (trimmed.length < DRAFT_REFLECT_MIN_CHARS) return

    voicePanelOpenRef.current = true
    setVoicePanelOpen(true)

    const controller = new AbortController()
    voiceFetchAbortRef.current?.abort()
    voiceFetchAbortRef.current = controller
    setVoiceLoading(true)
    setVoiceError(null)
    if (reply) {
      setVoiceRetryReply(reply)
      voiceLockedRef.current = true
    } else {
      setVoiceRetryReply(null)
    }

    void requestReflection({
      user,
      draft: trimmed,
      history: reflectionHistory,
      reply,
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return
        setVoiceThread((current) => {
          let updated: DiscussionTurn[]
          if (reply) {
            if (pendingId && current.some((turn) => turn.id === pendingId)) {
              updated = current.map((turn) =>
                turn.id === pendingId ? { ...turn, reflection: next } : turn,
              )
            } else {
              updated = [
                ...current,
                {
                  id: createId(),
                  comment: reply,
                  reflection: next,
                },
              ]
            }
          } else {
            updated = [
              {
                id: createId(),
                reflection: next,
              },
            ]
          }
          discussionDirtyRef.current = true
          scheduleDraftPersist(draftRef.current, persistableDiscussion(updated))
          return updated
        })
        setVoiceError(null)
        setVoiceRetryReply(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!reply) setVoiceThread([])
        setVoiceError(toReflectionErrorMessage(error))
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setVoiceLoading(false)
      })
  }

  function openReflection() {
    if (!user || voiceLoading) return
    const trimmed = draft.trim()
    if (trimmed.length < DRAFT_REFLECT_MIN_CHARS) return

    voicePanelOpenRef.current = true
    setVoicePanelOpen(true)

    if (voiceThread.some((turn) => turn.reflection)) {
      setVoicePanel(voiceThread)
      setVoiceViewIndex(voiceThread.length - 1)
      return
    }

    fetchReflection()
  }

  function retryVoiceReflection() {
    if (voiceLoading) return
    if (voiceRetryReply) {
      const pending = voiceThread.find(
        (turn) => turn.comment === voiceRetryReply && !turn.reflection,
      )
      if (pending) {
        fetchReflection(voiceRetryReply, pending.id)
        return
      }
      const pendingId = createId()
      setVoiceThread((current) => [
        ...current,
        { id: pendingId, comment: voiceRetryReply },
      ])
      fetchReflection(voiceRetryReply, pendingId)
      return
    }
    fetchReflection()
  }

  function openVoiceReply() {
    if (voiceLoading || !hasVoiceReflection) return
    const latestIndex = Math.max((voicePanel?.length ?? voiceThread.length) - 1, 0)
    if (voiceViewIndex !== latestIndex) {
      setVoiceViewIndex(latestIndex)
    }
    setVoiceReplyOpen(true)
    shouldRefocusReplyRef.current = true
  }

  function viewEarlierVoice() {
    if (!canViewEarlierVoice) return
    setVoiceViewIndex((index) => Math.max(0, index - 1))
  }

  function viewLaterVoice() {
    if (!canViewLaterVoice || !voicePanel) return
    setVoiceViewIndex((index) => Math.min(voicePanel.length - 1, index + 1))
  }

  function sendVoiceReply() {
    const steer = voiceReply.trim()
    if (!steer || !hasVoiceReflection || !user || voiceLoading) return

    const pendingId = createId()
    setVoiceReply('')
    setVoiceError(null)
    shouldRefocusReplyRef.current = true
    setVoiceThread((current) => [
      ...current.filter((turn) => turn.reflection),
      { id: pendingId, comment: steer },
    ])
    fetchReflection(steer, pendingId)
  }

  function dropNugget() {
    const text = draft.trim()
    if (!text || !user) return

    const discussion = persistableDiscussion(voiceThread)
    const nugget: Nugget = {
      id: createId(),
      text,
      createdAt: Date.now(),
      ...(discussion.length > 0 ? { discussion } : {}),
    }

    setSending(true)
    setNuggets((current) => [nugget, ...current])
    setJustDroppedId(nugget.id)
    setEditingId(null)
    draftDirtyRef.current = true
    discussionDirtyRef.current = true
    clearDraftPersistTimer()
    setDraft('')
    setVoiceThread([])
    setVoiceReplyOpen(false)
    setVoiceReply('')
    setVoiceLoading(false)
    setVoiceError(null)
    setVoiceRetryReply(null)
    setReflectionInvite(false)
    voiceLockedRef.current = false
    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    voiceFetchAbortRef.current?.abort()
    voiceFetchAbortRef.current = null
    inputRef.current?.focus({ preventScroll: true })

    const uid = user.uid
    void Promise.all([createNugget(uid, nugget), persistDraft(uid, '', [])])
      .then(() => {
        draftDirtyRef.current = false
        discussionDirtyRef.current = false
      })
      .catch((error: unknown) => {
        setJournalError(
          error instanceof Error ? error.message : 'Could not save thought.',
        )
      })
  }

  function removeNugget(id: string) {
    if (!user) return
    setNuggets((current) => current.filter((nugget) => nugget.id !== id))
    if (editingId === id) setEditingId(null)
    inputRef.current?.focus({ preventScroll: true })
    void deleteNugget(user.uid, id).catch((error: unknown) => {
      setJournalError(
        error instanceof Error ? error.message : 'Could not remove thought.',
      )
    })
  }

  function saveNugget(id: string, text: string) {
    if (!user) return
    setNuggets((current) =>
      current.map((nugget) =>
        nugget.id === id ? { id, text, createdAt: nugget.createdAt } : nugget,
      ),
    )
    setEditingId(null)
    inputRef.current?.focus({ preventScroll: true })
    void updateNugget(user.uid, id, text).catch((error: unknown) => {
      setJournalError(
        error instanceof Error ? error.message : 'Could not update thought.',
      )
    })
  }

  function saveNuggetDiscussion(id: string, discussion: DiscussionTurn[]) {
    if (!user) return
    const saved = persistableDiscussion(discussion)
    setNuggets((current) =>
      current.map((nugget) =>
        nugget.id === id
          ? {
              ...nugget,
              ...(saved.length > 0
                ? { discussion: saved }
                : { discussion: undefined }),
            }
          : nugget,
      ),
    )
    void updateNuggetDiscussion(user.uid, id, saved).catch((error: unknown) => {
      setJournalError(
        error instanceof Error
          ? error.message
          : 'Could not save reflection.',
      )
    })
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      dropNugget()
    }
  }

  const canDrop = draft.trim().length > 0

  if (!journalReady) {
    return <AuthLoading />
  }

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
        {journalError ? (
          <p className="journal-sync-error" role="alert">
            {journalError}
          </p>
        ) : null}
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
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder="What's rattling around up there?"
                    rows={1}
                    autoFocus
                  />
                </div>
                <div
                  className={`nugget-composer-bar nugget-composer-bar-sizer${SHOW_PROOFREAD ? ' has-proofread' : ''}${showReflectionOrb ? ' has-orb' : ''}`}
                  aria-hidden="true"
                >
                  {showReflectionOrb ? (
                    <span className="reflection-invite" aria-hidden="true">
                      <span className="reflection-orb">
                        <span className="reflection-orb-aura" />
                        <span className="reflection-orb-aura is-late" />
                        <span className="reflection-orb-core" />
                      </span>
                      <span className="reflection-invite-label">Reflect</span>
                    </span>
                  ) : null}
                  <div className="nugget-composer-actions">
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
              </div>
              <div ref={composerBarDockRef} className="nugget-composer-bar-dock">
                <div
                  className={`nugget-composer-bar${SHOW_PROOFREAD ? ' has-proofread' : ''}${showReflectionOrb ? ' has-orb' : ''}`}
                >
                  {showReflectionOrb ? (
                    <button
                      type="button"
                      className="reflection-invite"
                      onClick={openReflection}
                      aria-label="Reflect on this thought"
                    >
                      <span className="reflection-orb" aria-hidden="true">
                        <span className="reflection-orb-aura" />
                        <span className="reflection-orb-aura is-late" />
                        <span className="reflection-orb-core" />
                      </span>
                      <span className="reflection-invite-label">Reflect</span>
                    </button>
                  ) : null}
                  <div className="nugget-composer-actions">
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
                      <div className="draft-voice-head-actions">
                        <button
                          type="button"
                          className="draft-voice-dismiss"
                          onClick={closeVoicePanel}
                          aria-label="Hide reflection"
                          title="Hide reflection"
                        >
                          <svg className="draft-voice-dismiss-icon" viewBox="0 0 16 16" aria-hidden="true">
                            <path
                              d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.55"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="draft-voice-body">
                      {viewedVoiceTurn ? (
                        <div
                          className={`draft-voice-turn${viewedVoiceTurn.reflection ? ' is-complete' : ' is-pending'}`}
                          key={viewedVoiceTurn.id}
                        >
                          {viewedVoiceTurn.comment ? (
                            <p className="draft-voice-comment">{viewedVoiceTurn.comment}</p>
                          ) : null}
                          {viewedVoiceTurn.reflection ? (
                            <p
                              className="draft-voice-text"
                              key={`${viewedVoiceTurn.id}-reflection`}
                            >
                              <ReflectionCopy reflection={viewedVoiceTurn.reflection} />
                            </p>
                          ) : voiceLoading ? (
                            <FormingReflection />
                          ) : null}
                        </div>
                      ) : null}

                      {showInitialForming ? <FormingReflection /> : null}

                      {voiceError && !voiceLoading ? (
                        <div className="draft-voice-error">
                          <p className="draft-voice-text is-error">{voiceError}</p>
                          <button
                            type="button"
                            className="draft-voice-retry"
                            onClick={retryVoiceReflection}
                          >
                            Try again
                          </button>
                        </div>
                      ) : null}

                      {showVoiceReplyTrigger ? (
                        <button
                          type="button"
                          className="draft-voice-reply-trigger"
                          onClick={openVoiceReply}
                          aria-label="Reply"
                        >
                          <span className="draft-voice-reply-caret" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>

                    {showVoiceComposer ? (
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
                                if (voiceReply.trim()) {
                                  setVoiceReply('')
                                  return
                                }
                                setVoiceReplyOpen(false)
                                return
                              }
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void sendVoiceReply()
                              }
                            }}
                            rows={1}
                            disabled={voiceLoading}
                            aria-label="Reply"
                          />
                          <button
                            type="button"
                            className="draft-voice-reply-submit"
                            onClick={() => void sendVoiceReply()}
                            disabled={!voiceReply.trim() || voiceLoading}
                            aria-label="Send"
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
                            onDiscussionChange={(discussion) =>
                              saveNuggetDiscussion(nugget.id, discussion)
                            }
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
