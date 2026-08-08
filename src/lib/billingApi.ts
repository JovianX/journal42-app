import type { User } from 'firebase/auth'
import { getAiApiBase } from './ai'
import type { PaidPlanId } from './billing'

type BillingUrlResponse = {
  url?: string
  error?: string
}

async function postBilling(
  path: '/billing/checkout' | '/billing/portal',
  user: User,
  body?: Record<string, unknown>,
) {
  const token = await user.getIdToken()
  let response: Response
  try {
    response = await fetch(`${getAiApiBase()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new Error('Could not reach the billing service. Check that the API is running.')
  }

  let data: BillingUrlResponse = {}
  try {
    data = (await response.json()) as BillingUrlResponse
  } catch {
    // Non-JSON still maps below.
  }

  if (!response.ok || !data.url) {
    throw new Error(data.error ?? 'Billing request failed.')
  }

  return data.url
}

export async function startCheckout(user: User, plan: PaidPlanId) {
  const url = await postBilling('/billing/checkout', user, { plan })
  window.location.assign(url)
}

export async function openBillingPortal(user: User) {
  const url = await postBilling('/billing/portal', user)
  window.location.assign(url)
}
