import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useJournalLock } from '../auth/useJournalLock'
import AuthLoading from '../auth/AuthLoading'
import {
  billingStatusLine,
  canUpgradePlan,
  hasPaidBillingAccess,
  planLabel,
  planPrice,
  PUBLIC_PAID_PLAN,
  upgradeLabel,
  useBilling,
} from '../lib/billing'
import { quotaLine, useAiUsage } from '../lib/aiUsage'
import { deleteAccount } from '../lib/accountApi'
import { openBillingPortal, startCheckout } from '../lib/billingApi'
import { useAppInstall } from '../lib/useAppInstall'
import { userFirstName, userInitials } from '../lib/userDisplay'
import SettingsMicrophoneSelect from '../components/SettingsMicrophoneSelect'
import { useSpeechLabSettings } from '../lib/speech/useSpeechLabSettings'

export default function Settings() {
  const {
    user,
    signOut,
    changePassword,
    sendPasswordReset,
    reauthenticateWithPassword,
    reauthenticateWithGoogle,
  } = useAuth()
  const { billing, ready: billingReady } = useBilling(user?.uid)
  const { usage } = useAiUsage(user?.uid)
  const install = useAppInstall()
  const {
    lockEnabled,
    setupLock,
    removeLock,
    changePasscode,
    lock,
  } = useJournalLock()

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
  const [showDeleteForm, setShowDeleteForm] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [lockBusy, setLockBusy] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const [lockNotice, setLockNotice] = useState<string | null>(null)
  const [showLockSetupForm, setShowLockSetupForm] = useState(false)
  const [showLockChangeForm, setShowLockChangeForm] = useState(false)
  const [showLockRemoveForm, setShowLockRemoveForm] = useState(false)
  const [newPasscode, setNewPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [nextPasscode, setNextPasscode] = useState('')
  const [confirmNextPasscode, setConfirmNextPasscode] = useState('')
  const [removePasscode, setRemovePasscode] = useState('')
  const [speechSettings, setSpeechSettings] = useSpeechLabSettings()

  useEffect(() => {
    document.title = 'Journal42 · Account'
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

  const account = user
  const email = account.email ?? null
  const displayName = account.displayName ?? null
  const photoURL = account.photoURL ?? null
  const firstName = userFirstName(displayName, email)
  const initials = userInitials(displayName, email)
  const showPhoto = Boolean(photoURL && !photoFailed)
  const canUpgrade = canUpgradePlan(billing.plan)
  const canOpenPortal = hasPaidBillingAccess(billing)
  const statusLine = billingStatusLine(billing)
  const hasPasswordProvider = account.providerData.some(
    (provider) => provider.providerId === 'password',
  )
  const showInstall = install.kind === 'prompt' || install.kind === 'ios-hint'
  const planName = planLabel(billing.plan)
  const price = planPrice(billing.plan)

  async function onUpgrade() {
    if (billingBusy) return
    setBillingBusy(true)
    setBillingError(null)
    try {
      await startCheckout(account, PUBLIC_PAID_PLAN)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Checkout failed.')
      setBillingBusy(false)
    }
  }

  async function onManageBilling() {
    if (billingBusy) return
    setBillingBusy(true)
    setBillingError(null)
    try {
      await openBillingPortal(account)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not open billing.')
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

  function resetLockForms() {
    setShowLockSetupForm(false)
    setShowLockChangeForm(false)
    setShowLockRemoveForm(false)
    setNewPasscode('')
    setConfirmPasscode('')
    setCurrentPasscode('')
    setNextPasscode('')
    setConfirmNextPasscode('')
    setRemovePasscode('')
    setLockError(null)
  }

  async function onSetupLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lockBusy) return
    if (newPasscode.length < 4) {
      setLockError('Passcode should be at least 4 characters.')
      return
    }
    if (newPasscode !== confirmPasscode) {
      setLockError('Passcodes do not match.')
      return
    }

    setLockBusy(true)
    setLockError(null)
    setLockNotice(null)
    try {
      await setupLock(newPasscode)
      setLockNotice('Journal lock enabled.')
      resetLockForms()
    } catch (error) {
      setLockError(
        error instanceof Error ? error.message : 'Could not enable journal lock.',
      )
    } finally {
      setLockBusy(false)
    }
  }

  async function onChangePasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lockBusy) return
    if (nextPasscode.length < 4) {
      setLockError('New passcode should be at least 4 characters.')
      return
    }
    if (nextPasscode !== confirmNextPasscode) {
      setLockError('New passcodes do not match.')
      return
    }

    setLockBusy(true)
    setLockError(null)
    setLockNotice(null)
    try {
      const result = await changePasscode(currentPasscode, nextPasscode)
      if (result === 'wrong-passcode') {
        setLockError('Current passcode is incorrect.')
        return
      }
      setLockNotice('Passcode updated.')
      resetLockForms()
    } catch (error) {
      setLockError(
        error instanceof Error ? error.message : 'Could not update passcode.',
      )
    } finally {
      setLockBusy(false)
    }
  }

  async function onRemoveLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lockBusy) return

    setLockBusy(true)
    setLockError(null)
    setLockNotice(null)
    try {
      const result = await removeLock(removePasscode)
      if (result === 'wrong-passcode') {
        setLockError('Passcode is incorrect.')
        return
      }
      setLockNotice('Journal lock removed.')
      resetLockForms()
    } catch (error) {
      setLockError(
        error instanceof Error ? error.message : 'Could not remove journal lock.',
      )
    } finally {
      setLockBusy(false)
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

  async function onDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (deleteBusy || signingOut) return

    const expected = (email ?? '').trim().toLowerCase()
    if (!expected) {
      setDeleteError('This account has no email on file. Contact hello@journal42.cloud.')
      return
    }
    if (deleteConfirmation.trim().toLowerCase() !== expected) {
      setDeleteError('Type your account email to confirm.')
      return
    }

    setDeleteBusy(true)
    setDeleteError(null)
    try {
      if (hasPasswordProvider) {
        if (!deletePassword) {
          setDeleteError('Enter your password to confirm.')
          setDeleteBusy(false)
          return
        }
        await reauthenticateWithPassword(deletePassword)
      } else {
        await reauthenticateWithGoogle()
      }
      await deleteAccount(account)
      await signOut()
      window.location.assign('https://journal42.cloud')
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : ''
      setDeleteError(
        code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/invalid-login-credentials'
          ? 'Password is incorrect.'
          : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
            ? 'Google confirmation was cancelled.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a moment and try again.'
              : error instanceof Error
                ? error.message
                : 'Could not delete account. Try again in a moment.',
      )
      setDeleteBusy(false)
    }
  }

  return (
    <div className="app-shell settings-shell">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>

      <header className="app-header">
        <Link className="app-logo" to="/" aria-label="Journal42 home">
          Journal<span>42</span>
        </Link>
        <Link className="settings-back" to="/">
          <span aria-hidden="true">←</span> Journal
        </Link>
      </header>

      <main className="app-main settings-main">
        {billingError ? (
          <p className="journal-sync-error" role="alert">
            {billingError}
          </p>
        ) : null}

        <div className="settings-page">
          <div className="settings-sheet">
            <header className="settings-identity">
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
              <div className="settings-identity-copy">
                <h1 className="settings-title">{firstName || 'Account'}</h1>
                {email ? <p className="settings-email">{email}</p> : null}
              </div>
            </header>

            <section className="settings-plan" aria-label="Plan">
              <div className="settings-plan-top">
                <p className="settings-eyebrow">Plan</p>
                <p className="settings-plan-price">{price}</p>
              </div>
              <p className="settings-plan-name">{planName}</p>
              {canUpgrade ? (
                <p className="settings-plan-meta">{quotaLine(billing.plan, usage)}</p>
              ) : statusLine ? (
                <p className="settings-plan-meta">{statusLine}</p>
              ) : null}

              {canUpgrade ? (
                <div className="settings-plan-cta">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void onUpgrade()}
                    disabled={billingBusy || signingOut}
                  >
                    {billingBusy ? 'Opening…' : upgradeLabel()}
                  </button>
                  <p className="settings-plan-note">
                    {planPrice(PUBLIC_PAID_PLAN)}. Cancel anytime.
                  </p>
                </div>
              ) : canOpenPortal ? (
                <button
                  type="button"
                  className="settings-inline-link"
                  onClick={() => void onManageBilling()}
                  disabled={billingBusy || signingOut}
                >
                  {billingBusy ? 'Opening…' : 'Manage billing'}
                </button>
              ) : null}
            </section>

            <nav className="settings-actions" aria-label="Account actions">
              <div className="settings-action">
                <div className="settings-action-row">
                  <div className="settings-action-copy">
                    <p className="settings-action-label">Journal lock</p>
                    <p className="settings-action-hint">
                      {lockEnabled
                        ? 'Passcode required to read entries'
                        : 'Encrypt entries behind a passcode'}
                    </p>
                  </div>
                  <div className="settings-action-links">
                    {lockEnabled ? (
                      <>
                        <button
                          type="button"
                          className="settings-inline-link"
                          onClick={() => {
                            resetLockForms()
                            setShowLockChangeForm((open) => !open)
                            setShowLockRemoveForm(false)
                          }}
                          disabled={lockBusy || signingOut}
                        >
                          {showLockChangeForm ? 'Cancel' : 'Change'}
                        </button>
                        <button
                          type="button"
                          className="settings-inline-link"
                          onClick={() => {
                            resetLockForms()
                            setShowLockRemoveForm((open) => !open)
                            setShowLockChangeForm(false)
                          }}
                          disabled={lockBusy || signingOut}
                        >
                          {showLockRemoveForm ? 'Cancel' : 'Remove'}
                        </button>
                        <button
                          type="button"
                          className="settings-inline-link"
                          onClick={() => lock()}
                          disabled={lockBusy || signingOut}
                        >
                          Lock now
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="settings-inline-link"
                        onClick={() => {
                          resetLockForms()
                          setShowLockSetupForm((open) => !open)
                        }}
                        disabled={lockBusy || signingOut}
                      >
                        {showLockSetupForm ? 'Cancel' : 'Enable'}
                      </button>
                    )}
                  </div>
                </div>

                {showLockSetupForm ? (
                  <form className="settings-form" onSubmit={onSetupLock}>
                    <label className="settings-field">
                      <span>Passcode</span>
                      <input
                        type="password"
                        name="journal-passcode"
                        autoComplete="new-password"
                        value={newPasscode}
                        onChange={(event) => setNewPasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Confirm</span>
                      <input
                        type="password"
                        name="journal-passcode-confirm"
                        autoComplete="new-password"
                        value={confirmPasscode}
                        onChange={(event) => setConfirmPasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={lockBusy || signingOut}
                    >
                      {lockBusy ? 'Saving…' : 'Enable lock'}
                    </button>
                  </form>
                ) : null}

                {showLockChangeForm ? (
                  <form className="settings-form" onSubmit={onChangePasscode}>
                    <label className="settings-field">
                      <span>Current</span>
                      <input
                        type="password"
                        name="journal-passcode-current"
                        autoComplete="current-password"
                        value={currentPasscode}
                        onChange={(event) => setCurrentPasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <label className="settings-field">
                      <span>New</span>
                      <input
                        type="password"
                        name="journal-passcode-new"
                        autoComplete="new-password"
                        value={nextPasscode}
                        onChange={(event) => setNextPasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Confirm</span>
                      <input
                        type="password"
                        name="journal-passcode-new-confirm"
                        autoComplete="new-password"
                        value={confirmNextPasscode}
                        onChange={(event) => setConfirmNextPasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={lockBusy || signingOut}
                    >
                      {lockBusy ? 'Updating…' : 'Update passcode'}
                    </button>
                  </form>
                ) : null}

                {showLockRemoveForm ? (
                  <form className="settings-form" onSubmit={onRemoveLock}>
                    <label className="settings-field">
                      <span>Passcode</span>
                      <input
                        type="password"
                        name="journal-passcode-remove"
                        autoComplete="current-password"
                        value={removePasscode}
                        onChange={(event) => setRemovePasscode(event.target.value)}
                        disabled={lockBusy || signingOut}
                        required
                        minLength={4}
                      />
                    </label>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={lockBusy || signingOut}
                    >
                      {lockBusy ? 'Removing…' : 'Remove lock'}
                    </button>
                  </form>
                ) : null}

                {lockNotice ? (
                  <p className="settings-flash" role="status">
                    {lockNotice}
                  </p>
                ) : null}
                {lockError ? (
                  <p className="settings-flash is-error" role="alert">
                    {lockError}
                  </p>
                ) : null}
              </div>

              <div className="settings-action">
                <div className="settings-action-row">
                  <div className="settings-action-copy">
                    <p className="settings-action-label">Microphone</p>
                    <p className="settings-action-hint">
                      Used for voice journaling
                    </p>
                  </div>
                  <SettingsMicrophoneSelect
                    value={speechSettings.shared.deviceId}
                    onChange={(deviceId) =>
                      setSpeechSettings({
                        ...speechSettings,
                        shared: { ...speechSettings.shared, deviceId },
                      })
                    }
                    disabled={signingOut}
                  />
                </div>
              </div>

              {hasPasswordProvider ? (
                <div className="settings-action">
                  <div className="settings-action-row">
                    <div className="settings-action-copy">
                      <p className="settings-action-label">Password</p>
                      <p className="settings-action-hint">Email sign-in</p>
                    </div>
                    <div className="settings-action-links">
                      <button
                        type="button"
                        className="settings-inline-link"
                        onClick={() => {
                          setShowPasswordForm((open) => !open)
                          setPasswordError(null)
                          setPasswordNotice(null)
                        }}
                        disabled={passwordBusy || resetBusy || signingOut}
                      >
                        {showPasswordForm ? 'Cancel' : 'Change'}
                      </button>
                      <button
                        type="button"
                        className="settings-inline-link"
                        onClick={() => void onSendPasswordReset()}
                        disabled={resetBusy || passwordBusy || signingOut || !email}
                      >
                        {resetBusy ? 'Sending…' : 'Reset'}
                      </button>
                    </div>
                  </div>

                  {showPasswordForm ? (
                    <form className="settings-form" onSubmit={onChangePassword}>
                      <label className="settings-field">
                        <span>Current</span>
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
                      <label className="settings-field">
                        <span>New</span>
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
                      <label className="settings-field">
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
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={passwordBusy || signingOut}
                      >
                        {passwordBusy ? 'Updating…' : 'Update password'}
                      </button>
                    </form>
                  ) : null}

                  {passwordNotice ? (
                    <p className="settings-flash" role="status">
                      {passwordNotice}
                    </p>
                  ) : null}
                  {passwordError ? (
                    <p className="settings-flash is-error" role="alert">
                      {passwordError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showInstall ? (
                <div className="settings-action">
                  <div className="settings-action-row">
                    <div className="settings-action-copy">
                      <p className="settings-action-label">Install</p>
                      <p className="settings-action-hint">
                        {install.kind === 'ios-hint'
                          ? 'Share → Add to Home Screen'
                          : 'Keep it on your home screen'}
                      </p>
                    </div>
                    {install.kind === 'prompt' ? (
                      <button
                        type="button"
                        className="settings-inline-link"
                        onClick={() => void install.install()}
                        disabled={install.busy || signingOut}
                      >
                        {install.busy ? 'Installing…' : 'Install'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="settings-menu-btn"
                onClick={() => void onSignOut()}
                disabled={signingOut || deleteBusy}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </nav>
          </div>

          {showDeleteForm ? (
            <form className="settings-delete-panel" onSubmit={onDeleteAccount}>
              <p className="settings-delete-lead">
                This removes your journal and sign-in
                {canOpenPortal ? ', and cancels billing' : ''}. Permanent.
              </p>
              <label className="settings-field">
                <span>Type your email</span>
                <input
                  type="email"
                  name="delete-confirmation"
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  disabled={deleteBusy || signingOut}
                  required
                  placeholder={email ?? 'you@example.com'}
                />
              </label>
              {hasPasswordProvider ? (
                <label className="settings-field">
                  <span>Password</span>
                  <input
                    type="password"
                    name="delete-password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    disabled={deleteBusy || signingOut}
                    required
                  />
                </label>
              ) : (
                <p className="settings-plan-meta">You&apos;ll confirm with Google next.</p>
              )}
              {deleteError ? (
                <p className="settings-flash is-error" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <div className="settings-form-actions">
                <button
                  type="button"
                  className="settings-inline-link"
                  onClick={() => {
                    setShowDeleteForm(false)
                    setDeleteConfirmation('')
                    setDeletePassword('')
                    setDeleteError(null)
                  }}
                  disabled={deleteBusy}
                >
                  Keep account
                </button>
                <button
                  type="submit"
                  className="settings-danger-btn"
                  disabled={deleteBusy || signingOut}
                >
                  {deleteBusy
                    ? hasPasswordProvider
                      ? 'Deleting…'
                      : 'Confirm with Google…'
                    : 'Delete forever'}
                </button>
              </div>
            </form>
          ) : null}

          <p className="settings-footer">
            <button
              type="button"
              className="settings-footer-delete"
              onClick={() => {
                setShowDeleteForm(true)
                setDeleteError(null)
              }}
              disabled={deleteBusy || signingOut || showDeleteForm}
            >
              Delete account
            </button>
            <span aria-hidden="true">·</span>
            <a href="https://journal42.cloud/privacy" rel="noreferrer">
              Privacy
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://journal42.cloud/terms" rel="noreferrer">
              Terms
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://journal42.cloud/contact" rel="noreferrer">
              Contact
            </a>
            <span aria-hidden="true">·</span>
            <Link to="/voice-lab">Voice input lab</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
