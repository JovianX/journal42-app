import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { auth, isFirebaseConfigured, requireAuth } from '../lib/firebase'
import { requestPasswordReset } from '../lib/passwordResetApi'
import { AuthContext } from './auth-context'

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
])

function getAuthErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return ''
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    let active = true

    getRedirectResult(auth).catch(() => {
      // Ignore redirect errors here; login UI surfaces sign-in failures.
    })

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return
      setUser(nextUser)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    const firebaseAuth = requireAuth()
    const provider = new GoogleAuthProvider()

    try {
      await signInWithPopup(firebaseAuth, provider)
    } catch (error) {
      const code = getAuthErrorCode(error)
      if (REDIRECT_FALLBACK_CODES.has(code)) {
        await signInWithRedirect(firebaseAuth, provider)
        return
      }
      throw error
    }
  }

  async function signInWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(requireAuth(), email, password)
  }

  async function signUpWithEmail(email: string, password: string) {
    await createUserWithEmailAndPassword(requireAuth(), email, password)
  }

  async function sendPasswordReset(email: string) {
    await requestPasswordReset(email)
  }

  async function changePassword(currentPassword: string, nextPassword: string) {
    const firebaseAuth = requireAuth()
    const currentUser = firebaseAuth.currentUser
    if (!currentUser?.email) {
      throw new Error('You must be signed in with email to change your password.')
    }

    const credential = EmailAuthProvider.credential(
      currentUser.email,
      currentPassword,
    )
    await reauthenticateWithCredential(currentUser, credential)
    await updatePassword(currentUser, nextPassword)
  }

  async function signOut() {
    await firebaseSignOut(requireAuth())
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        changePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
