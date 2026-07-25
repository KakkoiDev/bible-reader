// Lazy in-memory search index over the (already cached) per-edition book JSON.
//
// Indexing is per edition and only for the editions a reader has visible: at 11
// editions an index over everything would be ~340k verse records, so the cost is
// kept proportional to what's actually on screen.
import type { IndexItem, EditionBook } from './types'
import { BY_ID, type Lang } from './versions'

const BASE = import.meta.env.BASE_URL

export interface Entry {
  slug: string
  ch: number
  v: number
  text: string
  /** Case-folded copy for latin-script matching; identical to `text` for CJK/RTL. */
  fold: string
}

const plainKjv = (t: string) => t.replace(/[{}]/g, '')
const plainRuby = (t: string) => t.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1') // kanji, drop readings

const strip = (lang: Lang, t: string) => {
  const m = BY_ID[lang].markup
  return m === 'kjv' ? plainKjv(t) : m === 'ruby' ? plainRuby(t) : t
}

const built = new Map<Lang, Entry[]>()
const building = new Map<Lang, Promise<Entry[]>>()

function indexEdition(lang: Lang): Promise<Entry[]> {
  const done = built.get(lang)
  if (done) return Promise.resolve(done)
  const inFlight = building.get(lang)
  if (inFlight) return inFlight
  const p = (async () => {
    const index: IndexItem[] = await fetch(`${BASE}data/index.json`).then((r) => r.json())
    const books = await Promise.all(
      index.map((b) =>
        fetch(`${BASE}data/${lang}/${b.slug}.json`)
          .then((r) => (r.ok ? r.json() : { chapters: [] }))
          .catch(() => ({ chapters: [] }) as EditionBook),
      ),
    )
    const out: Entry[] = []
    books.forEach((book: EditionBook, i) => {
      const slug = index[i].slug
      for (const c of book.chapters)
        for (const vv of c.verses) {
          const text = strip(lang, vv.t)
          out.push({ slug, ch: c.n, v: vv.v, text, fold: text.toLowerCase() })
        }
    })
    built.set(lang, out)
    building.delete(lang)
    return out
  })()
  building.set(lang, p)
  return p
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

// CJK searches are meaningful at one character; latin needs two to avoid noise.
export const minQueryLen = (q: string) => (/[぀-ヿ㐀-鿿豈-﫿]/.test(q) ? 1 : 2)

/** Search across the given editions, in the order supplied. */
export async function search(langs: Lang[], q: string, limit = 150): Promise<Hit[]> {
  const query = q.trim()
  if (query.length < minQueryLen(query)) return []
  const indexes = await Promise.all(langs.map(indexEdition))
  const ql = query.toLowerCase()
  const hits: Hit[] = []
  // Walk verse-major so results interleave editions by location rather than
  // returning every English hit before the first French one.
  const longest = Math.max(0, ...indexes.map((e) => e.length))
  for (let i = 0; i < longest && hits.length < limit; i++) {
    for (let k = 0; k < indexes.length && hits.length < limit; k++) {
      const e = indexes[k][i]
      if (!e) continue
      const at = e.fold.indexOf(ql)
      if (at >= 0) hits.push({ slug: e.slug, ch: e.ch, v: e.v, lang: langs[k], text: e.text, at, len: query.length })
    }
  }
  return hits
}

/* -------------------------- reference parsing -------------------------- */

// Common short forms → canonical English book name.
const ALIAS: Record<string, string> = {
  // English
  gen: 'genesis', ex: 'exodus', exod: 'exodus', lev: 'leviticus', num: 'numbers', deut: 'deuteronomy',
  dt: 'deuteronomy', josh: 'joshua', jdg: 'judges', ru: 'ruth', ps: 'psalms', psalm: 'psalms', pss: 'psalms',
  pr: 'proverbs', prov: 'proverbs', ecc: 'ecclesiastes', eccl: 'ecclesiastes', song: 'song of solomon',
  sos: 'song of solomon', isa: 'isaiah', jer: 'jeremiah', lam: 'lamentations', eze: 'ezekiel', ezek: 'ezekiel',
  dan: 'daniel', hos: 'hosea', mt: 'matthew', mat: 'matthew', matt: 'matthew', mk: 'mark', mrk: 'mark',
  lk: 'luke', jn: 'john', jhn: 'john', ac: 'acts', ro: 'romans', rom: 'romans', gal: 'galatians',
  eph: 'ephesians', php: 'philippians', phil: 'philippians', col: 'colossians', heb: 'hebrews', jas: 'james',
  rev: 'revelation', apoc: 'revelation',
  // French
  gn: 'genesis', lv: 'leviticus', nb: 'numbers', dtn: 'deuteronomy', jos: 'joshua', jg: 'judges',
  psaume: 'psalms', psaumes: 'psalms', pv: 'proverbs', ec: 'ecclesiastes', ct: 'song of solomon',
  es: 'isaiah', jr: 'jeremiah', ez: 'ezekiel', mc: 'mark', lc: 'luke', ja: 'john', ac2: 'acts',
  rm: 'romans', ga: 'galatians', ep: 'ephesians', ph: 'philippians', he: 'hebrews', jc: 'james',
  ap: 'revelation', mat2: 'matthew',
  // Spanish / Portuguese
  gen2: 'genesis', exo: 'exodus', dt2: 'deuteronomy', jue: 'judges', sal: 'psalms', salmo: 'psalms',
  salmos: 'psalms', prv: 'proverbs', ecl: 'ecclesiastes', cnt: 'song of solomon', is: 'isaiah',
  ez2: 'ezekiel', mateo: 'matthew', mateus: 'matthew', marcos: 'mark', lucas: 'luke', juan: 'john',
  joao: 'john', hechos: 'acts', atos: 'acts', romanos: 'romans', apocalipsis: 'revelation',
  apocalipse: 'revelation',
}

/**
 * Fold a book name or query to a comparable key.
 *
 * Each script needs its own treatment: NFD + combining-mark stripping handles Latin
 * and Greek, but Arabic tashkeel (U+064B–U+0652) and Hebrew niqqud/te'amim
 * (U+0591–U+05C7) are separate ranges that NFD leaves alone — and the printed
 * editions are fully vocalised while readers type unvocalised. Letter variants that
 * readers treat as one (أ/إ/ٱ vs ا, ς vs σ) are unified too.
 */
const collapse = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Latin + Greek combining accents
    .replace(/[ً-ْٰـ]/g, '') // Arabic tashkeel + tatweel
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud + cantillation
    .replace(/[آأإاٱ]/g, 'ا') // آأإٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ς/g, 'σ') // ς → σ
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** Arabic-Indic, Eastern Arabic and fullwidth digits → ASCII. */
const asciiDigits = (s: string) =>
  s.replace(/[٠-٩۰-۹０-９]/g, (d) => {
    const c = d.codePointAt(0)!
    const base = c >= 0xff10 ? 0xff10 : c >= 0x06f0 ? 0x06f0 : 0x0660
    return String(c - base)
  })

/** Book-name lookup across every edition, so a reference resolves in any of them. */
export function bookLookup(index: IndexItem[]): Map<string, string> {
  const map = new Map<string, string>()
  const put = (key: string, slug: string) => {
    const k = collapse(key)
    if (k && !map.has(k)) map.set(k, slug)
  }
  for (const b of index) for (const name of Object.values(b.names)) if (name) put(name, b.slug)
  // Aliases resolve via the English name, so they work whatever the UI language is.
  const bySlug = new Map(index.map((b) => [collapse(b.names.en), b.slug]))
  for (const [alias, en] of Object.entries(ALIAS)) {
    const slug = bySlug.get(collapse(en))
    // The numbered keys above (ac2, dt2…) exist only to keep distinct aliases for
    // the same short form across languages; strip the digit before registering.
    if (slug) put(alias.replace(/\d$/, ''), slug)
  }
  return map
}

/**
 * Parse a reference in any edition's language:
 *   "John 3:16"  "ps 23"  "1 cor 13:4"  "マタイ15:3"  "馬太福音15章3節"
 *   "Mateo 15:3" "إنجيل متى ١٥:٣"  "תְּהִלִּים 23"
 */
export function parseReference(
  q: string,
  index: IndexItem[],
  lookup = bookLookup(index),
): { slug: string; ch: number; v?: number } | null {
  const s = asciiDigits(q.trim())
    .replace(/[：]/g, ':')
    .replace(/[、，]/g, ' ')
  // Leading book part (anything before the first run of digits), then ch[:v].
  // CJK chapter/verse markers (章 節 篇) act as separators.
  const m = /^(\D+?)\s*(\d+)\s*[章篇]?\s*(?:[:.,·]\s*|節\s*|节\s*)?(\d+)?\s*[節节]?\s*$/u.exec(s)
  if (!m) return null
  const bookKey = collapse(m[1])
  if (!bookKey) return null
  const ch = parseInt(m[2], 10)
  const v = m[3] ? parseInt(m[3], 10) : undefined

  let slug = lookup.get(bookKey)
  if (!slug) {
    // Prefix match — "Matth", "馬太", "Gen" all narrow to one book or nothing.
    const byPrefix = new Set<string>()
    for (const [k, s2] of lookup) if (k.startsWith(bookKey)) byPrefix.add(s2)
    if (byPrefix.size === 1) slug = [...byPrefix][0]
  }
  if (!slug && bookKey.length >= 3) {
    // Substring match. Several editions title books with a genre prefix the reader
    // won't type — إنجيل يوحنا ("Gospel of John"), ΚΑΤΑ ΜΑΤΘΑΙΟΝ ("According to
    // Matthew") — so the name they know sits in the middle rather than at the front.
    //
    // A bare "يوحنا" matches the Gospel *and* 1/2/3 John (رسالة يوحنا الأولى), so
    // requiring uniqueness would reject it. Resolve to the closest match instead:
    // the shortest name containing the query, and only when it is strictly shorter
    // than every rival. That gives the Gospel for "يوحنا" while leaving genuinely
    // tied names — 1 Samuel / 2 Samuel, equal length once folded — unresolved, so
    // the reader is prompted to include the numeral.
    let best: { slug: string; len: number } | null = null
    let tied = false
    for (const [k, s2] of lookup) {
      if (!k.includes(bookKey)) continue
      if (!best || k.length < best.len) {
        best = { slug: s2, len: k.length }
        tied = false
      } else if (k.length === best.len && s2 !== best.slug) tied = true
    }
    if (best && !tied) slug = best.slug
  }
  if (!slug) return null
  const book = index.find((b) => b.slug === slug)
  if (!book || ch < 1 || ch > book.chapters.length) return null
  if (v != null && (v < 1 || v > book.chapters[ch - 1])) return { slug, ch }
  return { slug, ch, v }
}
