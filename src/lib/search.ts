// Lazy in-memory search index over the (already cached) per-edition book JSON.
//
// Indexing is per edition and only for the editions a reader has visible: with many
// editions an index over everything would be ~340k verse records, so the cost is
// kept proportional to what's actually on screen.
import { loadBook } from './canon'
import type { IndexItem } from './types'
import { BY_ID, type Lang } from './versions'

export interface Entry {
  slug: string
  ch: number
  v: number
  text: string
  /** Case- and punctuation-folded copy used for matching. */
  fold: string
}

/**
 * Fold the punctuation that differs between editions and keyboards.
 *
 * The editions are not consistent with each other: the KJV and Almeida use a
 * straight apostrophe (U+0027) while the KJF uses a typographic one (U+2019) —
 * 988 of them in John alone. A reader types whichever their keyboard produces, so
 * without folding, searching `l'Esprit` or `God's` silently returns nothing.
 *
 * Every substitution is one character for one character, because `Hit.ranges`
 * indexes into the unfolded text to build the snippet — a fold that changed length
 * would slide the highlight off the match. This is why the fold deliberately does
 * *not* strip Arabic tashkeel or Hebrew niqqud the way `collapse` does below:
 * removing characters is not length-preserving, so it would need a folded→original
 * offset map. Book-name lookup can afford that; snippet highlighting cannot.
 */
const FOLD: Record<string, string> = {
  '’': "'", '‘': "'", '‛': "'", 'ʼ': "'", 'ʹ': "'",
  '´': "'", '`': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"', '″': '"',
  '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  ' ': ' ', ' ': ' ', ' ': ' ',
}
const FOLDABLE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g')
export const foldText = (s: string) => s.replace(FOLDABLE, (c) => FOLD[c]).toLowerCase()

const plainKjv = (t: string) => t.replace(/[{}]/g, '')
const plainRuby = (t: string) => t.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1') // kanji, drop readings

const strip = (lang: Lang, t: string) => {
  const m = BY_ID[lang].markup
  return m === 'kjv' ? plainKjv(t) : m === 'ruby' ? plainRuby(t) : t
}

/**
 * One book of one edition, indexed. Keyed `<lang>/<slug>`.
 *
 * Per book, not per edition. Indexing a whole edition meant the first query — any
 * query — fetched 66 book files for every visible edition, 198 of them with three
 * on and 924 with all fourteen, and took 5.5 seconds to its first result whatever
 * was typed. Per book, the search can start with the book the reader has open and
 * widen from there, and scoping a query to one book costs one fetch an edition.
 */
const built = new Map<string, Entry[]>()
const building = new Map<string, Promise<Entry[]>>()

function indexBook(lang: Lang, slug: string): Promise<Entry[]> {
  const key = `${lang}/${slug}`
  const done = built.get(key)
  if (done) return Promise.resolve(done)
  const inFlight = building.get(key)
  if (inFlight) return inFlight
  const p = loadBook(lang, slug).then((book) => {
      const out: Entry[] = []
      for (const c of book.chapters)
        for (const vv of c.verses) {
          const text = strip(lang, vv.t)
          out.push({ slug, ch: c.n, v: vv.v, text, fold: foldText(text) })
        }
      built.set(key, out)
      building.delete(key)
      return out
    })
  building.set(key, p)
  return p
}

/** One matched stretch of a verse, in coordinates of the *unfolded* `text`. */
export interface Range {
  at: number
  len: number
}

export interface Hit {
  slug: string
  ch: number
  v: number
  lang: Lang
  text: string
  /** Every matched stretch, ascending and non-overlapping. Never empty. */
  ranges: Range[]
}

// CJK searches are meaningful at one character; latin needs two to avoid noise.
export const minQueryLen = (q: string) => (/[぀-ヿ㐀-鿿豈-﫿]/.test(q) ? 1 : 2)

/**
 * Split a query into the terms a verse must contain.
 *
 * Bare words are separate terms, so `faith hope charity` finds the verse that
 * has all three whatever punctuation sits between them — a single substring
 * scan missed 1 Corinthians 13:13, because the text reads `faith, hope,` and
 * the comma is not in the query.
 *
 * A quoted run stays one term, which is how you ask for an exact phrase:
 * `"the beginning"` will not match `the` and `beginning` far apart. An unclosed
 * quote is treated as if closed at the end, so results keep updating while the
 * reader is still typing.
 */
