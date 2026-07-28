import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../auth/useAuth'

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

type NuggetItemProps = {
  nugget: Nugget
  isFresh: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (text: string) => void
  onRemove: () => void
}

function NuggetItem({
  nugget,
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
  const editRef = useRef<HTMLTextAreaElement>(null)
  const itemRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!isFresh) return
    const frame = window.requestAnimationFrame(() => {
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isFresh])

  useEffect(() => {
    if (!isEditing) return
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
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
        setConfirmRemove(false)
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
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
  }, [menuOpen])

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

  return (
    <li
      ref={itemRef}
      className={`nugget${isFresh ? ' nugget-fresh' : ''}${isEditing ? ' nugget-editing' : ''}${menuOpen ? ' is-menu-open' : ''}`}
    >
      <div className="nugget-meta">
        <span className="nugget-time">{formatTime(nugget.createdAt)}</span>
      </div>

      {isEditing ? (
        <>
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
        <>
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
                      onClick={() => setConfirmRemove(true)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </>
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
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composerFrameRef = useRef<HTMLFormElement>(null)
  const composerFaceRef = useRef<HTMLDivElement>(null)
  const composerBarDockRef = useRef<HTMLDivElement>(null)
  const composerGapRef = useRef<number | null>(null)
  const listLabelId = useId()
  const dayGroups = useMemo(() => groupNuggetsByDay(nuggets, now), [nuggets, now])
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({})

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
                      d="M3 8h9.2m0 0L8.5 4.3M12.2 8 8.5 11.7"
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
                  aria-label="Add thought"
                >
                  <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M3 8h9.2m0 0L8.5 4.3M12.2 8 8.5 11.7"
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
