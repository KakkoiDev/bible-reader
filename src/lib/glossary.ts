// Lazy loader for the KJV glossary: the words in a verse whose meaning has moved.
//
// Two kinds of entry, built from two sources (see scripts/build-data.mjs):
//
//   'false'  a false friend. Still ordinary English, but the KJV means something else
//            — charity is love, prevent is to go before, suffer is to allow. These are
//            hand-written, because no frequency filter can find a word that is still
//            common and no dictionary can pick which sense a translation intended.
//   'arch'   a word a reader knows they do not know: astonied, purtenance, meteyard.
//            Derived from Webster's 1913, which marks obsolescence explicitly.
//
// One self-contained file per book, like the concordance cards, so opening a verse is
// one small fetch. The whole glossary is ~0.1 MB across all 66 books, small enough that
// it is warmed alongside the concordance rather than waiting for a panel to open.
const BASE = import.meta.env.BASE_URL

/** Bump together with the path if the payload shape changes — see the CacheFirst note
 *  in strongs.ts for why that rule exists. */
const SHAPE = 2 // bumped with the path move to glosses/ when grammar and name kinds were added

// 'grammar' (archaic pronouns/verb endings) and 'name' (proper-name meanings) are
// added by the comprehensive glossary build; the on-disk shape is unchanged, so SHAPE
// stays 1 and existing cached files stay valid.
export type GlossKind = 'false' | 'arch' | 'grammar' | 'name'

interface RawEntry {
  /** Modern equivalent, on false friends only: `charity` → `love`. */
  m?: string
  /** The note. */
  d: string
  k: GlossKind
}

interface BookGloss {
  v?: number
  /** chapter → verse → [[word as printed, entry key], …] */
  t: Record<string, Record<string, [string, string][]>>
  e: Record<string, RawEntry>
}

export interface GlossWord {
  /** The word as the verse prints it, so casing matches what the reader sees. */
  word: string
  key: string
  modern?: string
  note: string
  kind: GlossKind
}

const valid = (j: unknown): j is BookGloss => {
  const g = j as BookGloss | null
  return !!g && g.v === SHAPE && typeof g.t === 'object' && !!g.t && typeof g.e === 'object' && !!g.e
}

const books = new Map<string, BookGloss>()
const loads = new Map<string, Promise<BookGloss | null>>()

const url = (slug: string) => `${BASE}data/glosses/${slug}.json`

function load(slug: string, force = false): Promise<BookGloss | null> {
  const have = books.get(slug)
  if (have && !force) return Promise.resolve(have)
  const running = loads.get(slug)
  if (running && !force) return running
  const p = fetch(url(slug), force ? { cache: 'reload' } : undefined)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      loads.delete(slug)
      if (!valid(j)) return null
      books.set(slug, j)
      return j
    })
    .catch(() => {
      loads.delete(slug)
      return null
    })
  loads.set(slug, p)
  return p
}

/** Warm a book, so opening a verse in it costs nothing. */
export function prefetch(slug: string) {
  if (!slug || books.has(slug)) return
  void load(slug)
}

export const ready = (slug: string) => books.has(slug)

/**
 * The glossed words of one verse, in reading order.
 *
 * `null` means the book would not load, `[]` that this verse has nothing worth
 * glossing — which is the common case, and must not look like a failure.
 */
export async function verseGloss(
  slug: string,
  ch: number,
  v: number,
  force = false,
): Promise<GlossWord[] | null> {
  const book = await load(slug, force)
  if (!book) return null
  const words = book.t[String(ch)]?.[String(v)]
  if (!words?.length) return []
  const out: GlossWord[] = []
  const seen = new Set<string>()
  for (const [word, key] of words) {
    // One row per distinct word: `charity` twice in 1 Corinthians 13:13 is the same
    // note both times, and repeating it says nothing extra.
    if (seen.has(key)) continue
    const e = book.e[key]
    if (!e) continue
    seen.add(key)
    out.push({ word, key, modern: e.m, note: e.d, kind: e.k })
  }
  return out
}
