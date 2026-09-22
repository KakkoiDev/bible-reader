// Reading plans.
//
// The whole design rests on one decision: a day's reading is a pure function of the
// start date, the length and the scope. Nothing about which day you are on is stored,
// so a missed day cannot corrupt anything and there is no state to repair. Today's
// slot is today's slot whatever happened yesterday, which is the "no guilt" the reader
// asked for, arrived at by having nothing to feel guilty about rather than by a mode.
//
// What *is* stored is which verses have been read, because that is a fact about the
// reader rather than about the calendar.
import { useCallback, useEffect, useState } from 'react'
import { sectionOf, type IndexItem, type Section } from './types'

/** One chapter of one book. The unit a plan deals in. */
export interface Ref {
  slug: string
  ch: number
}

export type Scope =
  /** Whole sections of the canon, in canonical order. What the presets use: a
   *  `range` from Genesis to Revelation would swallow a deuterocanon sitting
   *  between the Testaments, and "the whole Bible" is not a claim about which
   *  canon the reader holds. */
  | { kind: 'sections'; sections: Section[] }
  /** Every book from `from` to `to` inclusive, in canonical order. Kept because
   *  plans saved before sections exist are stored this way. */
  | { kind: 'range'; from: string; to: string }
  /** A hand-picked set of books, read in canonical order. */
  | { kind: 'books'; slugs: string[] }
  /** An explicit chapter list, read in the order given. `slug.ch`. */
  | { kind: 'chapters'; refs: string[] }

export interface PlanBlock {
  id: string
  name: string
  scope: Scope
  /** Length of one pass in days. */
  days: number
  /** Start again at day 1 once a pass finishes, instead of ending. */
  repeat: boolean
  /** Hand-arranged position in the planner. */
  order: number
  /** Epoch ms at the local midnight the plan started. */
  startedAt: number
}

export const DAY = 86400000

/** Local midnight, which is the phone's midnight: Date's own accessors read the
 *  system zone, so no zone plumbing is needed for the default case. */
export const startOfDay = (t: number): number => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Days since the plan started, 0 on the first day. Rounded, not truncated: a day
 *  across a DST boundary is 23 or 25 hours and truncating would lose or gain one. */
export const elapsedDays = (block: PlanBlock, today: number): number =>
  Math.round((startOfDay(today) - startOfDay(block.startedAt)) / DAY)

/** Which day of a pass today is, or null when the plan has not started yet or has
 *  finished and does not repeat.
 *
 *  `offset` shifts which day of the pass the start date lands on — see
 *  `firstReadingDay`, the only thing that passes it. Zero for every plan that reads
 *  at least a chapter a day, which is every plan the arithmetic used to be tested on. */
export function dayIndex(block: PlanBlock, today: number, offset = 0): number | null {
  const n = elapsedDays(block, today) + offset
  if (n < 0) return null
  if (n < block.days) return n
  return block.repeat ? n % block.days : null
}

/**
 * The first day of a pass whose slice is not empty.
 *
 * `daySlice` gives day `i` the chapters from ⌊i·n/d⌋ to ⌊(i+1)·n/d⌋, so day 0 is
 * empty whenever a plan reads under one chapter a day — which is five of the twenty
 * preset combinations. The New Testament in a year, the Gospels in 90 days and one
 * book in 90 days all delivered *nothing* on the day they were created: the card
 * said "Nothing today." with no Read button, no next date and no explanation, on the
 * day the reader set the plan up.
 *
 * Anchoring the start to this index is what makes "starts today" true. It does not
 * touch `daySlice`: the remainder-spreading there is correct, and days further in
 * are still legitimately empty when there is less than a chapter a day to give —
 * those the planner answers with the next date and a read-ahead instead.
 *
 * ⌊(i+1)·n/d⌋ > ⌊i·n/d⌋ first holds at i = ⌈d/n⌉ - 1.
 */
export function firstReadingDay(total: number, days: number): number {
  if (total <= 0 || days < 1) return 0
  return Math.min(days - 1, Math.ceil(days / total) - 1)
}

