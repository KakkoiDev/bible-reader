import { useCallback, useEffect, useState } from 'react'
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
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(store))
  }, [store])

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

  return { store, addHighlight, clearHighlightsIn, setNote, setTags, setOrder, remove, importStore }
}

/** Every tag in use, alphabetical — drives the drawer's filter chips. */
export const allTags = (store: Store): string[] =>
  [...new Set(Object.values(store).flatMap((a) => a.tags || []))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )

export const normalizeTag = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, 40)
