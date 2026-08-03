import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { requireDb } from './firebase'

export type Nugget = {
  id: string
  text: string
  createdAt: number
}

export type JournalCallbacks = {
  onNuggets: (nuggets: Nugget[]) => void
  onDraft: (draft: string) => void
  onError?: (error: Error) => void
}

function userRef(uid: string) {
  return doc(requireDb(), 'users', uid)
}

function nuggetsCollection(uid: string) {
  return collection(requireDb(), 'users', uid, 'nuggets')
}

function nuggetRef(uid: string, id: string) {
  return doc(requireDb(), 'users', uid, 'nuggets', id)
}

export function subscribeJournal(
  uid: string,
  { onNuggets, onDraft, onError }: JournalCallbacks,
): Unsubscribe {
  const unsubs: Unsubscribe[] = []

  unsubs.push(
    onSnapshot(
      userRef(uid),
      (snap) => {
        const data = snap.data()
        onDraft(typeof data?.draft === 'string' ? data.draft : '')
      },
      (error) => {
        onError?.(error)
      },
    ),
  )

  unsubs.push(
    onSnapshot(
      query(nuggetsCollection(uid), orderBy('createdAt', 'desc')),
      (snap) => {
        const nuggets: Nugget[] = snap.docs.map((item) => {
          const data = item.data()
          return {
            id: item.id,
            text: typeof data.text === 'string' ? data.text : '',
            createdAt:
              typeof data.createdAt === 'number' ? data.createdAt : 0,
          }
        })
        onNuggets(nuggets)
      },
      (error) => {
        onError?.(error)
      },
    ),
  )

  return () => {
    for (const unsub of unsubs) unsub()
  }
}

export async function setDraft(uid: string, draft: string) {
  await setDoc(
    userRef(uid),
    {
      draft,
      updatedAt: Date.now(),
    },
    { merge: true },
  )
}

export async function createNugget(uid: string, nugget: Nugget) {
  await setDoc(nuggetRef(uid, nugget.id), {
    text: nugget.text,
    createdAt: nugget.createdAt,
  })
}

export async function updateNugget(uid: string, id: string, text: string) {
  await updateDoc(nuggetRef(uid, id), { text })
}

export async function deleteNugget(uid: string, id: string) {
  await deleteDoc(nuggetRef(uid, id))
}