export function parseQuery(q: string): string[] {
  const terms: string[] = []
  const re = /"([^"]*)"?|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(q))) {
    if (m[0] === '') {
      re.lastIndex++ // a zero-width match would spin forever
      continue
    }
    const term = (m[1] ?? m[2] ?? '').trim()
    if (term) terms.push(term)
  }
  return terms
}

/** Cap per term: a snippet only ever shows a handful, and `and` occurs ~1200
 *  times in some chapters — collecting every hit is work nothing reads. */
const MAX_PER_TERM = 12

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/
/** Hebrew, Arabic, and the Arabic presentation forms. */
const SEMITIC = /[֐-׿؀-ۿיִ-ﭏﹰ-﻿]/
const WORDISH = /[\p{L}\p{N}]/u

interface Term {
  /** Folded needle. */
  t: string
  /** Anchor the match to the start of a word rather than anywhere inside one. */
  anchored: boolean
  /** Also require the word to *end* here, i.e. match the whole word only. */
  whole: boolean
}

/**
 * A term matches from the *start of a word* onwards, so `believ` finds
 * `believeth` — prefix matching is most of why search is useful on a text this
 * archaic — while `am` no longer matches `firmament` (f-i-rm-am-ent), which under
 * plain substring rules also made `i` match it and turned `I am` into a query
 * satisfied by nearly every verse.
 *
 * Two script families opt out, because for them "start of word" is the wrong unit:
 *
 * - **CJK** has no spaces at all, so there is no word start to anchor to.
 * - **Hebrew and Arabic** attach particles to the front of a word — the
 *   conjunctive ו, the article ה and ال — so anchoring would make `ישראל` miss
 *   `וישראל`, i.e. hide the very verses the reader wants.
 *
 * The mode is chosen from the *term's* script, not the edition's: a Latin query
 * against a Chinese edition finds nothing either way.
 *
 * One further tightening: a one- or two-letter anchored term must match a *whole*
 * word. As a prefix, `i` legitimately matches `in`, `is` and `Israel` and `am`
 * matches `amongst`, so `I am` still pulled 500+ verses. The shorter the term, the
 * stricter it has to be to mean anything.
 */
const asTerm = (t: string): Term => {
  const anchored = !CJK.test(t) && !SEMITIC.test(t)
  return { t, anchored, whole: anchored && t.length <= 2 }
}

function findFrom(fold: string, term: Term, from: number): number {
  for (let at = fold.indexOf(term.t, from); at >= 0; at = fold.indexOf(term.t, at + 1)) {
    if (term.anchored && at > 0 && WORDISH.test(fold[at - 1])) continue
    const end = at + term.t.length
    if (term.whole && end < fold.length && WORDISH.test(fold[end])) continue
    return at
  }
  return -1
}

/** Every occurrence of each term, merged where they overlap or abut.
 *  Overlap is normal: `god` and `godly` both match `godly`, and rendering two
 *  <mark>s over the same characters would double-wrap them. */
function collectRanges(fold: string, terms: Term[]): Range[] {
  const raw: Range[] = []
  for (const term of terms) {
    let from = 0
    for (let n = 0; n < MAX_PER_TERM; n++) {
      const at = findFrom(fold, term, from)
      if (at < 0) break
      raw.push({ at, len: term.t.length })
      from = at + 1 // +1, not +len: overlapping repeats (`aa` in `aaa`) still count
    }
  }
  raw.sort((a, b) => a.at - b.at || b.len - a.len)
  const out: Range[] = []
  for (const r of raw) {
    const last = out[out.length - 1]
    if (last && r.at <= last.at + last.len) {
      last.len = Math.max(last.len, r.at + r.len - last.at)
    } else out.push({ ...r })
  }
  return out
}

/** What a search found: the page of results, and how many verses matched in all. */
export interface SearchResult {
  hits: Hit[]
  /** Every verse that matched, not just the ones that fitted the cap. */
  total: number
  /** False while more books are still being indexed. */
  done: boolean
}

export interface SearchOptions {
  /** Books to search, in the order to index them. Put the open book first and the
   *  first partial result arrives in one fetch an edition instead of sixty-six. */
  slugs: string[]
  /** Canonical position per slug, so results come back in canon order however the
   *  books were indexed. */
  order: Map<string, number>
  /** Results kept. A list longer than this is no more useful than this one — but
   *  `total` still counts them all, so the panel can say a cap was reached. */
  limit?: number
  /** Set `cancelled` to abandon a query whose keystroke has been superseded. */
  signal?: { cancelled: boolean }
  /** Called after each book with everything found so far, so a whole-Bible query
   *  fills in as it goes rather than showing nothing for five seconds. */
  onPartial?: (r: SearchResult) => void
}