/** Every chapter a scope covers, in reading order. */
export function scopeChapters(scope: Scope, index: IndexItem[]): Ref[] {
  const chaptersOf = (b: IndexItem): Ref[] => b.chapters.map((_, i) => ({ slug: b.slug, ch: i + 1 }))
  if (scope.kind === 'sections') {
    const want = new Set(scope.sections)
    return index.filter((b, i) => want.has(sectionOf(b, i))).flatMap(chaptersOf)
  }
  if (scope.kind === 'chapters') {
    const out: Ref[] = []
    for (const r of scope.refs) {
      const dot = r.lastIndexOf('.')
      const slug = r.slice(0, dot)
      const ch = Number(r.slice(dot + 1))
      const b = index.find((x) => x.slug === slug)
      if (b && ch >= 1 && ch <= b.chapters.length) out.push({ slug, ch })
    }
    return out
  }
  if (scope.kind === 'books') {
    const want = new Set(scope.slugs)
    return index.filter((b) => want.has(b.slug)).flatMap(chaptersOf)
  }
  const from = index.findIndex((b) => b.slug === scope.from)
  const to = index.findIndex((b) => b.slug === scope.to)
  if (from < 0 || to < 0) return []
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  return index.slice(lo, hi + 1).flatMap(chaptersOf)
}

/** Day `i`'s share of `all`. The remainder spreads across the pass instead of landing in
 *  a lump at the end: 1,190 chapters over 365 days gives 95 days four and 270 days three,
 *  the first four falling on day 4. A remainder of one has nowhere to spread and does
 *  land last, which is the asked-for behaviour for 31 chapters in a 30-day month. More
 *  days than chapters leaves some days empty, because a chapter is never split. */
export function daySlice<T>(all: T[], days: number, i: number): T[] {
  if (days < 1 || i < 0 || i >= days) return []
  return all.slice(Math.floor((i * all.length) / days), Math.floor(((i + 1) * all.length) / days))
}

/** What this block asks for today. Empty before the start date and after the end of a
 *  non-repeating pass. */
export function todaysReading(block: PlanBlock, index: IndexItem[], today: number): Ref[] {
  return planToday(block, index, today).refs
}

/** Local midnight `k` days from `t`, through Date so a clock change costs nothing. */
const addDays = (t: number, k: number): number => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() + k)
  return d.getTime()
}

/** Everything the planner draws for one block today, computed together so the day
 *  index, the chapters and the countdown cannot disagree about which day it is. */
export interface PlanDay {
  /** Day of the pass, or null before the start date and after a finished pass. */
  day: number | null
  /** Today's chapters. Empty when the pass is not running, or on a day a plan
   *  reading under a chapter a day has nothing to give. */
  refs: Ref[]
  /** Days of the pass left, counting today. */
  left: number | null
  /** Local midnight of the next day that has something, when today has not. */
  nextOn: number | null
  /** What that day will ask for, so an empty day can offer to read it now rather
   *  than being a full stop. */
  nextRefs: Ref[]
}

export function planToday(block: PlanBlock, index: IndexItem[], today: number): PlanDay {
  const none: PlanDay = { day: null, refs: [], left: null, nextOn: null, nextRefs: [] }
  const all = scopeChapters(block.scope, index)
  const day = dayIndex(block, today, firstReadingDay(all.length, block.days))
  if (day === null) return none
  const refs = daySlice(all, block.days, day)
  const left = block.days - day
  if (refs.length) return { day, refs, left, nextOn: null, nextRefs: [] }
  // Nothing today. Walk forward for the next day that has something — one whole pass
  // at most, so a scope with no chapters in it terminates instead of spinning.
  for (let k = 1; k <= block.days; k++) {
    const at = day + k
    const wrapped = at < block.days ? at : block.repeat ? at % block.days : -1
    if (wrapped < 0) break
    const next = daySlice(all, block.days, wrapped)
    if (next.length) return { day, refs, left, nextOn: addDays(today, k), nextRefs: next }
  }
  return { day, refs, left, nextOn: null, nextRefs: [] }
}

export const refKey = (r: Ref) => `${r.slug}.${r.ch}`
export const verseKey = (slug: string, ch: number, v: number) => `${slug}.${ch}.${v}`

/** Verses read. A finished chapter collapses to one `slug.ch` key and its verse keys
 *  are dropped, so a year-long plan holds about 1,200 entries instead of 31,000. */
