import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { User } from 'firebase/auth'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import AccountMenu, { useAccountSignOut } from '../components/AccountMenu'
import {
  requestReflection,
  toReflectionErrorMessage,
  type Reflection,
  type ReflectionHistoryItem,
} from '../lib/ai'
import {
  isPaidPlan,
  planHasHistoryReflection,
  useBilling,
  type PaidPlanId,
} from '../lib/billing'
import { startCheckout } from '../lib/billingApi'
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
  isYesterday: boolean
  isRecent: boolean
  nuggets: Nugget[]
}

function groupNuggetsByDay(nuggets: Nugget[], now: number): DayGroup[] {
  const todayKey = dayKey(now)
  const yesterdayDate = new Date(startOfLocalDay(now))
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = dayKey(yesterdayDate.getTime())
  const groups = new Map<string, DayGroup>()

  for (const nugget of nuggets) {
    const key = dayKey(nugget.createdAt)
    const existing = groups.get(key)
    if (existing) {
      existing.nuggets.push(nugget)
      continue
    }

    const isToday = key === todayKey
    const isYesterday = key === yesterdayKey
    groups.set(key, {
      key,
      label: formatDayLabel(nugget.createdAt, now),
      isToday,
      isYesterday,
      isRecent: isToday || isYesterday,
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

type ReflectionPanelProps = {
  open: boolean
  panel: DiscussionTurn[] | null
  viewIndex: number
  loading: boolean
  error: string | null
  replyOpen: boolean
  reply: string
  replyRef: RefObject<HTMLTextAreaElement | null>
  onViewEarlier: () => void
  onViewLater: () => void
  onViewAt: (index: number) => void
  onDismiss: () => void
  onRetry: () => void
  onOpenReply: () => void
  onReplyChange: (value: string) => void
  onSendReply: () => void
  onCloseReply: () => void
}

function ReflectionPanel({
  open,
  panel,
  viewIndex,
  loading,
  error,
  replyOpen,
  reply,
  replyRef,
  onViewEarlier,
  onViewLater,
  onViewAt,
  onDismiss,
  onRetry,
  onOpenReply,
  onReplyChange,
  onSendReply,
  onCloseReply,
}: ReflectionPanelProps) {
  const viewedTurn = panel?.[viewIndex] ?? null
  const isViewingLatest = Boolean(panel && viewIndex === panel.length - 1)
  const canViewEarlier = viewIndex > 0
  const canViewLater = Boolean(panel && viewIndex < panel.length - 1)
  const hasReflection = Boolean(panel?.some((turn) => turn.reflection))
  const showComposer = replyOpen && isViewingLatest && hasReflection
  const showReplyRow =
    hasReflection &&
    isViewingLatest &&
    !loading &&
    Boolean(viewedTurn?.reflection)
  const showPanel = Boolean(viewedTurn) || loading || Boolean(error)
  const showInitialForming =
    loading && (!viewedTurn || Boolean(viewedTurn.reflection))

  return (
    <div className={`draft-voice-slot${open ? ' is-open' : ''}`}>
      <div className="draft-voice-slot-inner">
        {showPanel ? (
          <aside className="draft-voice" aria-live="polite">
            <div className="draft-voice-head">
              <div className="draft-voice-head-main">
                <p className="draft-voice-label">Reflection</p>
                {panel && panel.length > 1 ? (
                  <div
                    className="draft-voice-history"
                    role="group"
                    aria-label={`Reflection ${viewIndex + 1} of ${panel.length}`}
                  >
                    <button
                      type="button"
                      className="draft-voice-history-btn"
                      onClick={onViewEarlier}
                      disabled={!canViewEarlier || loading}
                      aria-label="Earlier reflection"
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
                    <div className="draft-voice-history-track" aria-hidden="true">
                      {panel.map((turn, index) => (
                        <button
                          key={turn.id}
                          type="button"
                          className={`draft-voice-history-mark${index === viewIndex ? ' is-current' : ''}`}
                          onClick={() => onViewAt(index)}
                          disabled={loading}
                          tabIndex={-1}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="draft-voice-history-btn"
                      onClick={onViewLater}
                      disabled={!canViewLater || loading}
                      aria-label="Later reflection"
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
                  onClick={onDismiss}
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
              {viewedTurn ? (
                <div
                  className={`draft-voice-turn${viewedTurn.reflection ? ' is-complete' : ' is-pending'}`}
                  key={viewedTurn.id}
                >
                  {viewedTurn.comment ? (
                    <p className="draft-voice-comment">{viewedTurn.comment}</p>
                  ) : null}
                  {viewedTurn.reflection ? (
                    <p className="draft-voice-text" key={`${viewedTurn.id}-reflection`}>
                      <ReflectionCopy reflection={viewedTurn.reflection} />
                    </p>
                  ) : loading ? (
                    <FormingReflection />
                  ) : null}
                </div>
              ) : null}

              {showInitialForming ? <FormingReflection /> : null}

              {error && !loading ? (
                <div className="draft-voice-error">
                  <p className="draft-voice-text is-error">{error}</p>
                  <button type="button" className="draft-voice-retry" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              ) : null}
            </div>

            {showReplyRow ? (
              <div className="draft-voice-paths">
                <div
                  className={`draft-voice-reply-field${showComposer ? ' is-active' : ''}${reply.trim() ? ' has-text' : ''}`}
                >
                  <textarea
                    ref={replyRef}
                    className="draft-voice-reply-input"
                    value={reply}
                    onFocus={() => {
                      if (!replyOpen) onOpenReply()
                    }}
                    onChange={(event) => onReplyChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        if (reply.trim()) {
                          onReplyChange('')
                          return
                        }
                        onCloseReply()
                        event.currentTarget.blur()
                        return
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        onSendReply()
                      }
                    }}
                    rows={1}
                    disabled={loading}
                    placeholder="Reply…"
                    aria-label="Reply to the reflection"
                  />
                  {reply.trim() ? (
                    <button
                      type="button"
                      className="draft-voice-reply-submit"
                      onClick={onSendReply}
                      disabled={loading}
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
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

type NuggetItemProps = {
  nugget: Nugget
  history: ReflectionHistoryItem[]
  user: User | null
  isFresh: boolean
  onSaveEdit: (text: string) => void
  onDiscussionChange: (discussion: DiscussionTurn[]) => void
  onRemove: () => void
}

function NuggetItem({
  nugget,
  history,
  user,
  isFresh,
  onSaveEdit,
  onDiscussionChange,
  onRemove,
}: NuggetItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(nugget.text)
  const [discussion, setDiscussion] = useState<DiscussionTurn[]>(
    () => nugget.discussion ?? [],
  )
  const [voicePanel, setVoicePanel] = useState<DiscussionTurn[] | null>(null)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceReplyOpen, setVoiceReplyOpen] = useState(false)
  const [voiceReply, setVoiceReply] = useState('')
  const [voiceViewIndex, setVoiceViewIndex] = useState(0)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceRetryReply, setVoiceRetryReply] = useState<string | null>(null)
  const itemRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const voiceReplyRef = useRef<HTMLTextAreaElement>(null)
  const shouldRefocusReplyRef = useRef(false)
  const voicePanelOpenRef = useRef(false)
  const discussionDirtyRef = useRef(false)
  const reflectionRequestRef = useRef(0)
  const menuId = useId()
  const storedFingerprint = discussionFingerprint(nugget.discussion)
  const hasStoredReflection = discussion.some((turn) => turn.reflection)
  const canReflect = nugget.text.trim().length >= DRAFT_REFLECT_MIN_CHARS
  const showReflectInvite =
    canReflect && !voicePanelOpen && !hasStoredReflection && !isEditing && !voiceLoading
  const showContinueInvite =
    hasStoredReflection && !voicePanelOpen && !isEditing && !voiceLoading

  useEffect(() => {
    discussionDirtyRef.current = false
    setDiscussion(nugget.discussion ?? [])
    setVoiceError(null)
    setVoiceLoading(false)
    setVoiceRetryReply(null)
    setVoiceReply('')
    setVoiceReplyOpen(false)
    reflectionRequestRef.current += 1
    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    setIsEditing(false)
  }, [nugget.id])

  useEffect(() => {
    if (discussionDirtyRef.current) return
    setDiscussion(nugget.discussion ?? [])
  }, [nugget.id, storedFingerprint, nugget.discussion])

  useEffect(() => {
    if (discussion.length > 0) {
      setVoicePanel(discussion)
      setVoiceViewIndex(discussion.length - 1)
      return
    }
    if (voiceLoading || voiceError) return
    const timer = window.setTimeout(() => {
      setVoicePanel(null)
      setVoiceViewIndex(0)
      if (!voicePanelOpenRef.current) {
        setVoiceReplyOpen(false)
        setVoiceReply('')
      }
    }, VOICE_PANEL_MS)
    return () => window.clearTimeout(timer)
  }, [discussion, voiceLoading, voiceError])

  useEffect(() => {
    if (!isFresh) return
    const frame = window.requestAnimationFrame(() => {
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isFresh])

  useEffect(() => {
    if (!isEditing) return
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
    if (!voicePanelOpen || !voiceReplyOpen) return
    autosizeTextarea(voiceReplyRef.current)
  }, [voicePanelOpen, voiceReplyOpen, voiceReply])

  useLayoutEffect(() => {
    if (!voicePanelOpen || !voiceReplyOpen || voiceLoading) return
    if (!shouldRefocusReplyRef.current) return
    shouldRefocusReplyRef.current = false
    voiceReplyRef.current?.focus({ preventScroll: true })
  }, [voicePanelOpen, voiceReplyOpen, voiceLoading])

  useEffect(() => {
    if (!menuOpen && !voicePanelOpen && !isEditing) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
        setConfirmRemove(false)
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (voiceReply.trim()) {
        setVoiceReply('')
        return
      }
      if (voiceReplyOpen) {
        setVoiceReplyOpen(false)
        return
      }
      if (isEditing) {
        setIsEditing(false)
        setEditText(nugget.text)
        return
      }
      if (voicePanelOpen) {
        closeVoicePanel()
        return
      }
      setMenuOpen(false)
      setConfirmRemove(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, voicePanelOpen, voiceReplyOpen, voiceReply, isEditing, nugget.text])

  function closeVoicePanel() {
    reflectionRequestRef.current += 1
    setVoiceLoading(false)
    setVoiceError(null)
    setVoiceRetryReply(null)
    voicePanelOpenRef.current = false
    setVoicePanelOpen(false)
    setVoiceReplyOpen(false)
    setVoiceReply('')
  }

  function fetchTurn(steer = '', pendingId?: string) {
    if (voiceLoading || !user) return
    if (nugget.text.trim().length < DRAFT_REFLECT_MIN_CHARS) {
      setVoiceError('Write a little more before reflecting.')
      return
    }

    const requestId = reflectionRequestRef.current + 1
    reflectionRequestRef.current = requestId
    voicePanelOpenRef.current = true
    setVoicePanelOpen(true)
    setVoiceLoading(true)
    setVoiceError(null)
    if (steer) setVoiceRetryReply(steer)
    else setVoiceRetryReply(null)

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
          const saved = persistableDiscussion(updated)
          discussionDirtyRef.current = true
          onDiscussionChange(saved)
          return updated
        })
        setVoiceError(null)
        setVoiceRetryReply(null)
      })
      .catch((error: unknown) => {
        if (reflectionRequestRef.current !== requestId) return
        setVoiceError(toReflectionErrorMessage(error))
      })
      .finally(() => {
        if (reflectionRequestRef.current !== requestId) return
        setVoiceLoading(false)
      })
  }

  function openReflection(options?: { continueReply?: boolean }) {
    setMenuOpen(false)
    setConfirmRemove(false)
    if (isEditing) return

    voicePanelOpenRef.current = true
    setVoicePanelOpen(true)

    if (hasStoredReflection && !voiceError) {
      setVoicePanel(discussion)
      setVoiceViewIndex(Math.max(discussion.length - 1, 0))
      if (options?.continueReply) {
        setVoiceReplyOpen(true)
        shouldRefocusReplyRef.current = true
      }
      return
    }

    if (voiceLoading || !user) return
    fetchTurn(voiceRetryReply ?? '')
  }

  function retryReflection() {
    if (voiceLoading) return
    if (voiceRetryReply) {
      const pending = discussion.find(
        (turn) => turn.comment === voiceRetryReply && !turn.reflection,
      )
      if (pending) {
        fetchTurn(voiceRetryReply, pending.id)
        return
      }
      const pendingId = createId()
      discussionDirtyRef.current = true
      setDiscussion((current) => [...current, { id: pendingId, comment: voiceRetryReply }])
      fetchTurn(voiceRetryReply, pendingId)
      return
    }
    fetchTurn()
  }

  function openVoiceReply() {
    if (voiceLoading || !hasStoredReflection) return
    const latestIndex = Math.max((voicePanel?.length ?? discussion.length) - 1, 0)
    if (voiceViewIndex !== latestIndex) setVoiceViewIndex(latestIndex)
    setVoiceReplyOpen(true)
  }

  function viewEarlierVoice() {
    if (voiceViewIndex <= 0) return
    setVoiceViewIndex((index) => Math.max(0, index - 1))
  }

  function viewLaterVoice() {
    if (!voicePanel || voiceViewIndex >= voicePanel.length - 1) return
    setVoiceViewIndex((index) => Math.min(voicePanel.length - 1, index + 1))
  }

  function viewVoiceAt(index: number) {
    if (!voicePanel) return
    setVoiceViewIndex(Math.max(0, Math.min(voicePanel.length - 1, index)))
  }

  function sendVoiceReply() {
    const steer = voiceReply.trim()
    if (!steer || !hasStoredReflection || !user || voiceLoading) return

    const pendingId = createId()
    setVoiceReply('')
    setVoiceError(null)
    shouldRefocusReplyRef.current = true
    discussionDirtyRef.current = true
    setDiscussion((current) => [
      ...current.filter((turn) => turn.reflection),
      { id: pendingId, comment: steer },
    ])
    fetchTurn(steer, pendingId)
  }

  function saveEdit() {
    const text = editText.trim()
    if (!text) return
    if (text !== nugget.text.trim()) {
      onSaveEdit(text)
    }
    setIsEditing(false)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditText(nugget.text)
  }

  function onEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      saveEdit()
    }
  }

  return (
    <li
      ref={itemRef}
      className={`thought-saved${isFresh ? ' is-fresh' : ''}${menuOpen ? ' is-menu-open' : ''}${voicePanelOpen ? ' has-voice' : ''}${hasStoredReflection ? ' has-reflection' : ''}${isEditing ? ' is-editing' : ''}`}
    >
      <div className={`composer-stack thought-stack${voicePanelOpen ? ' has-voice' : ''}`}>
        <div className="thought-frame">
          <div className="thought-face" aria-hidden="true" />
          <div className="thought-body">
            <div className="thought-meta">
              <span className="nugget-time">{formatTime(nugget.createdAt)}</span>
            </div>

            {isEditing ? (
              <textarea
                ref={editRef}
                className="thought-text thought-edit-input"
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                onKeyDown={onEditKeyDown}
                rows={1}
                aria-label="Edit thought"
              />
            ) : (
              <p className="thought-text">{nugget.text}</p>
            )}

            {isEditing || showReflectInvite || showContinueInvite ? (
              <div className={`thought-bar${isEditing ? ' is-editing' : ' has-actions'}`}>
                {isEditing ? (
                  <div className="thought-edit-actions">
                    <button type="button" className="thought-edit-cancel" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="thought-edit-save"
                      onClick={saveEdit}
                      disabled={!editText.trim()}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="reflection-invite"
                    onClick={() =>
                      openReflection(showContinueInvite ? { continueReply: true } : undefined)
                    }
                    aria-label={
                      showContinueInvite ? 'Continue reflection' : 'Reflect on this thought'
                    }
                  >
                    <span className="reflection-orb" aria-hidden="true">
                      <span className="reflection-orb-aura" />
                      <span className="reflection-orb-aura is-late" />
                      <span className="reflection-orb-core" />
                    </span>
                    <span className="reflection-invite-label">
                      {showContinueInvite ? 'Continue' : 'Reflect'}
                    </span>
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {isEditing ? null : (
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
                        openReflection(
                          hasStoredReflection ? { continueReply: false } : undefined,
                        )
                      }}
                    >
                      {hasStoredReflection ? 'View reflection' : 'Reflect'}
                    </button>
                    <button
                      type="button"
                      className="nugget-more-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        closeVoicePanel()
                        setIsEditing(true)
                      }}
                    >
                      Edit
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
          )}
        </div>

        <ReflectionPanel
          open={voicePanelOpen}
          panel={voicePanel}
          viewIndex={voiceViewIndex}
          loading={voiceLoading}
          error={voiceError}
          replyOpen={voiceReplyOpen}
          reply={voiceReply}
          replyRef={voiceReplyRef}
          onViewEarlier={viewEarlierVoice}
          onViewLater={viewLaterVoice}
          onViewAt={viewVoiceAt}
          onDismiss={closeVoicePanel}
          onRetry={retryReflection}
          onOpenReply={openVoiceReply}
          onReplyChange={setVoiceReply}
          onSendReply={sendVoiceReply}
          onCloseReply={() => setVoiceReplyOpen(false)}
        />
      </div>
    </li>
  )
}

export default function JournalHome() {
  const { user } = useAuth()
  const { signingOut, onSignOut } = useAccountSignOut()
  const [searchParams, setSearchParams] = useSearchParams()
  const { billing, ready: billingReady } = useBilling(user?.uid)
  const [draft, setDraft] = useState('')
  const [nuggets, setNuggets] = useState<Nugget[]>([])
  const [journalReady, setJournalReady] = useState(false)
  const [journalError, setJournalError] = useState<string | null>(null)
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
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
  const [composerInvite, setComposerInvite] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const voiceReplyRef = useRef<HTMLTextAreaElement>(null)
  const shouldRefocusReplyRef = useRef(false)
  const composerFrameRef = useRef<HTMLFormElement>(null)
  const composerFaceRef = useRef<HTMLDivElement>(null)
  const composerBarDockRef = useRef<HTMLDivElement>(null)
  const composerGapRef = useRef<number | null>(null)
  const composerInviteTimerRef = useRef<number | null>(null)
  const voiceLoadingRef = useRef(false)
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
  const streamRef = useRef<HTMLElement>(null)
  const [showThoughtsBelow, setShowThoughtsBelow] = useState(false)
  const dayGroups = useMemo(() => groupNuggetsByDay(nuggets, now), [nuggets, now])
  const reflectionHistory = useMemo(() => {
    if (!planHasHistoryReflection(billing.plan)) return []
    return historyFromNuggets(nuggets)
  }, [billing.plan, nuggets])
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
  const showVoiceComposer =
    voiceReplyOpen &&
    Boolean(voicePanel && voiceViewIndex === voicePanel.length - 1) &&
    (Boolean(voicePanel?.some((turn) => turn.reflection) || voiceThread.some((turn) => turn.reflection)) ||
      Boolean(voiceRetryReply))
  const hasVoiceReflection = Boolean(
    voicePanel?.some((turn) => turn.reflection) ||
      voiceThread.some((turn) => turn.reflection),
  )

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
    return !group.isRecent
  }

  function toggleDay(key: string, currentlyCollapsed: boolean) {
    setCollapsedDays((current) => ({ ...current, [key]: !currentlyCollapsed }))
  }

  async function runCheckout(plan: PaidPlanId) {
    if (!user || billingBusy) return
    setBillingBusy(true)
    setBillingError(null)
    try {
      await startCheckout(user, plan)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Checkout failed.')
      setBillingBusy(false)
    }
  }

  useEffect(() => {
    const requested = searchParams.get('plan')
    if (!user || !billingReady || !isPaidPlan(requested)) return
    if (billing.plan === requested || (requested === 'pattern' && billing.plan === 'forever')) {
      const next = new URLSearchParams(searchParams)
      next.delete('plan')
      setSearchParams(next, { replace: true })
      return
    }

    const next = new URLSearchParams(searchParams)
    next.delete('plan')
    setSearchParams(next, { replace: true })
    void runCheckout(requested)
    // Auto-start checkout once when ?plan= is present after login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, searchParams, billingReady, billing.plan])

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
    if (nuggets.length === 0) {
      setShowThoughtsBelow(false)
      return
    }

    function updateCue() {
      setShowThoughtsBelow(window.scrollY < 12)
    }

    updateCue()
    window.addEventListener('scroll', updateCue, { passive: true })
    return () => window.removeEventListener('scroll', updateCue)
  }, [nuggets.length, journalReady])

  useEffect(() => {
    if (!sending) return
    const timer = window.setTimeout(() => setSending(false), 320)
    return () => window.clearTimeout(timer)
  }, [sending])

  useEffect(() => {
    const wasLoading = voiceLoadingRef.current
    voiceLoadingRef.current = voiceLoading
    if (!wasLoading || voiceLoading || voiceError) return
    if (!voicePanelOpen) return
    const complete = voiceThread.filter((turn) => turn.reflection)
    if (complete.length !== 1) return
    pulseComposerInvite()
  }, [voiceLoading, voiceError, voicePanelOpen, voiceThread])

  useEffect(() => {
    return () => {
      if (composerInviteTimerRef.current !== null) {
        window.clearTimeout(composerInviteTimerRef.current)
      }
    }
  }, [])

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
    setReflectionInvite(true)
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
  }, [draft, showReflectionOrb])

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
  }

  function releaseReplyFocus() {
    if (!voiceReplyOpen && !voiceReply) return
    setVoiceReplyOpen(false)
    setVoiceReply('')
  }

  function pulseComposerInvite() {
    setComposerInvite(true)
    if (composerInviteTimerRef.current !== null) {
      window.clearTimeout(composerInviteTimerRef.current)
    }
    composerInviteTimerRef.current = window.setTimeout(() => {
      composerInviteTimerRef.current = null
      setComposerInvite(false)
    }, 1600)
  }

  function viewEarlierVoice() {
    if (voiceViewIndex <= 0) return
    setVoiceViewIndex((index) => Math.max(0, index - 1))
  }

  function viewLaterVoice() {
    if (!voicePanel || voiceViewIndex >= voicePanel.length - 1) return
    setVoiceViewIndex((index) => Math.min(voicePanel.length - 1, index + 1))
  }

  function viewVoiceAt(index: number) {
    if (!voicePanel) return
    setVoiceViewIndex(Math.max(0, Math.min(voicePanel.length - 1, index)))
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
        nugget.id === id
          ? { ...nugget, text }
          : nugget,
      ),
    )
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

      <main className={`app-main${nuggets.length > 0 ? ' has-thoughts' : ''}`}>
        {journalError ? (
          <p className="journal-sync-error" role="alert">
            {journalError}
          </p>
        ) : null}
        {billingError ? (
          <p className="journal-sync-error" role="alert">
            {billingError}
          </p>
        ) : null}
        <section className="journal-stage">
          <h1 className="journal-prompt">Get it out of your head.</h1>
          <p className="journal-hint">Start with whatever is loudest.</p>

          <div className={`composer-stack${voicePanelOpen ? ' has-voice' : ''}`}>
            <form
              ref={composerFrameRef}
              className={`nugget-composer-frame${sending ? ' is-sending' : ''}${composerInvite ? ' is-inviting' : ''}`}
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
                    onFocus={() => {
                      if (voiceReplyOpen || voiceReply) releaseReplyFocus()
                    }}
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

            <ReflectionPanel
              open={voicePanelOpen}
              panel={voicePanel}
              viewIndex={voiceViewIndex}
              loading={voiceLoading}
              error={voiceError}
              replyOpen={voiceReplyOpen}
              reply={voiceReply}
              replyRef={voiceReplyRef}
              onViewEarlier={viewEarlierVoice}
              onViewLater={viewLaterVoice}
              onViewAt={viewVoiceAt}
              onDismiss={closeVoicePanel}
              onRetry={retryVoiceReflection}
              onOpenReply={openVoiceReply}
              onReplyChange={setVoiceReply}
              onSendReply={sendVoiceReply}
              onCloseReply={() => setVoiceReplyOpen(false)}
            />
          </div>

          {showThoughtsBelow ? (
            <button
              type="button"
              className="thoughts-below"
              onClick={() => {
                streamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              aria-label="View saved thoughts"
            >
              <span className="thoughts-below-label">Thoughts</span>
              <svg className="thoughts-below-mark" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3.5 6.2 8 10.5l4.5-4.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.55"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </section>

        <section
          ref={streamRef}
          className="nugget-stream"
          aria-labelledby={listLabelId}
        >
          <div className="nugget-stream-head">
            <h2 id={listLabelId}>Thoughts</h2>
          </div>

          {nuggets.length === 0 ? (
            <p className="nugget-empty">
              Your saved thoughts will gather here.
            </p>
          ) : (
            <div className="nugget-days">
              {dayGroups.map((group, index) => {
                const collapsed = isDayCollapsed(group)
                const headingId = `${listLabelId}-${group.key}`
                const latest = group.nuggets[0]
                const prevGroup = dayGroups[index - 1]
                const startsEarlier =
                  !group.isRecent && (index === 0 || Boolean(prevGroup?.isRecent))

                return (
                  <section
                    key={group.key}
                    className={`nugget-day${group.isToday ? ' is-today' : ''}${group.isYesterday ? ' is-yesterday' : ''}${group.isRecent ? ' is-recent' : ' is-earlier'}${collapsed ? ' is-collapsed' : ''}${startsEarlier ? ' is-earlier-start' : ''}`}
                    aria-labelledby={headingId}
                  >
                    <button
                      type="button"
                      className="nugget-day-toggle"
                      id={headingId}
                      aria-expanded={!collapsed}
                      onClick={() => {
                        if (group.isToday && !collapsed) return
                        toggleDay(group.key, collapsed)
                      }}
                    >
                      <span className="nugget-day-toggle-row">
                        <span className="nugget-day-toggle-main">
                          {group.isToday && !collapsed ? null : (
                            <DayChevron expanded={!collapsed} />
                          )}
                          <span className="nugget-day-label">{group.label}</span>
                        </span>
                        {group.isToday && !collapsed ? null : (
                          <span className="nugget-day-count">
                            {group.nuggets.length}{' '}
                            {group.nuggets.length === 1 ? 'thought' : 'thoughts'}
                          </span>
                        )}
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
                            history={
                              planHasHistoryReflection(billing.plan)
                                ? historyFromNuggets(nuggets, nugget.id)
                                : []
                            }
                            user={user}
                            isFresh={justDroppedId === nugget.id}
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
