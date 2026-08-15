import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import type { PlanId } from './billing'
import { hasUnlimitedAi } from './billing'
import { requireDb } from './firebase'

export const FREE_DAILY_REFLECTIONS = 3
export const FREE_DAILY_CHATS = 5

export type AiUsageKind = 'reflection' | 'chat'

export type AiUsage = {
  dayKey: string
  reflections: number
  chats: number
}

export const EMPTY_USAGE: AiUsage = {
  dayKey: '',
  reflections: 0,
  chats: 0,
}

export function utcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10)
}

export function usageForToday(usage: AiUsage, now = Date.now()): AiUsage {
  const today = utcDayKey(now)
  if (usage.dayKey === today) return usage
  return { dayKey: today, reflections: 0, chats: 0 }
}

export function remainingReflections(plan: PlanId, usage: AiUsage, now = Date.now()) {
  if (hasUnlimitedAi(plan)) return Number.POSITIVE_INFINITY
  const today = usageForToday(usage, now)
  return Math.max(0, FREE_DAILY_REFLECTIONS - today.reflections)
}

export function remainingChats(plan: PlanId, usage: AiUsage, now = Date.now()) {
  if (hasUnlimitedAi(plan)) return Number.POSITIVE_INFINITY
  const today = usageForToday(usage, now)
  return Math.max(0, FREE_DAILY_CHATS - today.chats)
}

export function canStartReflection(plan: PlanId, usage: AiUsage, now = Date.now()) {
  return remainingReflections(plan, usage, now) > 0
}

export function canSendChat(plan: PlanId, usage: AiUsage, now = Date.now()) {
  return remainingChats(plan, usage, now) > 0
}

export function quotaLine(plan: PlanId, usage: AiUsage) {
  if (hasUnlimitedAi(plan)) return 'Quieter, all the way.'
  const reflections = remainingReflections(plan, usage)
  const chats = remainingChats(plan, usage)
  const reflectionLabel = reflections === 1 ? 'reflection' : 'reflections'
  const chatLabel = chats === 1 ? 'reply' : 'replies'
  return `${reflections} ${reflectionLabel} and ${chats} ${chatLabel} left today.`
}

function normalizeUsage(data: Record<string, unknown> | undefined): AiUsage {
  if (!data) return EMPTY_USAGE
  return {
    dayKey: typeof data.dayKey === 'string' ? data.dayKey : '',
    reflections:
      typeof data.reflections === 'number' && data.reflections > 0
        ? Math.min(Math.floor(data.reflections), 1000)
        : 0,
    chats:
      typeof data.chats === 'number' && data.chats > 0
        ? Math.min(Math.floor(data.chats), 1000)
        : 0,
  }
}

export function subscribeAiUsage(
  uid: string,
  onChange: (usage: AiUsage) => void,
  onError?: (error: Error) => void,
) {
  const ref = doc(requireDb(), 'users', uid, 'usage', 'daily')
  return onSnapshot(
    ref,
    (snap) => {
      onChange(normalizeUsage(snap.data() as Record<string, unknown> | undefined))
    },
    (error) => {
      onError?.(error)
      onChange(EMPTY_USAGE)
    },
  )
}

export function useAiUsage(uid: string | undefined) {
  const [usage, setUsage] = useState<AiUsage>(EMPTY_USAGE)
  const [ready, setReady] = useState(!uid)

  useEffect(() => {
    if (!uid) {
      setUsage(EMPTY_USAGE)
      setReady(true)
      return
    }

    setReady(false)
    return subscribeAiUsage(
      uid,
      (next) => {
        setUsage(next)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [uid])

  return { usage, ready }
}
