import type { User } from 'firebase/auth'

export type Reflection = {
  text: string
  historyCite?: string
}

export type ReflectionHistoryItem = {
  text: string
  createdAt?: number
}

type ReflectResponse = {
  reflection?: Reflection
  error?: string
}

const DEV_API_BASE = 'http://localhost:8787'
const PROD_API_BASE =
  'https://unexhortative-recitable-edyth.ngrok-free.dev/journal42/api'

export function getAiApiBase() {
  return (
    import.meta.env.VITE_AI_API_BASE?.trim() ||
    (import.meta.env.DEV ? DEV_API_BASE : PROD_API_BASE)
  )
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
  const response = await fetch(`${getAiApiBase()}/reflect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ draft, history, reply }),
    signal,
  })

  const data = (await response.json()) as ReflectResponse
  if (!response.ok || !data.reflection) {
    throw new Error(data.error ?? 'Reflection service unavailable.')
  }

  return data.reflection
}
