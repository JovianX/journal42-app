import { createContext } from 'react'
import type { JournalLockMeta } from '../lib/journalLock'

export type JournalLockContextValue = {
  ready: boolean
  lockEnabled: boolean
  unlocked: boolean
  unlock: (passcode: string) => Promise<'ok' | 'wrong-passcode'>
  lock: () => void
  setupLock: (passcode: string) => Promise<void>
  removeLock: (passcode: string) => Promise<'ok' | 'wrong-passcode'>
  changePasscode: (
    currentPasscode: string,
    nextPasscode: string,
  ) => Promise<'ok' | 'wrong-passcode'>
  meta: JournalLockMeta | null
}

export const JournalLockContext = createContext<JournalLockContextValue | null>(
  null,
)
