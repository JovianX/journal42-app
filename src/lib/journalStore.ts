import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Reflection } from './ai'
import { requireDb } from './firebase'

export type DiscussionTurn = {
  id: string
  comment?: string
  reflection?: Reflection
}

export type Nugget = {
  id: string
  text: string
  createdAt: number
  discussion?: DiscussionTurn[]
}

export type JournalCallbacks = {
  onNuggets: (nuggets: Nugget[]) => void
  onDraft: (draft: string, discussion: DiscussionTurn[]) => void
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

function parseReflection(raw: unknown): Reflection | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  if (typeof data.text !== 'string' || !data.text.trim()) return undefined
  return {
    text: data.text,
    ...(typeof data.historyCite === 'string' && data.historyCite
      ? { historyCite: data.historyCite }
      : {}),
  }
}

function parseDiscussion(raw: unknown): DiscussionTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: DiscussionTurn[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const data = item as Record<string, unknown>
    if (typeof data.id !== 'string' || !data.id) continue

    const reflection = parseReflection(data.reflection)
    const comment =
      typeof data.comment === 'string' && data.comment.trim()
        ? data.comment
        : undefined

    if (!reflection && !comment) continue
    turns.push({
      id: data.id,
      ...(comment ? { comment } : {}),
      ...(reflection ? { reflection } : {}),
    })
  }

  return turns
}

function serializeReflection(reflection: Reflection) {
  return {
    text: reflection.text,
    ...(reflection.historyCite ? { historyCite: reflection.historyCite } : {}),
  }
}

function serializeDiscussion(discussion: DiscussionTurn[]) {
  return discussion.map((turn) => ({
    id: turn.id,
    ...(turn.comment ? { comment: turn.comment } : {}),
    ...(turn.reflection
      ? { reflection: serializeReflection(turn.reflection) }
      : {}),
  }))
}

export function persistableDiscussion(discussion: DiscussionTurn[]) {
  return discussion.filter((turn) => Boolean(turn.reflection))
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
        onDraft(
          typeof data?.draft === 'string' ? data.draft : '',
          parseDiscussion(data?.discussion),
        )
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
          const discussion = parseDiscussion(data.discussion)
          return {
            id: item.id,
            text: typeof data.text === 'string' ? data.text : '',
            createdAt:
              typeof data.createdAt === 'number' ? data.createdAt : 0,
            ...(discussion.length > 0 ? { discussion } : {}),
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

export async function setDraft(
  uid: string,
  draft: string,
  discussion: DiscussionTurn[] = [],
) {
  const saved = persistableDiscussion(discussion)
  await setDoc(
    userRef(uid),
    {
      draft,
      updatedAt: Date.now(),
      discussion: saved.length > 0 ? serializeDiscussion(saved) : deleteField(),
    },
    { merge: true },
  )
}

export async function createNugget(uid: string, nugget: Nugget) {
  const saved = persistableDiscussion(nugget.discussion ?? [])
  await setDoc(nuggetRef(uid, nugget.id), {
    text: nugget.text,
    createdAt: nugget.createdAt,
    ...(saved.length > 0 ? { discussion: serializeDiscussion(saved) } : {}),
  })
}

export async function updateNugget(uid: string, id: string, text: string) {
  await updateDoc(nuggetRef(uid, id), {
    text,
  })
}

export async function updateNuggetDiscussion(
  uid: string,
  id: string,
  discussion: DiscussionTurn[],
) {
  const saved = persistableDiscussion(discussion)
  await updateDoc(nuggetRef(uid, id), {
    discussion: saved.length > 0 ? serializeDiscussion(saved) : deleteField(),
  })
}

export async function deleteNugget(uid: string, id: string) {
  await deleteDoc(nuggetRef(uid, id))
}
