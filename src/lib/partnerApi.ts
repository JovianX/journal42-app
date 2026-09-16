import type { User } from 'firebase/auth'
import { getAiApiBase } from './ai'
import { readPartnerCode } from './partnerCode'

export type PartnerStatus = 'none' | 'pending' | 'approved' | 'rejected'

export type PartnerCodeCheckStatus =
  | 'available'
  | 'taken'
  | 'reserved'
  | 'invalid'
  | 'yours'
  | 'empty'

export type PartnerMe = {
  status: PartnerStatus
  autoCode?: string
  customCode?: string | null
  clickCount?: number
  signupCount?: number
  paidCount?: number
  earningsCents?: number
  voidedCents?: number
  note?: string | null
  siteOrigin: string
  sharePath: string
  lemonSignupUrl?: string | null
  isAdmin?: boolean
  uid?: string
}

export type PartnerCodeCheck = {
  code: string
  status: PartnerCodeCheckStatus
  message: string
}

export type PartnerApplication = {
  uid: string
  status: Exclude<PartnerStatus, 'none'>
  email: string | null
  displayName: string | null
  note: string | null
  autoCode: string
  customCode: string | null
  lemonId: string | null
  clickCount: number
  signupCount: number
  paidCount: number
  earningsCents: number
  appliedAt: number
  approvedAt: number | null
}

async function authFetch(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken()
  let response: Response
  try {
    response = await fetch(`${getAiApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Could not reach the partner service. Check that the API is running.')
  }
  return response
}

async function readJson<T>(response: Response): Promise<T> {
  let data: (T & { error?: string }) | { error?: string } = {}
  try {
    data = (await response.json()) as T & { error?: string }
  } catch {
    // Non-JSON still maps below.
  }
  if (!response.ok) {
    throw new Error(
      'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Partner request failed.',
    )
  }
  return data as T
}

export async function getPartnerMe(user: User) {
  const response = await authFetch(user, '/partner/me')
  return readJson<PartnerMe>(response)
}

export async function applyToPartnerProgram(user: User, note?: string) {
  const response = await authFetch(user, '/partner/apply', {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  })
  return readJson<PartnerMe>(response)
}

export async function setCustomPartnerCode(user: User, code: string) {
  const response = await authFetch(user, '/partner/custom-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return readJson<PartnerMe>(response)
}

export async function checkPartnerCode(user: User, code: string) {
  const response = await authFetch(
    user,
    `/partner/code-check?code=${encodeURIComponent(code)}`,
  )
  return readJson<PartnerCodeCheck>(response)
}

export async function bindPartnerCode(user: User, code = readPartnerCode()) {
  if (!code) return
  try {
    const response = await authFetch(user, '/partner/bind', {
      method: 'POST',
      body: JSON.stringify({ a: code }),
    })
    await readJson<{ bound?: boolean }>(response)
  } catch {
    // Attribution is best-effort. Checkout still sends the stored code.
  }
}

export async function listPartnerApplications(user: User) {
  const response = await authFetch(user, '/partner/admin/applications')
  const data = await readJson<{ applications: PartnerApplication[] }>(response)
  return data.applications ?? []
}

export async function adminApprovePartner(
  user: User,
  uid: string,
  lemonId: string,
) {
  const response = await authFetch(user, '/partner/admin/approve', {
    method: 'POST',
    body: JSON.stringify({ uid, lemonId }),
  })
  return readJson<PartnerMe>(response)
}

export async function adminRejectPartner(user: User, uid: string) {
  const response = await authFetch(user, '/partner/admin/reject', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  })
  return readJson<PartnerMe>(response)
}

export function partnerShareUrl(origin: string, path: string, code: string) {
  const url = new URL(path || '/', origin)
  url.searchParams.set('a', code)
  return url.toString()
}

export function formatPartnerMoney(cents: number) {
  const amount = Math.max(0, cents) / 100
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatPartnerDate(ms: number) {
  if (!ms) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms))
}
