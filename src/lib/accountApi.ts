import type { User } from 'firebase/auth'
import { getAiApiBase } from './ai'

type DeleteAccountResponse = {
  ok?: boolean
  error?: string
}

export async function deleteAccount(user: User) {
  const token = await user.getIdToken(true)
  let response: Response
  try {
    response = await fetch(`${getAiApiBase()}/account/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch {
    throw new Error('Could not reach the account service. Check that the API is running.')
  }

  let data: DeleteAccountResponse = {}
  try {
    data = (await response.json()) as DeleteAccountResponse
  } catch {
    // Non-JSON still maps below.
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'Could not delete account.')
  }
}
