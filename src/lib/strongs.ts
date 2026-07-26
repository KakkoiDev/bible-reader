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
// A single shared 2.1 MB dictionary used to load before the card could render, which
// is what made the first open feel slow: 610 KB over the wire to show twelve words.
// Nothing is precached either way, so `prefetch` warms the card file when a book is
// opened and the first tap has nothing left to wait for.
const BASE = import.meta.env.BASE_URL

/** `[lemma, transliteration]`, kept positional because it repeats per book. */
type WordMeta = [string, string]
/** `[strongs_def, kjv_def]`. */
type DefMeta = [string, string]

/** `{ t: { "13": { "13": [["charity","G26"], …] } }, w: { G26: ["ἀγάπη","agápē"] } }` */
interface BookCard {
  t: Record<string, Record<string, [string, string][]>>
  w: Record<string, WordMeta>
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

const EMPTY: BookCard = { t: {}, w: {} }

const cards = new Map<string, BookCard>()
const cardLoads = new Map<string, Promise<BookCard>>()
const defs = new Map<string, Record<string, DefMeta>>()
const defLoads = new Map<string, Promise<Record<string, DefMeta>>>()

/** One request per book, shared between concurrent callers, cached for the session.
 *  A failure is not cached, so a reader who was offline can simply try again. */
function loadOnce<T>(
  slug: string,
  done: Map<string, T>,
  inFlight: Map<string, Promise<T>>,
  url: string,
  empty: T,
): Promise<T> {
  const have = done.get(slug)
  if (have) return Promise.resolve(have)
  const running = inFlight.get(slug)
  if (running) return running
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : empty))
    .then((j: T) => {
      done.set(slug, j)
      inFlight.delete(slug)
      return j
    })
    .catch(() => {
      inFlight.delete(slug)
      return empty
    })
  inFlight.set(slug, p)
  return p
}

const loadCard = (slug: string) =>
  loadOnce(slug, cards, cardLoads, `${BASE}data/strongs/${slug}.json`, EMPTY)

const loadDefs = (slug: string) =>
  loadOnce(slug, defs, defLoads, `${BASE}data/strongs/${slug}-def.json`, {} as Record<string, DefMeta>)

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
 */
export async function verseWords(slug: string, ch: number, v: number): Promise<StrongWord[]> {
  const card = await loadCard(slug)
  const words = card.t?.[String(ch)]?.[String(v)]
  if (!words?.length) return []
  const out: StrongWord[] = []
  for (const [word, code] of words) {
    const meta = card.w?.[code]
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
