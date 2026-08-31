import { Outlet } from 'react-router-dom'
import AuthLoading from './AuthLoading'
import { useJournalLock } from './useJournalLock'
import JournalUnlock from '../pages/JournalUnlock'

export default function RequireJournalUnlock() {
  const { ready, lockEnabled, unlocked } = useJournalLock()

  if (!ready) {
    return <AuthLoading />
  }

  if (lockEnabled && !unlocked) {
    return <JournalUnlock />
  }

  return <Outlet />
}
