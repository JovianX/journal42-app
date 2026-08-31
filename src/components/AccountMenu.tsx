import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { userFirstName, userInitials, userLabel } from '../lib/userDisplay'

type AccountMenuProps = {
  displayName: string | null
  email: string | null
  photoURL: string | null
  signingOut?: boolean
  onSignOut?: () => void
  onLockJournal?: () => void
  showLockJournal?: boolean
}

export default function AccountMenu({
  displayName,
  email,
  photoURL,
  signingOut = false,
  onSignOut,
  onLockJournal,
  showLockJournal = false,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLAnchorElement>(null)
  const menuId = useId()
  const nameId = useId()
  const fullLabel = userLabel(displayName, email)
  const shortLabel = displayName?.trim()
    ? userFirstName(displayName, email)
    : fullLabel
  const initials = userInitials(displayName, email)
  const showEmail = Boolean(email)
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
          <Link
            ref={itemRef}
            className="account-menu-item"
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          {showLockJournal && onLockJournal ? (
            <button
              type="button"
              className="account-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onLockJournal()
              }}
            >
              Lock journal
            </button>
          ) : null}
          {onSignOut ? (
            <button
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
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function useAccountSignOut() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  return { signingOut, onSignOut }
}
