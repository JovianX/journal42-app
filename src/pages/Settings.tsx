import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import AuthLoading from '../auth/AuthLoading'
import {
  billingStatusLine,
  hasPaidBillingAccess,
  planBlurb,
  planLabel,
  planPrice,
  upgradeLabel,
  useBilling,
  type BillingStatus,
  type PaidPlanId,
  type PlanId,
} from '../lib/billing'
import { openBillingPortal, startCheckout } from '../lib/billingApi'
import { useAppInstall } from '../lib/useAppInstall'
import { userInitials, userLabel } from '../lib/userDisplay'

function statusTone(status: BillingStatus, plan: PlanId) {
  if (status === 'past_due') return 'is-warn'
  if (status === 'cancelled' || status === 'expired') return 'is-muted'
  if (plan !== 'clear-head' && status === 'active') return 'is-ok'
  return 'is-muted'
}

function statusBadgeLabel(status: BillingStatus, plan: PlanId) {
  if (plan === 'clear-head' && (status === 'none' || status === 'expired')) {
    return 'Free'
  }
  switch (status) {
    case 'active':
      return 'Active'
    case 'past_due':
      return 'Past due'
    case 'cancelled':
      return 'Cancelling'
    case 'expired':
      return 'Expired'
    default:
      return 'Free'
  }
}

