import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Reflection } from './ai'
import { requireDb } from './firebase'
import { protectText, revealText, shouldEncryptJournal, getJournalLockMeta, getJournalSessionKey } from './journalLock'

export type DiscussionTurn = {
  id: string
  comment?: string
  reflection?: Reflection
  usedHistory?: boolean
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

async function revealReflection(raw: unknown): Promise<Reflection | undefined> {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  if (typeof data.text !== 'string' || !data.text.trim()) return undefined

  const text = await revealText(data.text)
  const historyCite =
    typeof data.historyCite === 'string' && data.historyCite
      ? await revealText(data.historyCite)
      : undefined

  return {
    text,
    ...(historyCite ? { historyCite } : {}),
  }
}

async function parseDiscussion(raw: unknown): Promise<DiscussionTurn[]> {
  if (!Array.isArray(raw)) return []
  const turns: DiscussionTurn[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const data = item as Record<string, unknown>
    if (typeof data.id !== 'string' || !data.id) continue

    const reflection = await revealReflection(data.reflection)
    const commentRaw =
      typeof data.comment === 'string' && data.comment.trim()
        ? data.comment
        : undefined
    const comment = commentRaw ? await revealText(commentRaw) : undefined

    if (!reflection && !comment) continue
    turns.push({
      id: data.id,
      ...(comment ? { comment } : {}),
      ...(reflection ? { reflection } : {}),
      ...(data.usedHistory === true ? { usedHistory: true } : {}),
    })
  }

  return turns
}

async function protectReflection(reflection: Reflection) {
  return {
    text: await protectText(reflection.text),
    ...(reflection.historyCite
      ? { historyCite: await protectText(reflection.historyCite) }
      : {}),
  }
}

async function protectDiscussion(discussion: DiscussionTurn[]) {
  const protectedTurns = []
  for (const turn of discussion) {
    protectedTurns.push({
      id: turn.id,
      ...(turn.comment ? { comment: await protectText(turn.comment) } : {}),
      ...(turn.reflection
        ? { reflection: await protectReflection(turn.reflection) }
        : {}),
      ...(turn.usedHistory ? { usedHistory: true } : {}),
    })
  }
  return protectedTurns
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
    ...(turn.usedHistory ? { usedHistory: true } : {}),
  }))
}

export function persistableDiscussion(discussion: DiscussionTurn[]) {
  return discussion.filter((turn) => Boolean(turn.reflection))
}

async function revealNugget(
  id: string,
  data: Record<string, unknown>,
): Promise<Nugget> {
  const discussion = await parseDiscussion(data.discussion)
  return {
    id,
    text: typeof data.text === 'string' ? await revealText(data.text) : '',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    ...(discussion.length > 0 ? { discussion } : {}),
  }
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
        void (async () => {
          try {
            const data = snap.data()
            const draft =
              typeof data?.draft === 'string'
                ? await revealText(data.draft)
                : ''
            onDraft(draft, await parseDiscussion(data?.discussion))
          } catch (error) {
            onError?.(
              error instanceof Error ? error : new Error('Could not read draft.'),
            )
          }
        })()
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
        void (async () => {
          try {
            const nuggets = await Promise.all(
              snap.docs.map((item) => revealNugget(item.id, item.data())),
            )
            onNuggets(nuggets)
          } catch (error) {
            onError?.(
              error instanceof Error
                ? error
                : new Error('Could not read journal entries.'),
            )
          }
        })()
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
  const storedDraft = shouldEncryptJournal() ? await protectText(draft) : draft
  const storedDiscussion =
    saved.length > 0
      ? shouldEncryptJournal()
        ? await protectDiscussion(saved)
        : serializeDiscussion(saved)
      : deleteField()

  await setDoc(
    userRef(uid),
    {
      draft: storedDraft,
      updatedAt: Date.now(),
      discussion: storedDiscussion,
    },
    { merge: true },
  )
}

export async function createNugget(uid: string, nugget: Nugget) {
  const saved = persistableDiscussion(nugget.discussion ?? [])
  const storedText = shouldEncryptJournal()
    ? await protectText(nugget.text)
    : nugget.text
  const storedDiscussion =
    saved.length > 0
      ? shouldEncryptJournal()
        ? await protectDiscussion(saved)
        : serializeDiscussion(saved)
      : undefined

  await setDoc(nuggetRef(uid, nugget.id), {
    text: storedText,
    createdAt: nugget.createdAt,
    ...(storedDiscussion ? { discussion: storedDiscussion } : {}),
  })
}

export async function updateNugget(uid: string, id: string, text: string) {
  await updateDoc(nuggetRef(uid, id), {
    text: shouldEncryptJournal() ? await protectText(text) : text,
  })
}

export async function updateNuggetDiscussion(
  uid: string,
  id: string,
  discussion: DiscussionTurn[],
) {
  const saved = persistableDiscussion(discussion)
  await updateDoc(nuggetRef(uid, id), {
    discussion:
      saved.length > 0
        ? shouldEncryptJournal()
          ? await protectDiscussion(saved)
          : serializeDiscussion(saved)
        : deleteField(),
  })
}

export async function deleteNugget(uid: string, id: string) {
  await deleteDoc(nuggetRef(uid, id))
}

export async function migrateJournalEncryption(uid: string) {
  const userDoc = await getDoc(userRef(uid))
  const userData = userDoc.data()

  if (userData && typeof userData.draft === 'string') {
    const draft = await revealText(userData.draft)
    const discussion = await parseDiscussion(userData.discussion)
    await setDraft(uid, draft, discussion)
  }

  const nuggetSnap = await getDocs(
    query(nuggetsCollection(uid), orderBy('createdAt', 'desc')),
  )

  for (const item of nuggetSnap.docs) {
    const nugget = await revealNugget(item.id, item.data())
    await createNugget(uid, nugget)
  }
}

export async function migrateJournalDecryption(uid: string) {
  if (!getJournalLockMeta() || !getJournalSessionKey()) {
    throw new Error('Unlock the journal before removing the passcode.')
  }

  const userDoc = await getDoc(userRef(uid))
  const userData = userDoc.data()

  if (userData && typeof userData.draft === 'string') {
    const draft = await revealText(userData.draft)
    const discussion = await parseDiscussion(userData.discussion)
    const saved = persistableDiscussion(discussion)
    await setDoc(
      userRef(uid),
      {
        draft,
        updatedAt: Date.now(),
        discussion:
          saved.length > 0 ? serializeDiscussion(saved) : deleteField(),
      },
      { merge: true },
    )
  }

  const nuggetSnap = await getDocs(
    query(nuggetsCollection(uid), orderBy('createdAt', 'desc')),
  )

  for (const item of nuggetSnap.docs) {
    const nugget = await revealNugget(item.id, item.data())
    const saved = persistableDiscussion(nugget.discussion ?? [])
    await setDoc(nuggetRef(uid, nugget.id), {
      text: nugget.text,
      createdAt: nugget.createdAt,
      ...(saved.length > 0 ? { discussion: serializeDiscussion(saved) } : {}),
    })
  }
}
