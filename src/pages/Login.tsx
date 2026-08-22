import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { isFirebaseConfigured } from '../lib/firebase'
import { captureLandingDraftFromSearch } from '../lib/landingDraft'
import { initMetaPixel, trackMetaPageView } from '../lib/metaPixel'

function GoogleIcon() {
  return (
    <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function friendlyAuthError(error: unknown): string {
  if (error instanceof Error && error.message.includes('Firebase is not configured')) {
    return error.message
  }

  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Try again when you are ready.'
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.'
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in instead.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. Add it in the Firebase console.'
    case 'auth/unauthorized-continue-uri':
    case 'auth/invalid-continue-uri':
      return 'Password reset is misconfigured for this domain. Try again from localhost or the production app URL.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet. Check Firebase Authentication settings.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/invalid-api-key':
      return 'Firebase API key is invalid. Check app/.env and restart the dev server.'
    case 'auth/missing-email':
      return 'Enter the email for your account.'
    default:
      return 'Could not sign in. Try again in a moment.'
  }
}

type AuthMode = 'signin' | 'signup' | 'reset'

function initialAuthMode(pathname: string, modeParam: string | null): AuthMode {
  if (pathname === '/signup' || modeParam === 'signup') return 'signup'
  if (modeParam === 'reset') return 'reset'
  return 'signin'
}

export default function Login() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>(() =>
    initialAuthMode(location.pathname, searchParams.get('mode')),
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState<'google' | 'email' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [landingDraft, setLandingDraft] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : captureLandingDraftFromSearch(window.location.search),
  )

  useEffect(() => {
    setMode(initialAuthMode(location.pathname, searchParams.get('mode')))
  }, [location.pathname, searchParams])

  useEffect(() => {
    initMetaPixel()
    trackMetaPageView()
  }, [])

  useEffect(() => {
    setLandingDraft(captureLandingDraftFromSearch(location.search))
  }, [location.search])

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function onGoogle() {
    if (pending) return
    setPending('google')
    setError(null)
    setNotice(null)

    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(friendlyAuthError(signInError))
      setPending(null)
    }
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const nextEmail = email.trim()
    if (!nextEmail) {
      setError('Enter an email address.')
      return
    }

    if (mode === 'reset') {
      setPending('reset')
      setError(null)
      setNotice(null)
      try {
        await sendPasswordReset(nextEmail)
        setNotice(
          'If an account exists for that email, a reset link is on its way. Check your inbox (and spam).',
        )
      } catch (resetError) {
        setError(
          resetError instanceof Error
            ? resetError.message
            : friendlyAuthError(resetError),
        )
      } finally {
        setPending(null)
      }
      return
    }

    if (!password) {
      setError('Enter an email and password.')
      return
    }

    setPending('email')
    setError(null)
    setNotice(null)

    try {
      if (mode === 'signup') {
        await signUpWithEmail(nextEmail, password)
      } else {
        await signInWithEmail(nextEmail, password)
      }
    } catch (signInError) {
      setError(friendlyAuthError(signInError))
      setPending(null)
    }
  }

  const busy = pending !== null
  const authReady = isFirebaseConfigured
  const title =
    mode === 'signup'
      ? landingDraft
        ? 'Keep this thought'
        : 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Start journaling'
  const lead =
    mode === 'signup'
      ? landingDraft
        ? 'Create an account to save what you wrote. Reflect and chat, a few times a day, free.'
        : 'Pick an email and password. Write, save, reflect. Your thoughts stay private.'
      : mode === 'reset'
        ? 'Enter your email and we will send a reset link.'
        : 'Log in with Google or email. Your thoughts stay private.'

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
        <h1>{title}</h1>
        <p className="auth-lead">{lead}</p>

        {landingDraft && mode === 'signup' ? (
          <blockquote className="auth-draft-preview">
            <p>{landingDraft}</p>
          </blockquote>
        ) : null}
        {!authReady ? (
          <p className="auth-notice auth-notice-error" role="status">
            Firebase is not configured yet. Copy <code>app/.env.example</code> to{' '}
            <code>app/.env</code>, add your Firebase web config, then restart{' '}
            <code>npm run dev</code>.
          </p>
        ) : null}

        {mode !== 'reset' ? (
          <>
            <div className="social-stack" role="group" aria-label="Social login">
              <button
                type="button"
                className="social-btn social-btn-google"
                onClick={onGoogle}
                disabled={busy || !authReady}
              >
                <GoogleIcon />
                {pending === 'google' ? 'Connecting…' : 'Continue with Google'}
              </button>
            </div>

            <div className="auth-divider" role="separator">
              <span>or</span>
            </div>
          </>
        ) : null}

        <form className="auth-form" onSubmit={onEmailSubmit}>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              disabled={busy || !authReady}
              required
            />
          </label>
          {mode !== 'reset' ? (
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                className="auth-input"
                type="password"
                name="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                disabled={busy || !authReady}
                required
                minLength={6}
              />
            </label>
          ) : null}
          {mode === 'signin' ? (
            <div className="auth-forgot-row">
              <button
                type="button"
                className="auth-forgot-btn"
                onClick={() => switchMode('reset')}
                disabled={busy}
              >
                Forgot password?
              </button>
            </div>
          ) : null}
          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={busy || !authReady}
          >
            {pending === 'email'
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Signing in…'
              : pending === 'reset'
                ? 'Sending link…'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Sign in with email'}
          </button>
        </form>

        {error ? (
          <p className="auth-notice auth-notice-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="auth-notice auth-notice-success" role="status">
            {notice}
          </p>
        ) : null}

        <p className="auth-switch">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={() => switchMode('signin')}
                disabled={busy}
              >
                Sign in
              </button>
            </>
          ) : mode === 'reset' ? (
            <>
              Remembered it?{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={() => switchMode('signin')}
                disabled={busy}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={() => switchMode('signup')}
                disabled={busy}
              >
                Create an account
              </button>
            </>
          )}
        </p>

        <p className="auth-footer">
          Private by design. Your thoughts stay yours.
          <br />
          <a href="https://journal42.cloud/privacy" rel="noreferrer">
            Privacy
          </a>
          {' · '}
          <a href="https://journal42.cloud/terms" rel="noreferrer">
            Terms
          </a>
        </p>
      </div>
    </div>
  )
}
