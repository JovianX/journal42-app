import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const appId = import.meta.env.VITE_FIREBASE_APP_ID

export const isFirebaseConfigured = Boolean(
  apiKey && authDomain && projectId && appId,
)

let firebaseApp: FirebaseApp | null = null
let auth: Auth | null = null

if (isFirebaseConfigured) {
  firebaseApp = initializeApp({
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  })
  auth = getAuth(firebaseApp)
}

export { firebaseApp, auth }

export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.',
    )
  }
  return auth
}
