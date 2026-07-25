import { useCallback, useEffect, useState } from 'react'
import type { Lang } from './types'

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
const isEmpty = (a: Ann) => !a.note && !(a.highlights && a.highlights.length)

export function useAnnotations() {
  const [store, setStore] = useState<Store>(load)
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(store))
  }, [store])

  const update = useCallback((ref: string, fn: (a: Ann) => Ann) => {
    setStore((prev) => {
      const next = { ...prev }
      const res = fn(prev[ref] ? { ...prev[ref] } : {})
      if (isEmpty(res)) delete next[ref]
      else next[ref] = res
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

  return { store, addHighlight, clearHighlightsIn, setNote, remove, importStore }
}
