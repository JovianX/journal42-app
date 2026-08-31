import { useContext } from 'react'
import { JournalLockContext } from './journal-lock-context'

export function useJournalLock() {
  const value = useContext(JournalLockContext)
  if (!value) {
    throw new Error('useJournalLock must be used within JournalLockProvider')
  }
  return value
}
