// Lazy loaders for the KJV concordance: which Strong's number each KJV word
// carries, what the original word is, and what it means.
//
// Deliberately KJV-only. The tags come from eBible's tagged KJV (see
// scripts/fetch-strongs.mjs) and are keyed to *its* word choices, so they are
// meaningful against the English and nothing else — the other ten editions
// translate from the same originals but choose different words.
//
// Two levels, matching what the card actually shows (the same split Blue Letter
// Bible uses: a word list, with the definition a tap away):
//
//   <slug>.json      tags + lemma/transliteration — a median 18 KB gzipped
//   <slug>-def.json  the Strong's definitions, only once a word is tapped
//
// These live under data/concordance/, and the payload carries a shape version, both
// because of one bug worth not repeating: the files first shipped under data/strongs/
// with a different shape at the same URLs, and the service worker caches them
// CacheFirst. Every reader who had opened the panel was then served the old shape
// from disk forever, `t` came back undefined, and the panel silently rendered
// nothing. Changed shape now means a changed path, a checked version, and a load
// error that says so instead of looking like an empty verse.
//
// A single shared 2.1 MB dictionary used to load before the card could render, which
// is what made the first open feel slow: 610 KB over the wire to show twelve words.
// Nothing is precached either way, so `prefetch` warms the card file when a book is
// opened and the first tap has nothing left to wait for.
const BASE = import.meta.env.BASE_URL

/** Bump together with the path when the payload shape changes. */
const SHAPE = 2

/** `[lemma, transliteration]`, kept positional because it repeats per book. */
type WordMeta = [string, string]
/** `[strongs_def, kjv_def]`. */
type DefMeta = [string, string]

/** `{ v: 2, t: { "13": { "13": [["charity","G26"], …] } }, w: { G26: ["ἀγάπη","agápē"] } }` */
interface BookCard {
  v?: number
  t: Record<string, Record<string, [string, string][]>>
  w: Record<string, WordMeta>
}

/** Whether a payload is the shape this build expects. Anything else is treated as a
 *  failed load, never as a verse with no tagged words. */
const validCard = (j: unknown): j is BookCard => {
  const c = j as BookCard | null
  return !!c && c.v === SHAPE && typeof c.t === 'object' && !!c.t && typeof c.w === 'object' && !!c.w
}

export interface StrongWord {
  /** The KJV word as it appears in the verse. */
  word: string
  /** e.g. `G26`, `H430`. */
  code: string
  lemma: string
  translit: string
}

export interface StrongDef {
  def: string
  /** How the KJV renders this word elsewhere. */
  kjv: string
}

const cards = new Map<string, BookCard>()
const cardLoads = new Map<string, Promise<BookCard | null>>()
const defs = new Map<string, Record<string, DefMeta>>()
const defLoads = new Map<string, Promise<Record<string, DefMeta>>>()

const cardUrl = (slug: string) => `${BASE}data/concordance/${slug}.json`
const defUrl = (slug: string) => `${BASE}data/concordance/${slug}-def.json`

/**
 * Drop one URL from the service worker's runtime cache.
 *
 * The cache is CacheFirst, so a bad entry would otherwise be served for good and no
 * amount of retrying from the page would get past it. Deleting first is what makes
 * the retry button able to actually fix something.
 */
async function evict(url: string) {
  try {
    const cache = await caches.open('bible-editions')
    await cache.delete(url)
  } catch {
    /* no Cache Storage, or no such entry — nothing to undo */
  }
}

/** One request per book, shared between concurrent callers, cached for the session.
 *  Returns null on failure, which is deliberately distinct from a book that loaded
 *  and has no tags: only the former should surface an error. */
function loadCard(slug: string, force = false): Promise<BookCard | null> {
  const have = cards.get(slug)
  if (have && !force) return Promise.resolve(have)
  const running = cardLoads.get(slug)
  if (running && !force) return running
  const url = cardUrl(slug)
  const p = (force ? evict(url) : Promise.resolve())
    .then(() => fetch(url, force ? { cache: 'reload' } : undefined))
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      cardLoads.delete(slug)
      if (!validCard(j)) return null
      cards.set(slug, j)
      return j
    })
    .catch(() => {
      cardLoads.delete(slug)
      return null
    })
  cardLoads.set(slug, p)
  return p
}

function loadDefs(slug: string): Promise<Record<string, DefMeta>> {
  const have = defs.get(slug)
  if (have) return Promise.resolve(have)
  const running = defLoads.get(slug)
  if (running) return running
  const p = fetch(defUrl(slug))
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: Record<string, DefMeta>) => {
      const ok = j && typeof j === 'object' ? j : {}
      defs.set(slug, ok)
      defLoads.delete(slug)
      return ok
    })
    .catch(() => {
      defLoads.delete(slug)
      return {} as Record<string, DefMeta>
    })
  defLoads.set(slug, p)
  return p
}

/** Warm the card file for a book, so opening a verse in it costs nothing.
 *  Fire and forget: failures are already swallowed by loadOnce. */
export function prefetch(slug: string) {
  if (!slug || cards.has(slug)) return
  void loadCard(slug)
}

/**
 * Warm the definitions once the card is actually on screen, so tapping a word is
 * instant rather than showing a spinner.
 *
 * Not part of `prefetch`: the definitions are the larger half, and a reader who
 * never opens a verse has no use for them. Paying for them at the moment the panel
 * renders puts the cost on the readers who will use it, and overlaps the fetch with
 * reading the word list.
 */
export function prefetchDefs(slug: string) {
  if (!slug || defs.has(slug)) return
  void loadDefs(slug)
}

/** True once a book's cards are in memory, so the panel can skip its spinner. */
export const cardReady = (slug: string) => cards.has(slug)

/**
 * The tagged words of one verse, in the order the KJV reads them.
 *
 * Repeats are kept: 1 Corinthians 13:13 says `charity` twice, and collapsing them
 * would misrepresent the verse. Words whose code has no entry are dropped rather
 * than shown as a bare number.
 *
 * `null` means the book could not be loaded, as opposed to `[]` for a verse that
 * genuinely carries no tags — three verses in the whole KJV. The caller must tell
 * these apart, because conflating them is what made a broken load look like an
 * ordinary empty panel.
 */
export async function verseWords(
  slug: string,
  ch: number,
  v: number,
  force = false,
): Promise<StrongWord[] | null> {
  const card = await loadCard(slug, force)
  if (!card) return null
  const words = card.t[String(ch)]?.[String(v)]
  if (!words?.length) return []
  const out: StrongWord[] = []
  for (const [word, code] of words) {
    const meta = card.w[code]
    if (!meta) continue
    out.push({ word, code, lemma: meta[0], translit: meta[1] })
  }
  return out
}

/** The definition for one code, fetched per book the first time any word is tapped. */
export async function wordDef(slug: string, code: string): Promise<StrongDef | null> {
  const all = await loadDefs(slug)
  const d = all[code]
  return d ? { def: d[0], kjv: d[1] } : null
}
