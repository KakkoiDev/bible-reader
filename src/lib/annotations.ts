import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Lang } from './versions'

export type HColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
export const COLORS: HColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

export interface HRange {
  id: string
  lang: Lang
  start: number
  end: number
  color: HColor
}
export interface Ann {
  note?: string
  highlights?: HRange[]
  tags?: string[]
  /** Epoch ms. Absent on entries saved before timestamps existed — shown as "—"
   *  rather than backfilled, so the drawer never claims a date it doesn't know. */
  createdAt?: number
  updatedAt?: number
  /** Position in the reader's hand-arranged order (drawer's "Custom" sort). */
  order?: number
}
export type Store = Record<string, Ann>

export const vref = (slug: string, ch: number, v: number) => `${slug}.${ch}.${v}`
export const parseRef = (r: string) => {
  const [slug, ch, v] = r.split('.')
  return { slug, ch: Number(ch), v: Number(v) }
}

const KEY = 'annotations.v1'
// Tags a reader has defined but not yet applied to anything. Without this a tag
// would only exist as a member of some note's `tags`, so a freshly created one
// would vanish on reload. Keeping a vocabulary lets you set up your tag set once
// and then just tap chips while reading.
const VOCAB_KEY = 'tags.v1'
const loadVocab = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(VOCAB_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const load = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}
const isEmpty = (a: Ann) => !a.note && !(a.highlights && a.highlights.length) && !(a.tags && a.tags.length)

export function useAnnotations() {
  const [store, setStore] = useState<Store>(load)
  const [vocab, setVocab] = useState<string[]>(loadVocab)
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(store))
  }, [store])
  useEffect(() => {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(vocab))
  }, [vocab])

  /** Every mutation stamps `updatedAt`, and `createdAt` the first time. */
  const update = useCallback((ref: string, fn: (a: Ann) => Ann) => {
    setStore((prev) => {
      const next = { ...prev }
      const before = prev[ref]
      const res = fn(before ? { ...before } : {})
      if (isEmpty(res)) delete next[ref]
      else {
        const now = Date.now()
        next[ref] = { ...res, createdAt: before?.createdAt ?? res.createdAt ?? now, updatedAt: now }
      }
      return next
    })
  }, [])

  const addHighlight = useCallback(
    (ref: string, h: Omit<HRange, 'id'>) =>
      update(ref, (a) => ({
        ...a,
        highlights: [...(a.highlights || []), { ...h, id: crypto.randomUUID() }],
      })),
    [update],
  )

  const clearHighlightsIn = useCallback(
    (ref: string, lang: Lang, start: number, end: number) =>
      update(ref, (a) => ({
        ...a,
        highlights: (a.highlights || []).filter(
          (h) => !(h.lang === lang && h.start < end && h.end > start),
        ),
      })),
    [update],
  )

  const remove = useCallback(
    (ref: string) =>
      setStore((prev) => {
        const next = { ...prev }
        delete next[ref]
        return next
      }),
    [],
  )
  // Merge imported annotations in; an imported verse replaces that verse's entry.
  const importStore = useCallback((incoming: Store) => setStore((prev) => ({ ...prev, ...incoming })), [])
  const setNote = useCallback(
    (ref: string, note: string) => update(ref, (a) => ({ ...a, note: note.trim() || undefined })),
    [update],
  )
  const setTags = useCallback(
    (ref: string, tags: string[]) =>
      update(ref, (a) => ({ ...a, tags: tags.length ? [...new Set(tags)] : undefined })),
    [update],
  )

  /** Define one or more tags up front, comma separated, without attaching them. */
  const createTags = useCallback(
    (raw: string) => setVocab((prev) => [...new Set([...prev, ...parseTags(raw)])]),
    [],
  )

  /** Drop a tag from every note that carries it, and from the vocabulary, for
   *  fixing a misspelling. The notes survive; only entries whose tag was their
   *  sole content are removed. */
  const removeTag = useCallback((tag: string) => {
    setVocab((prev) => prev.filter((x) => x !== tag))
    return setStore((prev) => {
        const next = { ...prev }
        const now = Date.now()
        for (const [ref, a] of Object.entries(prev)) {
          if (!a.tags?.includes(tag)) continue
          const tags = a.tags.filter((x) => x !== tag)
          const res: Ann = { ...a, tags: tags.length ? tags : undefined, updatedAt: now }
          if (isEmpty(res)) delete next[ref]
          else next[ref] = res
        }
        return next
      })
  }, [])

  /** Rewrite the hand-arranged order for the whole list, in the given ref order. */
  const setOrder = useCallback(
    (refs: string[]) =>
      setStore((prev) => {
        const next = { ...prev }
        refs.forEach((ref, i) => {
          if (next[ref]) next[ref] = { ...next[ref], order: i }
        })
        return next
      }),
    [],
  )

  /** Vocabulary plus everything actually in use, alphabetical. */
  const tags = useMemo(
    () =>
      [...new Set([...vocab, ...Object.values(store).flatMap((a) => a.tags || [])])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    [vocab, store],
  )

  const importVocab = useCallback((incoming: string[]) => setVocab((prev) => [...new Set([...prev, ...incoming])]), [])

  return {
    store,
    tags,
    vocab,
    addHighlight,
    clearHighlightsIn,
    setNote,
    setTags,
    createTags,
    removeTag,
    setOrder,
    remove,
    importStore,
    importVocab,
  }
}

export const normalizeTag = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, 40)

/** Split a typed string into tags on commas, so "study, prayer" enters as two. */
export const parseTags = (raw: string): string[] =>
  raw.split(',').map(normalizeTag).filter(Boolean)

/** How many notes carry a tag, for the delete confirmation. */
export const countTagged = (store: Store, tag: string) =>
  Object.values(store).filter((a) => a.tags?.includes(tag)).length