export type Progress = Record<string, true>

export const chapterRead = (p: Progress, slug: string, ch: number) => !!p[`${slug}.${ch}`]
export const isRead = (p: Progress, slug: string, ch: number, v: number) =>
  !!p[`${slug}.${ch}`] || !!p[verseKey(slug, ch, v)]

/** How much of a day's list is read, as chapters done and chapters asked for. */
export function dayProgress(p: Progress, refs: Ref[]): { done: number; total: number } {
  return { done: refs.filter((r) => chapterRead(p, r.slug, r.ch)).length, total: refs.length }
}

/** Tick one verse. When that completes the chapter, the chapter's verse keys are
 *  replaced by a single chapter key. `count` is the chapter's verse count. */
export function tickVerse(p: Progress, slug: string, ch: number, v: number, count: number): Progress {
  if (p[`${slug}.${ch}`] || p[verseKey(slug, ch, v)]) return p
  const next: Progress = { ...p, [verseKey(slug, ch, v)]: true }
  for (let i = 1; i <= count; i++) if (!next[verseKey(slug, ch, i)]) return next
  for (let i = 1; i <= count; i++) delete next[verseKey(slug, ch, i)]
  next[`${slug}.${ch}`] = true
  return next
}

/** Tick or untick a whole chapter by hand, dropping any partial verse keys either way. */
export function tickChapter(p: Progress, slug: string, ch: number, count: number): Progress {
  const next = { ...p }
  if (next[`${slug}.${ch}`]) delete next[`${slug}.${ch}`]
  else next[`${slug}.${ch}`] = true
  for (let i = 1; i <= count; i++) delete next[verseKey(slug, ch, i)]
  return next
}

/** Move one block up or down. `order` is rewritten for the whole list so it stays a
 *  contiguous 0..n-1 and two blocks can never share a position. */
export function reorder(blocks: PlanBlock[], id: string, delta: -1 | 1): PlanBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  const i = sorted.findIndex((b) => b.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= sorted.length) return blocks
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  return sorted.map((b, k) => ({ ...b, order: k }))
}

const PLANS_KEY = 'plans.v1'
const PROGRESS_KEY = 'plan-progress.v1'

const loadJSON = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function usePlans() {
  const [blocks, setBlocks] = useState<PlanBlock[]>(() => loadJSON<PlanBlock[]>(PLANS_KEY, []))
  const [progress, setProgress] = useState<Progress>(() => loadJSON<Progress>(PROGRESS_KEY, {}))
  useEffect(() => {
    localStorage.setItem(PLANS_KEY, JSON.stringify(blocks))
  }, [blocks])
  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  }, [progress])

  const addBlock = useCallback((b: Omit<PlanBlock, 'id' | 'order'>) => {
    setBlocks((prev) => [...prev, { ...b, id: crypto.randomUUID(), order: prev.length }])
  }, [])

  const updateBlock = useCallback((id: string, patch: Partial<PlanBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })))
  }, [])

  const moveBlock = useCallback((id: string, delta: -1 | 1) => {
    setBlocks((prev) => reorder(prev, id, delta))
  }, [])

  const markVerse = useCallback((slug: string, ch: number, v: number, count: number) => {
    setProgress((prev) => tickVerse(prev, slug, ch, v, count))
  }, [])

  const toggleChapter = useCallback((slug: string, ch: number, count: number) => {
    setProgress((prev) => tickChapter(prev, slug, ch, count))
  }, [])

  const importPlans = useCallback((incoming: { blocks?: PlanBlock[]; progress?: Progress }) => {
    if (incoming.blocks?.length) {
      setBlocks((prev) => {
        const byId = new Map(prev.map((b) => [b.id, b]))
        for (const b of incoming.blocks!) byId.set(b.id, b)
        return [...byId.values()].map((b, i) => ({ ...b, order: b.order ?? i }))
      })
    }
    if (incoming.progress) setProgress((prev) => ({ ...prev, ...incoming.progress }))
  }, [])

  return { blocks, progress, addBlock, updateBlock, removeBlock, moveBlock, markVerse, toggleChapter, importPlans }
}