interface Match {
  at: number
  ch: number
  v: number
  k: number
  e: Entry
}

/**
 * Search the given books across the given editions.
 *
 * A verse matches when it contains *every* term; order and distance are free.
 *
 * Two things changed here. Books are indexed one at a time, in the order the caller
 * asks for, so the open book can be searched first and the rest can fill in behind
 * it — the whole-edition index cost 198 fetches and 5.5 seconds before the first
 * result appeared, whatever had been typed. And the cap is applied to a canon-sorted
 * shortlist rather than by stopping the scan: the scan now always runs to the end,
 * which is what lets the panel say "547 verses match, showing the first 150" instead
 * of silently handing back a slice of Genesis.
 *
 * The shortlist is bounded at `limit`, so counting 28 021 matches for `the` costs
 * one comparison each rather than 28 021 records.
 */
export async function search(langs: Lang[], q: string, opts: SearchOptions): Promise<SearchResult> {
  const query = q.trim()
  const empty: SearchResult = { hits: [], total: 0, done: true }
  // Gate on the whole query, not per term, so `I am` still searches: either term
  // alone is below the latin minimum, together they are a real query.
  if (query.length < minQueryLen(query)) return empty
  const terms = parseQuery(query).map(foldText).filter(Boolean).map(asTerm)
  if (!terms.length) return empty

  const limit = opts.limit ?? 150
  // Canon position, then chapter, then verse, then the edition's place in `langs` —
  // so the editions interleave by location rather than every English hit landing
  // before the first French one.
  const cmp = (a: Match, b: Match) => a.at - b.at || a.ch - b.ch || a.v - b.v || a.k - b.k
  const keep: Match[] = []
  const offer = (m: Match) => {
    if (keep.length >= limit && cmp(m, keep[keep.length - 1]) >= 0) return
    let i = keep.length
    while (i > 0 && cmp(keep[i - 1], m) > 0) i--
    keep.splice(i, 0, m)
    if (keep.length > limit) keep.pop()
  }
  // Ranges are built only for the verses that survive the cap: `and` occurs some
  // 1200 times in a single chapter and nothing reads the positions of the rest.
  const render = (): Hit[] =>
    keep.map((m) => ({
      slug: m.e.slug,
      ch: m.e.ch,
      v: m.e.v,
      lang: langs[m.k],
      text: m.e.text,
      ranges: collectRanges(m.e.fold, terms),
    }))

  let total = 0
  for (const slug of opts.slugs) {
    const books = await Promise.all(langs.map((l) => indexBook(l, slug)))
    if (opts.signal?.cancelled) return { hits: render(), total, done: false }
    const at = opts.order.get(slug) ?? 0
    const longest = Math.max(0, ...books.map((e) => e.length))
    for (let i = 0; i < longest; i++) {
      for (let k = 0; k < books.length; k++) {
        const e = books[k][i]
        if (!e) continue
        // Cheap reject first: most verses fail on the rarest term, and scanning
        // for positions before knowing the verse qualifies is wasted work.
        let all = true
        for (const term of terms)
          if (findFrom(e.fold, term, 0) < 0) {
            all = false
            break
          }
        if (!all) continue
        total++
        offer({ at, ch: e.ch, v: e.v, k, e })
      }
    }
    opts.onPartial?.({ hits: render(), total, done: false })
  }
  return { hits: render(), total, done: true }
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
  // Short forms of *John*, the one name the substring fallback below gets wrong.
  // That fallback picks the shortest official name containing the query, which is
  // right for Arabic (إنجيل يوحنا is shorter than رسالة يوحنا الأولى) and inverts
  // here: ヨハネの黙示録 ("Apocalypse", 7) is shorter than ヨハネによる福音書
  // ("Gospel according to", 9), so a reader typing the placeholder's own example
  // ヨハネ3:16 landed in Revelation. 約翰 / 约翰 tie at four characters and resolve
  // to nothing; Johano (Esperanto) matches no official name at all. The fallback
  // itself is sound — every one of the 831 full names resolves correctly — so this
  // is four aliases rather than a new heuristic. scripts/check-references.mjs
  // replays the whole table.
  johano: 'john',
  'ヨハネ': 'john',
  '約翰': 'john',
  '约翰': 'john',
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
