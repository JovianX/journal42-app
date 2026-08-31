import {
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  createVerifier,
  decryptText,
  deriveKey,
  encryptText,
  generateSalt,
  isEncryptedText,
  saltFromBase64,
  saltToBase64,
  verifyKey,
} from './journalCrypto'
import { requireDb } from './firebase'

export type JournalLockMeta = {
  salt: string
  verifier: string
}

export const LOCKED_TEXT_PLACEHOLDER = 'Locked thought'

let lockMeta: JournalLockMeta | null = null
let sessionKey: CryptoKey | null = null

function userRef(uid: string) {
  return doc(requireDb(), 'users', uid)
}

export function parseJournalLockMeta(
  data: Record<string, unknown> | undefined,
): JournalLockMeta | null {
  if (
    typeof data?.journalLockSalt === 'string' &&
    data.journalLockSalt &&
    typeof data?.journalLockVerifier === 'string' &&
    data.journalLockVerifier
  ) {
    return {
      salt: data.journalLockSalt,
      verifier: data.journalLockVerifier,
    }
  }
  return null
}

export function subscribeJournalLockMeta(
  uid: string,
  onMeta: (meta: JournalLockMeta | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userRef(uid),
    (snap) => {
      onMeta(parseJournalLockMeta(snap.data()))
    },
    (error) => {
      onError?.(error)
    },
  )
}

export async function saveJournalLockMeta(
  uid: string,
  meta: JournalLockMeta,
): Promise<void> {
  await setDoc(
    userRef(uid),
    {
      journalLockSalt: meta.salt,
      journalLockVerifier: meta.verifier,
      updatedAt: Date.now(),
    },
    { merge: true },
  )
}

export async function removeJournalLockMeta(uid: string): Promise<void> {
  await setDoc(
    userRef(uid),
    {
      journalLockSalt: deleteField(),
      journalLockVerifier: deleteField(),
      updatedAt: Date.now(),
    },
    { merge: true },
  )
}

export function setJournalLockMeta(meta: JournalLockMeta | null) {
  lockMeta = meta
  if (!meta) {
    sessionKey = null
  }
}

export function getJournalLockMeta() {
  return lockMeta
}

export function hasJournalLock() {
  return lockMeta !== null
}

export function isJournalUnlocked() {
  return !lockMeta || sessionKey !== null
}

export function getJournalSessionKey() {
  return sessionKey
}

export function clearJournalLockSession() {
  sessionKey = null
}

export function lockJournal() {
  sessionKey = null
}

export async function unlockJournal(passcode: string): Promise<boolean> {
  if (!lockMeta) {
    sessionKey = null
    return true
  }

  const key = await deriveKey(passcode, saltFromBase64(lockMeta.salt))
  const ok = await verifyKey(key, lockMeta.verifier)
  if (!ok) return false

  sessionKey = key
  return true
}

export async function createJournalLock(passcode: string) {
  const salt = generateSalt()
  const key = await deriveKey(passcode, salt)
  const verifier = await createVerifier(key)
  const meta = {
    salt: saltToBase64(salt),
    verifier,
  }

  sessionKey = key
  lockMeta = meta
  return meta
}

export async function protectText(plaintext: string): Promise<string> {
  if (!lockMeta || !sessionKey || !plaintext) return plaintext
  if (isEncryptedText(plaintext)) return plaintext
  return encryptText(plaintext, sessionKey)
}

export async function revealText(stored: string): Promise<string> {
  if (!stored) return stored
  if (!isEncryptedText(stored)) return stored
  if (!sessionKey) return LOCKED_TEXT_PLACEHOLDER
  try {
    return await decryptText(stored, sessionKey)
  } catch {
    return LOCKED_TEXT_PLACEHOLDER
  }
}

export function shouldEncryptJournal() {
  return Boolean(lockMeta && sessionKey)
}
