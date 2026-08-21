import type { User } from 'firebase/auth'

export type Reflection = {
  text: string
  historyCite?: string
}

export type ReflectionHistoryItem = {
  text: string
  createdAt?: number
}

export type ReflectionErrorCode = 'rate_limited' | 'unavailable' | 'provider' | 'plan_limit'

type ReflectResponse = {
  reflection?: Reflection
  error?: string
  code?: ReflectionErrorCode
  retryAfterMs?: number
  kind?: 'reflection' | 'chat'
}

export class ReflectionRequestError extends Error {
  status: number
  code: ReflectionErrorCode
  retryAfterMs?: number

  constructor({
    message,
    status,
    code = 'provider',
    retryAfterMs,
  }: {
    message: string
    status: number
    code?: ReflectionErrorCode
    retryAfterMs?: number
  }) {
    super(message)
    this.name = 'ReflectionRequestError'
    this.status = status
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

const DEV_API_BASE = 'http://localhost:8787'
const PROD_API_BASE = 'https://api.journal42.cloud'

export function getAiApiBase() {
  return (
    import.meta.env.VITE_AI_API_BASE?.trim() ||
    (import.meta.env.DEV ? DEV_API_BASE : PROD_API_BASE)
  )
}

function reflectionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ReflectionRequestError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function toReflectionErrorMessage(error: unknown) {
  return reflectionErrorMessage(error, 'Reflection unavailable.')
}

export async function requestReflection({
  user,
  draft,
  history = [],
  reply = '',
  signal,
}: {
  user: User
  draft: string
  history?: ReflectionHistoryItem[]
  reply?: string
  signal?: AbortSignal
}) {
  const token = await user.getIdToken()

  let response: Response
  try {
    response = await fetch(`${getAiApiBase()}/reflect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ draft, history, reply }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ReflectionRequestError({
      status: 503,
      code: 'unavailable',
      message: 'Could not reach the reflection service. Check that the API is running.',
    })
  }

  let data: ReflectResponse = {}
  try {
    data = (await response.json()) as ReflectResponse
  } catch {
    // Non-JSON responses still map to a usable error below.
  }

  if (!response.ok || !data.reflection) {
    const retryAfterHeader = response.headers.get('retry-after')
    const retryAfterFromHeader = retryAfterHeader
      ? Math.ceil(Number(retryAfterHeader) * 1000)
      : undefined

    throw new ReflectionRequestError({
      status: response.status,
      code: data.code ?? (response.status === 429 ? 'rate_limited' : response.status === 402 ? 'plan_limit' : 'provider'),
      retryAfterMs:
        data.retryAfterMs ??
        (Number.isFinite(retryAfterFromHeader) ? retryAfterFromHeader : undefined),
      message: data.error ?? 'Reflection service unavailable.',
    })
  }

  return data.reflection
}
