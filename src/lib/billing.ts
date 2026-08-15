import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { requireDb } from './firebase'

export type PaidPlanId = 'pattern' | 'forever'
export type PlanId = 'clear-head' | PaidPlanId
export type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'none'

export type BillingEntitlement = {
  plan: PlanId
  status: BillingStatus
  lemonSubscriptionId?: string
  lemonCustomerId?: string
  lemonVariantId?: string
  renewsAt?: string | null
  endsAt?: string | null
  portalUrl?: string | null
  updatedAt?: number
}

export const DEFAULT_BILLING: BillingEntitlement = {
  plan: 'clear-head',
  status: 'none',
}

/** Only public paid SKU. Forever remains a legacy entitlement. */
export const PUBLIC_PAID_PLAN: PaidPlanId = 'pattern'

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === 'pattern' || value === 'forever'
}

export function hasUnlimitedAi(plan: PlanId) {
  return plan === 'pattern' || plan === 'forever'
}

export function canUpgradePlan(plan: PlanId) {
  return plan === 'clear-head'
}

export function planLabel(plan: PlanId) {
  switch (plan) {
    case 'pattern':
      return 'Quieter, All the Way'
    case 'forever':
      return 'Know Yourself Forever'
    default:
      return 'Quieter'
  }
}

export function planPrice(plan: PlanId) {
  switch (plan) {
    case 'pattern':
      return '$9/mo'
    case 'forever':
      return '$12/mo'
    default:
      return 'Free'
  }
}

export function planBlurb(plan: PlanId) {
  switch (plan) {
    case 'pattern':
      return 'When a few is not enough. Same two minutes. You do not stop at almost quiet.'
    case 'forever':
      return 'When a few is not enough. Your private history stays with you.'
    default:
      return 'Two minutes. Then quieter. Write and save every thought.'
  }
}

export function upgradeLabel() {
  return 'Go all the way'
}

function formatBillingDate(iso: string | null | undefined) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms))
}

export function billingStatusLine(billing: BillingEntitlement) {
  const renews = formatBillingDate(billing.renewsAt)
  const ends = formatBillingDate(billing.endsAt)

  switch (billing.status) {
    case 'active':
      return renews ? `Renews ${renews}` : 'Active'
    case 'past_due':
      return renews ? `Payment past due. Renews ${renews}` : 'Payment past due'
    case 'cancelled':
      return ends ? `Cancels ${ends}` : 'Cancelled'
    case 'expired':
      return 'Expired'
    default:
      return 'Free plan'
  }
}

export function hasPaidBillingAccess(billing: BillingEntitlement) {
  return (
    billing.plan !== 'clear-head' ||
    billing.status === 'active' ||
    billing.status === 'past_due' ||
    billing.status === 'cancelled' ||
    Boolean(billing.lemonSubscriptionId) ||
    Boolean(billing.portalUrl)
  )
}

function normalizeBilling(data: Record<string, unknown> | undefined): BillingEntitlement {
  if (!data) return DEFAULT_BILLING
  const plan =
    data.plan === 'pattern' || data.plan === 'forever' || data.plan === 'clear-head'
      ? data.plan
      : 'clear-head'
  const status =
    data.status === 'active' ||
    data.status === 'past_due' ||
    data.status === 'cancelled' ||
    data.status === 'expired' ||
    data.status === 'none'
      ? data.status
      : 'none'

  return {
    plan,
    status,
    ...(typeof data.lemonSubscriptionId === 'string'
      ? { lemonSubscriptionId: data.lemonSubscriptionId }
      : {}),
    ...(typeof data.lemonCustomerId === 'string'
      ? { lemonCustomerId: data.lemonCustomerId }
      : {}),
    ...(typeof data.lemonVariantId === 'string' ? { lemonVariantId: data.lemonVariantId } : {}),
    renewsAt: typeof data.renewsAt === 'string' ? data.renewsAt : null,
    endsAt: typeof data.endsAt === 'string' ? data.endsAt : null,
    portalUrl: typeof data.portalUrl === 'string' ? data.portalUrl : null,
    ...(typeof data.updatedAt === 'number' ? { updatedAt: data.updatedAt } : {}),
  }
}

export function subscribeBilling(
  uid: string,
  onChange: (billing: BillingEntitlement) => void,
  onError?: (error: Error) => void,
) {
  const ref = doc(requireDb(), 'users', uid, 'billing', 'current')
  return onSnapshot(
    ref,
    (snap) => {
      onChange(normalizeBilling(snap.data() as Record<string, unknown> | undefined))
    },
    (error) => {
      onError?.(error)
      onChange(DEFAULT_BILLING)
    },
  )
}

export function useBilling(uid: string | undefined) {
  const [billing, setBilling] = useState<BillingEntitlement>(DEFAULT_BILLING)
  const [ready, setReady] = useState(!uid)

  useEffect(() => {
    if (!uid) {
      setBilling(DEFAULT_BILLING)
      setReady(true)
      return
    }

    setReady(false)
    return subscribeBilling(
      uid,
      (next) => {
        setBilling(next)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [uid])

  return { billing, ready }
}
