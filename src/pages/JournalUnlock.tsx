import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { useJournalLock } from '../auth/useJournalLock'

export default function JournalUnlock() {
  const { signOut } = useAuth()
  const { unlock } = useJournalLock()
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Journal42 · Unlock'
    return () => {
      document.title = 'Journal42'
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || passcode.length < 4) {
      setError('Enter at least 4 characters.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await unlock(passcode)
    if (result === 'wrong-passcode') {
      setError('Incorrect passcode.')
      setPasscode('')
    }
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>

      <div className="auth-panel">
        <p className="auth-brand">
          Journal<span>42</span>
        </p>
        <h1>Unlock your journal</h1>
        <p className="auth-lead">
          Your entries are encrypted on this device. Enter your passcode to read
          them.
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span className="auth-label">Passcode</span>
            <input
              className="auth-input"
              type="password"
              name="journal-passcode"
              autoComplete="current-password"
              inputMode="text"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              disabled={busy}
              required
              minLength={4}
              autoFocus
            />
          </label>

          {error ? (
            <p className="auth-notice auth-notice-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary auth-submit" disabled={busy}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>

        <button
          type="button"
          className="auth-forgot-btn journal-unlock-signout"
          onClick={() => void signOut()}
          disabled={busy}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