export default function Settings() {
  const { user, signOut, changePassword, sendPasswordReset } = useAuth()
  const { billing, ready: billingReady } = useBilling(user?.uid)
  const install = useAppInstall()
  const [photoFailed, setPhotoFailed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    document.title = 'Journal42: Settings'
    return () => {
      document.title = 'Journal42'
    }
  }, [])

  useEffect(() => {
    setPhotoFailed(false)
  }, [user?.photoURL])

  if (!user || !billingReady) {
    return <AuthLoading />
  }

  const signedInUser = user
  const displayName = signedInUser.displayName ?? null
  const email = signedInUser.email ?? null
  const photoURL = signedInUser.photoURL ?? null
  const fullLabel = userLabel(displayName, email)
  const initials = userInitials(displayName, email)
  const showPhoto = Boolean(photoURL && !photoFailed)
  const canUpgrade = billing.plan !== 'forever'
  const canOpenLemonPortal = hasPaidBillingAccess(billing)
  const upgradePlan: PaidPlanId = billing.plan === 'pattern' ? 'forever' : 'pattern'
  const statusLine = billingStatusLine(billing)
  const badge = statusBadgeLabel(billing.status, billing.plan)
  const tone = statusTone(billing.status, billing.plan)
  const hasPasswordProvider = signedInUser.providerData.some(
    (provider) => provider.providerId === 'password',
  )
  const signInMethod = hasPasswordProvider ? 'Email & password' : 'Google'

  async function onUpgrade() {
    if (billingBusy) return
    setBillingBusy(true)
    setBillingError(null)
    try {
      await startCheckout(signedInUser, upgradePlan)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Checkout failed.')
      setBillingBusy(false)
    }
  }

  async function onUpdatePayment() {
    if (billingBusy) return
    setBillingBusy(true)
    setBillingError(null)
    try {
      await openBillingPortal(signedInUser)
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : 'Could not open payment settings.',
      )
      setBillingBusy(false)
    }
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

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (passwordBusy) return

    if (nextPassword.length < 6) {
      setPasswordError('New password should be at least 6 characters.')
      return
    }
    if (nextPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setPasswordBusy(true)
    setPasswordError(null)
    setPasswordNotice(null)
    try {
      await changePassword(currentPassword, nextPassword)
      setPasswordNotice('Password updated.')
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : ''
      setPasswordError(
        code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/invalid-login-credentials'
          ? 'Current password is incorrect.'
          : code === 'auth/weak-password'
            ? 'New password should be at least 6 characters.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a moment and try again.'
              : code === 'auth/requires-recent-login'
                ? 'For security, sign out and sign back in, then try again.'
                : 'Could not update password. Try again in a moment.',
      )
    } finally {
      setPasswordBusy(false)
    }
  }

  async function onSendPasswordReset() {
    if (!email || resetBusy) return
    setResetBusy(true)
    setPasswordError(null)
    setPasswordNotice(null)
    try {
      await sendPasswordReset(email)
      setPasswordNotice('Reset link sent. Check your inbox.')
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : 'Could not send a reset email. Try again in a moment.',
      )
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="app-shell settings-shell">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>

      <header className="app-header settings-header">
        <Link className="app-logo" to="/" aria-label="Journal42 home">
          Journal<span>42</span>
        </Link>
        <Link className="settings-back" to="/">
          <span aria-hidden="true">←</span> Journal
        </Link>
      </header>

      <main className="app-main settings-main">
        {billingError ? (
          <p className="journal-sync-error settings-alert" role="alert">
            {billingError}
          </p>
        ) : null}

        <div className="settings-page" aria-label="Settings">
          <header className="settings-hero">
            <div className="settings-hero-row">
              <span className="settings-avatar" aria-hidden="true">
                {showPhoto ? (
                  <img
                    className="settings-avatar-photo"
                    src={photoURL!}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  initials
                )}
              </span>
              <div>
                <h1 className="settings-title">Account</h1>
                <p className="settings-lead">{fullLabel}</p>
              </div>
            </div>
          </header>

          <div className="settings-surface">
            <section className="settings-section" aria-labelledby="settings-profile-heading">
              <h2 className="settings-section-title" id="settings-profile-heading">
                Profile
              </h2>

              <div className="settings-list">
                <div className="settings-item">
                  <div className="settings-item-copy">
                    <p className="settings-item-label">Display name</p>
                    <p
                      className={`settings-item-value${displayName?.trim() ? '' : ' is-empty'}`}
                    >
                      {displayName?.trim() || 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="settings-item">
                  <div className="settings-item-copy">
                    <p className="settings-item-label">Email</p>
                    <p className="settings-item-value">{email || 'Not set'}</p>
                  </div>
                </div>

                <div className="settings-item">
                  <div className="settings-item-copy">
                    <p className="settings-item-label">Sign-in</p>
                    <p className="settings-item-value">{signInMethod}</p>
                  </div>
                </div>

                <div className="settings-item">
                  <div className="settings-item-copy">
                    <p className="settings-item-label">Password</p>
                    <p className="settings-item-value">
                      {hasPasswordProvider
                        ? 'Set for this account'
                        : 'Not used with Google sign-in'}
                    </p>
                  </div>
                  {hasPasswordProvider ? (
                    <div className="settings-item-actions">
                      <button
                        type="button"
                        className="settings-link-btn"
                        onClick={() => void onSendPasswordReset()}
                        disabled={resetBusy || passwordBusy || signingOut || !email}
                      >
                        {resetBusy ? 'Sending…' : 'Reset'}
                      </button>
                      <button
                        type="button"
                        className="settings-link-btn"
                        onClick={() => {
                          setShowPasswordForm((open) => !open)
                          setPasswordError(null)
                          setPasswordNotice(null)
                        }}
                        disabled={passwordBusy || resetBusy || signingOut}
                      >
                        {showPasswordForm ? 'Cancel' : 'Change'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {hasPasswordProvider && showPasswordForm ? (
                <form className="settings-password-form" onSubmit={onChangePassword}>
                  <label className="settings-password-field">
                    <span>Current password</span>
                    <input
                      type="password"
                      name="current-password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      disabled={passwordBusy || signingOut}
                      required
                    />
                  </label>
                  <div className="settings-password-grid">
                    <label className="settings-password-field">
                      <span>New password</span>
                      <input
                        type="password"
                        name="new-password"
                        autoComplete="new-password"
                        value={nextPassword}
                        onChange={(event) => setNextPassword(event.target.value)}
                        disabled={passwordBusy || signingOut}
                        required
                        minLength={6}
                      />
                    </label>
                    <label className="settings-password-field">
                      <span>Confirm</span>
                      <input
                        type="password"
                        name="confirm-password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={passwordBusy || signingOut}
                        required
                        minLength={6}
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="btn-primary settings-btn"
                    disabled={passwordBusy || signingOut}
                  >
                    {passwordBusy ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              ) : null}

              {passwordNotice ? (
                <p className="settings-inline-notice" role="status">
                  {passwordNotice}
                </p>
              ) : null}
              {passwordError ? (
                <p className="settings-inline-notice is-error" role="alert">
                  {passwordError}
                </p>
              ) : null}
            </section>

            <section className="settings-section" aria-labelledby="settings-plan-heading">
              <h2 className="settings-section-title" id="settings-plan-heading">
                Plan &amp; billing
              </h2>

              <div className="settings-plan">
                <div className="settings-plan-top">
                  <div>
                    <div className="settings-plan-meta">
                      <h3 className="settings-plan-name">{planLabel(billing.plan)}</h3>
                      <span className={`settings-badge ${tone}`}>{badge}</span>
                    </div>
                    <p className="settings-plan-line">
                      <span>{planPrice(billing.plan)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{statusLine}</span>
                    </p>
                    <p className="settings-plan-blurb">{planBlurb(billing.plan)}</p>
                  </div>
                </div>

                <div className="settings-plan-actions">
                  {canUpgrade ? (
                    <button
                      type="button"
                      className="btn-primary settings-btn"
                      onClick={() => void onUpgrade()}
                      disabled={billingBusy || signingOut}
                    >
                      {billingBusy ? 'Opening checkout…' : upgradeLabel(billing.plan)}
                    </button>
                  ) : (
                    <p className="settings-plan-note">You are on the deepest plan.</p>
                  )}
                  {canOpenLemonPortal ? (
                    <button
                      type="button"
                      className="btn-ghost settings-btn"
                      onClick={() => void onUpdatePayment()}
                      disabled={billingBusy || signingOut}
                    >
                      {billingBusy ? 'Opening…' : 'Update payment method'}
                    </button>
                  ) : null}
                </div>
                <p className="settings-plan-footnote">
                  Payment methods are managed in Lemon Squeezy.
                </p>
              </div>
            </section>

            <section className="settings-section" aria-labelledby="settings-install-heading">
              <h2 className="settings-section-title" id="settings-install-heading">
                Install
              </h2>

              <div className="settings-item settings-item-session">
                <div className="settings-item-copy">
                  <p className="settings-item-label">App</p>
                  <p className="settings-item-value">
                    {install.kind === 'installed'
                      ? 'Installed on this device'
                      : install.kind === 'ios-hint'
                        ? 'On iPhone or iPad: Share → Add to Home Screen'
                        : install.kind === 'prompt'
                          ? 'Add Journal42 to your home screen or dock'
                          : 'Use your browser’s install or “Add to Home Screen” option'}
                  </p>
                </div>
                {install.kind === 'prompt' ? (
                  <button
                    type="button"
                    className="btn-primary settings-btn settings-install-btn"
                    onClick={() => void install.install()}
                    disabled={install.busy || signingOut}
                  >
                    {install.busy ? 'Installing…' : 'Install app'}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="settings-section settings-section-session">
              <div className="settings-item settings-item-session">
                <div className="settings-item-copy">
                  <p className="settings-item-label" id="settings-session-heading">
                    Session
                  </p>
                  <p className="settings-item-value">Sign out on this device</p>
                </div>
                <button
                  type="button"
                  className="settings-signout"
                  onClick={() => void onSignOut()}
                  disabled={signingOut}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
