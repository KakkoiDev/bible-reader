// Editions the reader added themselves, and where they live.
//
// Two stores, because the two halves have different sizes and different readers.
//
//   localStorage `editions.v1`  — the metadata: id, names, direction, which books.
//     A few KB. It has to be readable *synchronously at startup*, before the first
//     render, because `BY_ID[lang].label` is on the path of almost every component
//     and an edition that arrives a tick later would render as a crash.
//
//   IndexedDB `bible-imports`   — the text, one record per book. A whole edition is
//     4-8 MB, which is past what localStorage holds and would be a bad citizen there
//     even if it fitted.
//
// Ids carry a reserved `x-` prefix. That is not cosmetic: an id is a URL segment, a
// localStorage key for annotations, and a data directory name all at once, so a
// future built-in edition taking an id a reader had already used would silently bind
// their saved highlights to a different text.

import type { EditionBook } from './types'
import type { Lang, VersionMeta } from './versions'

const META_KEY = 'editions.v1'
const DB_NAME = 'bible-imports'
const DB_VERSION = 1
const STORE = 'books'

/** The reserved prefix. `isImported` is the only thing anywhere that decides whether
 *  a book comes from the network or from the device. */
export const IMPORT_PREFIX = 'x-'
export const isImported = (id: string) => id.startsWith(IMPORT_PREFIX)

export interface ImportedMeta extends VersionMeta {
  /** Canonical English book names this edition carries, so the reader can merge them
   *  into the index without opening the database. */
  books: string[]
  /** Verse ceiling per chapter, per book slug — the same shape `index.json` uses.
   *  Held with the metadata so the index can be merged synchronously at startup
   *  rather than after a database round trip per book. About 4 KB for a whole Bible. */
  chapters: Record<string, number[]>
  /** Epoch ms, shown in the editions list. */
  addedAt: number
}

/** Turn a reader's chosen name into an id that cannot collide with a built-in. */
export const importedId = (label: string, taken: Set<string>): Lang => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'edition'
  let id = `${IMPORT_PREFIX}${base}`
  for (let n = 2; taken.has(id); n++) id = `${IMPORT_PREFIX}${base}-${n}`
  return id
}

export function listImported(): ImportedMeta[] {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.id === 'string' && isImported(m.id)) : []
  } catch {
    return []
  }
}

const writeMeta = (all: ImportedMeta[]) => localStorage.setItem(META_KEY, JSON.stringify(all))

/* ------------------------------ IndexedDB ------------------------------ */

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const run = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const bookKey = (id: string, slug: string) => `${id}/${slug}`

/** One book of one imported edition, or null. The reader's loader falls back to the
 *  empty book on null, which is the same thing a 404 gives it for a shipped edition. */
export async function importedBook(id: Lang, slug: string): Promise<EditionBook | null> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readonly')
    const got = await run<EditionBook | undefined>(tx.objectStore(STORE).get(bookKey(id, slug)))
    db.close()
    return got ?? null
  } catch {
    return null
  }
}

/**
 * Write the text first, then the metadata.
 *
 * That order is the recovery story: the metadata is what makes an edition appear in
 * the app, so if the write is interrupted the reader is left with some orphaned
 * records in IndexedDB rather than an edition in their list whose pages are blank.
 * `removeImported` deletes by the book list in the metadata, so orphans are swept up
 * by a later import of the same id, and are invisible in the meantime.
 */
export async function saveImported(
  meta: ImportedMeta,
  books: { slug: string; book: EditionBook }[],
): Promise<void> {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const { slug, book } of books) store.put(book, bookKey(meta.id, slug))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  db.close()
  writeMeta([...listImported().filter((m) => m.id !== meta.id), meta])
}

/** Drop an edition: its metadata first, so a failure mid-delete leaves text nobody
 *  can reach rather than an edition whose books have gone. */
export async function removeImported(id: Lang, slugs: string[]): Promise<void> {
  writeMeta(listImported().filter((m) => m.id !== id))
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    for (const slug of slugs) tx.objectStore(STORE).delete(bookKey(id, slug))
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* the metadata is already gone, which is what the app reads */
  }
}

/** Roughly how much room the imported text takes, for the editions list. Best effort:
 *  `estimate()` reports the whole origin, so it is only shown as an order of
 *  magnitude and only when the browser supports it. */
export async function storageUsed(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e?.usage ?? null
  } catch {
    return null
  }
}
