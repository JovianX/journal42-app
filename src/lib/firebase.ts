import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const appId = import.meta.env.VITE_FIREBASE_APP_ID

export const isFirebaseConfigured = Boolean(
  apiKey && authDomain && projectId && appId,
)

let firebaseApp: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

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
  db = getFirestore(firebaseApp)
}

export { firebaseApp, auth, db }

export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.',
    )
  }
  return auth
}

export function requireDb(): Firestore {
  if (!db) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.',
    )
  }
  return db
}
