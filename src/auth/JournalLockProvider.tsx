import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './useAuth'
import { JournalLockContext } from './journal-lock-context'
import {
  clearJournalLockSession,
  createJournalLock,
  getJournalLockMeta,
  hasJournalLock,
  isJournalUnlocked,
  lockJournal,
  removeJournalLockMeta,
  saveJournalLockMeta,
  setJournalLockMeta,
  subscribeJournalLockMeta,
  unlockJournal,
} from '../lib/journalLock'
import {
  migrateJournalDecryption,
  migrateJournalEncryption,
} from '../lib/journalStore'

const AUTO_LOCK_MS = 15 * 60 * 1000

export function JournalLockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)

  useEffect(() => {
    if (!user) {
      clearJournalLockSession()
      setJournalLockMeta(null)
      setReady(false)
      setMetaLoaded(false)
      return
    }

    setReady(false)
    setMetaLoaded(false)

    const unsub = subscribeJournalLockMeta(
      user.uid,
      (meta) => {
        setJournalLockMeta(meta)
        if (!meta) {
          clearJournalLockSession()
        }
        setMetaLoaded(true)
      },
      () => {
        setMetaLoaded(true)
      },
    )

    return () => {
      unsub()
      clearJournalLockSession()
      setJournalLockMeta(null)
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user || !metaLoaded) return
    setReady(true)
  }, [user, metaLoaded])

  useEffect(() => {
    if (!user || !hasJournalLock() || !isJournalUnlocked()) return

    let idleTimer = window.setTimeout(() => {
      lockJournal()
      setSessionVersion((value) => value + 1)
    }, AUTO_LOCK_MS)

    function bumpIdleTimer() {
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        lockJournal()
        setSessionVersion((value) => value + 1)
      }, AUTO_LOCK_MS)
    }

    function onVisibilityChange() {
      if (document.hidden) {
        lockJournal()
        setSessionVersion((value) => value + 1)
        return
      }
      bumpIdleTimer()
    }

    const activityEvents = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, bumpIdleTimer, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearTimeout(idleTimer)
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, bumpIdleTimer)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user?.uid, ready, sessionVersion])

  const unlock = useCallback(async (passcode: string) => {
    const ok = await unlockJournal(passcode)
    if (!ok) return 'wrong-passcode'
    setSessionVersion((value) => value + 1)
    return 'ok'
  }, [])

  const lock = useCallback(() => {
    lockJournal()
    setSessionVersion((value) => value + 1)
  }, [])

  const setupLock = useCallback(
    async (passcode: string) => {
      if (!user) return
      const meta = await createJournalLock(passcode)
      await migrateJournalEncryption(user.uid)
      await saveJournalLockMeta(user.uid, meta)
      setSessionVersion((value) => value + 1)
    },
    [user],
  )

  const removeLock = useCallback(
    async (passcode: string) => {
      if (!user) return 'wrong-passcode'
      const ok = await unlockJournal(passcode)
      if (!ok) return 'wrong-passcode'

      await migrateJournalDecryption(user.uid)
      await removeJournalLockMeta(user.uid)
      setJournalLockMeta(null)
      clearJournalLockSession()
      setSessionVersion((value) => value + 1)
      return 'ok'
    },
    [user],
  )

  const changePasscode = useCallback(
    async (currentPasscode: string, nextPasscode: string) => {
      if (!user) return 'wrong-passcode'
      const ok = await unlockJournal(currentPasscode)
      if (!ok) return 'wrong-passcode'

      await migrateJournalDecryption(user.uid)
      const meta = await createJournalLock(nextPasscode)
      await migrateJournalEncryption(user.uid)
      await saveJournalLockMeta(user.uid, meta)
      setSessionVersion((value) => value + 1)
      return 'ok'
    },
    [user],
  )

  const value = useMemo(
    () => ({
      ready,
      lockEnabled: hasJournalLock(),
      unlocked: isJournalUnlocked(),
      unlock,
      lock,
      setupLock,
      removeLock,
      changePasscode,
      meta: getJournalLockMeta(),
    }),
    [
      ready,
      unlock,
      lock,
      setupLock,
      removeLock,
      changePasscode,
      sessionVersion,
    ],
  )

  return (
    <JournalLockContext.Provider value={value}>
      {children}
    </JournalLockContext.Provider>
  )
}
