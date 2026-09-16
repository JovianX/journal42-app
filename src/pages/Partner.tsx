import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import AuthLoading from '../auth/AuthLoading'
import {
  applyToPartnerProgram,
  checkPartnerCode,
  formatPartnerMoney,
  getPartnerMe,
  partnerShareUrl,
  setCustomPartnerCode,
  type PartnerCodeCheck,
  type PartnerMe,
} from '../lib/partnerApi'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="partner-copy-row">
      <div className="partner-copy-copy">
        <p className="partner-copy-label">{label}</p>
        <code className="partner-copy-value">{value}</code>
      </div>
      <button type="button" className="partner-copy-btn" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function statusTone(status: PartnerCodeCheck['status']) {
  switch (status) {
    case 'available':
    case 'yours':
      return 'is-ok'
    case 'taken':
    case 'reserved':
    case 'invalid':
      return 'is-bad'
    default:
      return ''
  }
}

export default function Partner() {
  const { user } = useAuth()
  const noteId = useId()
  const wordId = useId()
  const [me, setMe] = useState<PartnerMe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [check, setCheck] = useState<PartnerCodeCheck | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    document.title = 'Journal42 · Partners'
    return () => {
      document.title = 'Journal42'
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    setError(null)
    getPartnerMe(user)
      .then((next) => {
        if (!active) return
        setMe(next)
        setCustomCode(next.customCode ?? '')
        setNote(next.note ?? '')
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Could not load partners.')
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user || !me) return
    if (me.status !== 'pending' && me.status !== 'approved') return

    const typed = customCode.trim().toLowerCase()
    if (!typed) {
      setCheck(null)
      setChecking(false)
      return
    }

    let active = true
    setChecking(true)
    const timer = window.setTimeout(() => {
      void checkPartnerCode(user, typed)
        .then((next) => {
          if (!active) return
          setCheck(next)
          setChecking(false)
        })
        .catch(() => {
          if (!active) return
          setCheck({
            code: typed,
            status: 'invalid',
            message: 'Could not check that word. Try again.',
          })
          setChecking(false)
        })
    }, 280)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [customCode, me, user])

  if (!user || !me) {
    if (error) {
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
            <Link className="settings-back" to="/settings">
              <span aria-hidden="true">←</span> Account
            </Link>
          </header>
          <main className="app-main settings-main">
            <p className="journal-sync-error" role="alert">
              {error}
            </p>
          </main>
        </div>
      )
    }
    return <AuthLoading />
  }

  const shareCode = me.customCode || me.autoCode || ''
  const homeLink = shareCode ? partnerShareUrl(me.siteOrigin, '/', shareCode) : ''
  const pageLink = shareCode
    ? partnerShareUrl(me.siteOrigin, me.sharePath, shareCode)
    : ''
  const canEditWord = me.status === 'pending' || me.status === 'approved'
  const typedWord = customCode.trim().toLowerCase()
  const alreadySaved =
    Boolean(me.customCode) && typedWord === (me.customCode ?? '')
  const wordReady =
    !checking &&
    (check?.status === 'available' ||
      (check?.status === 'yours' && !alreadySaved))
  const liveCode = typedWord || me.customCode || me.autoCode || 'maya'
  const liveLink = partnerShareUrl(me.siteOrigin, '/', liveCode)
  const wordFeedback = (() => {
    if (!typedWord) {
      return {
        tone: '',
        message: 'Type a word. Save unlocks when it is free.',
      }
    }
    if (checking) {
      return { tone: '', message: 'Checking…' }
    }
    if (alreadySaved) {
      return { tone: 'is-ok', message: 'This is your word.' }
    }
    if (check) {
      return { tone: statusTone(check.status), message: check.message }
    }
    return {
      tone: '',
      message: 'Letters, numbers, hyphen. 2 to 32 characters.',
    }
  })()

  async function onApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !me || busy) return
    const wasAdmin = me.isAdmin
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await applyToPartnerProgram(user, note)
      setMe({ ...next, isAdmin: wasAdmin })
      setCustomCode(next.customCode ?? '')
      setNotice('Application sent. You can already copy your link and claim a word.')
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not apply.')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !me || busy) return
    const wasAdmin = me.isAdmin
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await setCustomPartnerCode(user, customCode)
      setMe({ ...next, isAdmin: wasAdmin })
      setCustomCode(next.customCode ?? '')
      setNotice(`Your link is now ?a=${next.customCode}`)
      setCheck({
        code: next.customCode ?? '',
        status: 'yours',
        message: 'This is already your link.',
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that word.')
    } finally {
      setBusy(false)
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
        <div className="partner-header-actions">
          {me.isAdmin ? (
            <Link className="settings-back" to="/partner/review">
              Review
            </Link>
          ) : null}
          <Link className="settings-back" to="/settings">
            <span aria-hidden="true">←</span> Account
          </Link>
        </div>
      </header>

      <main className="app-main settings-main">
        {error ? (
          <p className="journal-sync-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="settings-page partner-page">
          <div className="partner-stage">
            <header className="partner-hero">
              <p className="settings-eyebrow">Partners</p>
              <h1 className="partner-title">Share a quiet hour.</h1>
              <p className="partner-lead">
                Credit sticks after signup. Paid credit starts when we approve
                you.
              </p>
              <div className="partner-offer-row" aria-label="Offer">
                <div className="partner-offer-chip">
                  <span>Year one</span>
                  <strong>50%</strong>
                </div>
                <div className="partner-offer-chip">
                  <span>After</span>
                  <strong>30%</strong>
                </div>
                <div className="partner-offer-chip">
                  <span>Of</span>
                  <strong>$9/mo</strong>
                </div>
              </div>
            </header>

            {notice ? (
              <p className="partner-notice" role="status">
                {notice}
              </p>
            ) : null}

            {me.status === 'none' ? (
              <form className="partner-panel partner-panel-focus" onSubmit={onApply}>
                <p className="partner-panel-title">Apply</p>
                <p className="partner-panel-body">
                  Tell us where you write, and who you write for. We review by
                  hand.
                </p>
                <label className="settings-field" htmlFor={noteId}>
                  <span>A short note</span>
                  <textarea
                    id={noteId}
                    className="partner-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Newsletter, blog, or audience. Optional."
                    rows={4}
                    maxLength={500}
                    disabled={busy}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Apply'}
                </button>
              </form>
            ) : null}

            {me.status === 'pending' ? (
              <section className="partner-status-banner" aria-live="polite">
                <p className="partner-status-pill">In review</p>
                <p className="partner-status-copy">
                  Your automatic link already tracks clicks and signups. Paid
                  credit starts after approval. Claim a custom word below.
                </p>
              </section>
            ) : null}

            {me.status === 'approved' ? (
              <section className="partner-status-banner is-live" aria-live="polite">
                <p className="partner-status-pill is-live">Live</p>
                <p className="partner-status-copy">
                  Share your link. Clicks, signups, and Pattern purchases show
                  below. Payouts go through Lemon.
                </p>
              </section>
            ) : null}

            {me.status === 'rejected' ? (
              <section className="partner-status-banner is-bad" aria-live="polite">
                <p className="partner-status-pill is-bad">Not approved</p>
                <p className="partner-status-copy">
                  Email hello@journal42.cloud if this looks wrong.
                </p>
              </section>
            ) : null}

            {canEditWord ? (
              <>
                <form className="partner-panel partner-panel-focus" onSubmit={onSaveWord}>
                  <div className="partner-panel-head">
                    <p className="partner-panel-title">Your word</p>
                    <p className="partner-panel-body">
                      Claim a short link. We check if the word is free as you
                      type.
                    </p>
                  </div>

                  <div className="partner-live-link" aria-live="polite">
                    <span className="partner-live-label">Link</span>
                    <code className={`partner-live-url${typedWord ? ' is-typed' : ''}`}>
                      {liveLink}
                    </code>
                  </div>

                  <label className="settings-field" htmlFor={wordId}>
                    <span>Custom word</span>
                    <div
                      className={`partner-word-row${
                        wordFeedback.tone === 'is-ok'
                          ? ' is-ok'
                          : wordFeedback.tone === 'is-bad'
                            ? ' is-bad'
                            : ''
                      }`}
                    >
                      <span className="partner-word-prefix" aria-hidden="true">
                        ?a=
                      </span>
                      <input
                        id={wordId}
                        value={customCode}
                        onChange={(event) =>
                          setCustomCode(
                            event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, ''),
                          )
                        }
                        placeholder="maya"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={busy}
                        minLength={2}
                        maxLength={32}
                        required
                      />
                    </div>
                  </label>

                  <p
                    className={`partner-word-feedback ${wordFeedback.tone}`}
                    role="status"
                  >
                    {wordFeedback.message}
                  </p>

                  <button
                    type="submit"
                    className={`btn-primary${wordReady ? ' is-ready' : ''}`}
                    disabled={busy || !wordReady}
                  >
                    {busy
                      ? 'Saving…'
                      : alreadySaved
                        ? 'Saved'
                        : checking
                          ? 'Checking…'
                          : 'Save word'}
                  </button>
                </form>

                <section className="partner-panel partner-panel-quiet">
                  <p className="partner-panel-title">Ready to share</p>
                  {homeLink ? <CopyRow label="Home" value={homeLink} /> : null}
                  {pageLink ? (
                    <CopyRow label="Anxiety page" value={pageLink} />
                  ) : null}
                  {me.autoCode ? (
                    <p className="partner-panel-hint">
                      Automatic code <code>?a={me.autoCode}</code> always works,
                      even after you pick a word.
                    </p>
                  ) : null}
                  {me.lemonSignupUrl && me.status === 'pending' ? (
                    <p className="partner-panel-hint">
                      <a href={me.lemonSignupUrl} rel="noreferrer">
                        Set up payouts in Lemon
                      </a>
                    </p>
                  ) : null}
                </section>
              </>
            ) : null}

            {me.status === 'pending' || me.status === 'approved' ? (
              <section className="partner-panel" aria-label="Partner totals">
                <p className="partner-panel-title">Totals</p>
                <div className="partner-stats">
                  <div>
                    <p className="settings-eyebrow">Clicks</p>
                    <p className="partner-stat-value">{me.clickCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="settings-eyebrow">Signups</p>
                    <p className="partner-stat-value">{me.signupCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="settings-eyebrow">Purchases</p>
                    <p className="partner-stat-value">{me.paidCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="settings-eyebrow">Estimated</p>
                    <p className="partner-stat-value">
                      {formatPartnerMoney(me.earningsCents ?? 0)}
                    </p>
                  </div>
                </div>
                {(me.voidedCents ?? 0) > 0 ? (
                  <p className="partner-panel-hint">
                    Voided on refund: {formatPartnerMoney(me.voidedCents ?? 0)}
                  </p>
                ) : null}
                <p className="partner-panel-hint">
                  Unique link opens, new accounts, and Pattern buyers. No names
                  or writing.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}
