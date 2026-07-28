import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth, isFirebaseConfigured, requireAuth } from '../lib/firebase'
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
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
