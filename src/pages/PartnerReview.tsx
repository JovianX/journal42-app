import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import AuthLoading from '../auth/AuthLoading'
import {
  adminApprovePartner,
  adminRejectPartner,
  formatPartnerDate,
  formatPartnerMoney,
  getPartnerMe,
  listPartnerApplications,
  type PartnerApplication,
} from '../lib/partnerApi'

function applicantPrimary(row: PartnerApplication) {
  if (row.email?.trim()) return row.email.trim()
  if (row.displayName?.trim()) return row.displayName.trim()
  return `Applicant ${row.uid.slice(0, 8)}`
}

function applicantSecondary(row: PartnerApplication) {
  const email = row.email?.trim()
  const name = row.displayName?.trim()
  if (email && name && name.toLowerCase() !== email.toLowerCase()) return name
  if (!email && !name) return 'No email on file'
  return null
}

export default function PartnerReview() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PartnerApplication[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [lemonIds, setLemonIds] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')

  useEffect(() => {
    document.title = 'Journal42 · Partner review'
    return () => {
      document.title = 'Journal42'
    }
  }, [])

  async function reload() {
    if (!user) return
    const me = await getPartnerMe(user)
    if (!me.isAdmin) {
      setError('Partner review is only available to admins.')
      setRows([])
      return
    }
    const applications = await listPartnerApplications(user)
    setRows(applications)
    setLemonIds((current) => {
      const next = { ...current }
      for (const row of applications) {
        if (row.lemonId && !next[row.uid]) next[row.uid] = row.lemonId
      }
      return next
    })
  }

  useEffect(() => {
    if (!user) return
    let active = true
    setError(null)
    reload()
      .catch((loadError: unknown) => {
        if (!active) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load applications.',
        )
        setRows([])
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!user || rows === null) {
    return error ? (
      <div className="app-shell settings-shell">
        <main className="app-main settings-main">
          <p className="journal-sync-error" role="alert">
            {error}
          </p>
        </main>
      </div>
    ) : (
      <AuthLoading />
    )
  }

  if (error === 'Partner review is only available to admins.') {
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
            <Link className="settings-back" to="/partner">
              Partners
            </Link>
            <Link className="settings-back" to="/settings">
              <span aria-hidden="true">←</span> Account
            </Link>
          </div>
        </header>
        <main className="app-main settings-main">
          <div className="settings-page partner-page">
            <div className="partner-stage">
              <header className="partner-hero">
                <p className="settings-eyebrow">Review</p>
                <h1 className="partner-title">Partner applications</h1>
                <p className="partner-lead">
                  This queue is only available to Journal42 admins.
                </p>
              </header>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const pendingCount = rows.filter((row) => row.status === 'pending').length
  const visible =
    filter === 'pending' ? rows.filter((row) => row.status === 'pending') : rows

  async function onApprove(uid: string) {
    if (!user || busyUid) return
    const lemonId = (lemonIds[uid] ?? '').trim()
    if (!lemonId) {
      setError('Enter the Lemon affiliate id before approving.')
      return
    }
    setBusyUid(uid)
    setError(null)
    try {
      await adminApprovePartner(user, uid, lemonId)
      await reload()
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : 'Could not approve.',
      )
    } finally {
      setBusyUid(null)
    }
  }

  async function onReject(uid: string) {
    if (!user || busyUid) return
    setBusyUid(uid)
    setError(null)
    try {
      await adminRejectPartner(user, uid)
      await reload()
    } catch (rejectError) {
      setError(
        rejectError instanceof Error
          ? rejectError.message
          : 'Could not reject.',
      )
    } finally {
      setBusyUid(null)
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
          <Link className="settings-back" to="/partner">
            Partners
          </Link>
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

        <div className="settings-page partner-page partner-page-wide">
          <div className="partner-stage">
            <header className="partner-hero">
              <p className="settings-eyebrow">Review</p>
              <h1 className="partner-title">Partner applications</h1>
              <p className="partner-lead">
                Approve with the Lemon affiliate id. Reject if the fit is wrong.
              </p>
            </header>

            <div className="partner-filter" role="tablist" aria-label="Filter">
              <button
                type="button"
                className={`partner-filter-btn${filter === 'pending' ? ' is-active' : ''}`}
                onClick={() => setFilter('pending')}
              >
                Pending{pendingCount > 0 ? ` · ${pendingCount}` : ''}
              </button>
              <button
                type="button"
                className={`partner-filter-btn${filter === 'all' ? ' is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All · {rows.length}
              </button>
            </div>

            {visible.length === 0 ? (
              <section className="partner-panel partner-panel-quiet">
                <p className="partner-panel-body">
                  {filter === 'pending'
                    ? 'No applications waiting.'
                    : 'No applications yet.'}
                </p>
              </section>
            ) : (
              visible.map((row) => {
                const lemonValue = lemonIds[row.uid] ?? ''
                const canApprove = lemonValue.trim().length > 0
                const secondary = applicantSecondary(row)
                const shareCode = row.customCode || row.autoCode
                return (
                  <article key={row.uid} className="partner-review-card">
                    <div className="partner-review-top">
                      <div>
                        <p className="partner-review-name">{applicantPrimary(row)}</p>
                        {secondary ? (
                          <p className="partner-review-email">{secondary}</p>
                        ) : null}
                      </div>
                      <p
                        className={`partner-status-pill${
                          row.status === 'approved'
                            ? ' is-live'
                            : row.status === 'rejected'
                              ? ' is-bad'
                              : ''
                        }`}
                      >
                        {row.status}
                      </p>
                    </div>

                    <div className="partner-review-meta">
                      <span>Applied {formatPartnerDate(row.appliedAt)}</span>
                      {shareCode ? (
                        <code className="partner-review-code">?a={shareCode}</code>
                      ) : null}
                      {row.customCode && row.autoCode ? (
                        <span className="partner-review-auto">auto {row.autoCode}</span>
                      ) : null}
                    </div>

                    {row.note ? (
                      <blockquote className="partner-review-note">{row.note}</blockquote>
                    ) : (
                      <p className="partner-panel-hint">No note from the applicant.</p>
                    )}

                    <div className="partner-review-stats" aria-label="Totals">
                      <div>
                        <p className="settings-eyebrow">Clicks</p>
                        <p className="partner-stat-value">{row.clickCount}</p>
                      </div>
                      <div>
                        <p className="settings-eyebrow">Signups</p>
                        <p className="partner-stat-value">{row.signupCount}</p>
                      </div>
                      <div>
                        <p className="settings-eyebrow">Purchases</p>
                        <p className="partner-stat-value">{row.paidCount}</p>
                      </div>
                      <div>
                        <p className="settings-eyebrow">Estimated</p>
                        <p className="partner-stat-value">
                          {formatPartnerMoney(row.earningsCents)}
                        </p>
                      </div>
                    </div>

                    {row.status === 'pending' || row.status === 'approved' ? (
                      <div className="partner-review-actions">
                        <label className="settings-field">
                          <span>Lemon affiliate id</span>
                          <input
                            value={lemonValue}
                            onChange={(event) =>
                              setLemonIds((current) => ({
                                ...current,
                                [row.uid]: event.target.value.replace(/\D/g, ''),
                              }))
                            }
                            placeholder="Paste Lemon id"
                            inputMode="numeric"
                            disabled={busyUid === row.uid}
                            autoComplete="off"
                          />
                        </label>
                        <div className="partner-review-buttons">
                          <button
                            type="button"
                            className={`btn-primary${canApprove ? ' is-ready' : ''}`}
                            disabled={busyUid === row.uid || !canApprove}
                            onClick={() => void onApprove(row.uid)}
                          >
                            {busyUid === row.uid ? 'Saving…' : 'Approve'}
                          </button>
                          {row.status === 'pending' ? (
                            <button
                              type="button"
                              className="partner-reject-btn"
                              disabled={busyUid === row.uid}
                              onClick={() => void onReject(row.uid)}
                            >
                              Reject
                            </button>
                          ) : null}
                        </div>
                        {!canApprove && row.status === 'pending' ? (
                          <p className="partner-panel-hint">
                            Enter the Lemon affiliate id to enable Approve.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                )
              })
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
