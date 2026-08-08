import { getAiApiBase } from './ai'

type PasswordResetResponse = {
  ok?: boolean
  error?: string
}

export async function requestPasswordReset(email: string) {
  let response: Response
  try {
    response = await fetch(`${getAiApiBase()}/auth/password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new Error(
      'Could not reach the API to send a reset email. Check that the API is running.',
    )
  }

  let data: PasswordResetResponse = {}
  try {
    data = (await response.json()) as PasswordResetResponse
  } catch {
    // Non-JSON still maps below.
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'Could not send a reset email. Try again in a moment.')
  }
}
