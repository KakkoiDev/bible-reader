// Lazy in-memory search index built from the (already cached) per-book JSON.
import type { IndexItem, BookData, Lang } from './types'

const BASE = import.meta.env.BASE_URL

export interface Entry {
  slug: string
  ch: number
  v: number
  en: string
  fr: string
  ja: string
  enL: string
  frL: string
}
const plainEn = (t: string) => t.replace(/[{}]/g, '')
const plainJa = (t: string) => t.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1') // show kanji, drop readings

let idx: Entry[] | null = null
let building: Promise<Entry[]> | null = null
export function buildIndex(): Promise<Entry[]> {
  if (idx) return Promise.resolve(idx)
  if (!building)
    building = (async () => {
      const index: IndexItem[] = await fetch(`${BASE}data/index.json`).then((r) => r.json())
      const books: BookData[] = await Promise.all(
        index.map((b) => fetch(`${BASE}data/${b.slug}.json`).then((r) => r.json())),
      )
      const out: Entry[] = []
      for (const b of books)
        for (const c of b.chapters)
          for (const vv of c.verses) {
            const en = plainEn(vv.en)
            const ja = plainJa(vv.ja)
            out.push({ slug: b.slug, ch: c.n, v: vv.v, en, fr: vv.fr, ja, enL: en.toLowerCase(), frL: vv.fr.toLowerCase() })
          }
      idx = out
      return out
    })()
  return building
}

export interface Hit {
  slug: string
  ch: number
  v: number
  lang: Lang
  text: string
  at: number
  len: number
}
export function runSearch(entries: Entry[], q: string, limit = 150): Hit[] {
  const query = q.trim()
  if (query.length < 2) return []
  const ql = query.toLowerCase()
  const hits: Hit[] = []
  for (const e of entries) {
    let at = e.enL.indexOf(ql)
    if (at >= 0) hits.push({ slug: e.slug, ch: e.ch, v: e.v, lang: 'en', text: e.en, at, len: query.length })
    else if ((at = e.frL.indexOf(ql)) >= 0)
      hits.push({ slug: e.slug, ch: e.ch, v: e.v, lang: 'fr', text: e.fr, at, len: query.length })
    else if ((at = e.ja.indexOf(query)) >= 0)
      hits.push({ slug: e.slug, ch: e.ch, v: e.v, lang: 'ja', text: e.ja, at, len: query.length })
    if (hits.length >= limit) break
  }
  return hits
}

// Common short forms → canonical English book name.
const ALIAS: Record<string, string> = {
  gen: 'genesis', ex: 'exodus', exod: 'exodus', lev: 'leviticus', num: 'numbers', deut: 'deuteronomy',
  dt: 'deuteronomy', josh: 'joshua', jdg: 'judges', ru: 'ruth', ps: 'psalms', psalm: 'psalms', pss: 'psalms',
  pr: 'proverbs', prov: 'proverbs', ecc: 'ecclesiastes', eccl: 'ecclesiastes', song: 'song of solomon',
  sos: 'song of solomon', isa: 'isaiah', jer: 'jeremiah', lam: 'lamentations', eze: 'ezekiel', ezek: 'ezekiel',
  dan: 'daniel', hos: 'hosea', mt: 'matthew', mat: 'matthew', matt: 'matthew', mk: 'mark', mrk: 'mark',
  lk: 'luke', jn: 'john', jhn: 'john', ac: 'acts', ro: 'romans', rom: 'romans', gal: 'galatians',
  eph: 'ephesians', php: 'philippians', phil: 'philippians', col: 'colossians', heb: 'hebrews', jas: 'james',
  rev: 'revelation', apoc: 'revelation',
}
const collapse = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Parse "John 3:16", "ps 23", "1 cor 13:4" → a location, or null. */
export function parseReference(q: string, index: IndexItem[]): { slug: string; ch: number; v?: number } | null {
  const m = q.trim().match(/^([1-3]?\s*[a-zà-ÿ.]+)\s*\.?\s*(\d+)(?:\s*[:.]\s*(\d+))?\s*$/i)
  if (!m) return null
  const bookKey = collapse(m[1])
  const ch = parseInt(m[2], 10)
  const v = m[3] ? parseInt(m[3], 10) : undefined
  const target = ALIAS[bookKey]
  let book =
    (target && index.find((b) => collapse(b.en) === collapse(target))) ||
    index.find((b) => collapse(b.en) === bookKey) ||
    index.find((b) => collapse(b.en).startsWith(bookKey))
  if (!book || ch < 1 || ch > book.chapters) return null
  return { slug: book.slug, ch, v }
}
