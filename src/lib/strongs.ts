// Lazy loaders for the KJV concordance: which Strong's number each KJV word
// carries, and what that number means.
//
// Deliberately KJV-only. The tags come from eBible's tagged KJV (see
// scripts/fetch-strongs.mjs) and are keyed to *its* word choices, so they are
// meaningful against the English and nothing else — the other ten editions
// translate from the same originals but choose different words.
//
// Nothing here is precached: the dictionary is 1.7 MB and the tags 6.7 MB across
// all 66 books, so both load on demand, per book, and only once a reader actually
// opens the panel. After that the service worker's runtime cache keeps them
// offline like any other edition.
const BASE = import.meta.env.BASE_URL

/** A dictionary entry, with the short keys the build emits to save bytes. */
interface RawEntry {
  /** lemma, e.g. ἀγάπη */
  l?: string
  /** transliteration, e.g. agápē */
  x?: string
  /** Strong's definition */
  d?: string
  /** how the KJV renders it */
  k?: string
}

/** `{ "13": { "13": [["charity", "G26"], …] } }` — chapter, verse, words in order. */
type BookTags = Record<string, Record<string, [string, string][]>>

export interface StrongWord {
  /** The KJV word as it appears in the verse. */
  word: string
  /** e.g. `G26`, `H430`. */
  code: string
  lemma?: string
  translit?: string
  def?: string
  kjv?: string
}

let lexicon: Record<string, RawEntry> | null = null
let lexiconLoad: Promise<Record<string, RawEntry>> | null = null
const books = new Map<string, BookTags>()
const bookLoads = new Map<string, Promise<BookTags>>()

/** Load once per session, and share one request between concurrent callers. */
function loadLexicon(): Promise<Record<string, RawEntry>> {
  if (lexicon) return Promise.resolve(lexicon)
  if (!lexiconLoad)
    lexiconLoad = fetch(`${BASE}data/strongs/lexicon.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        lexicon = j
        return j
      })
      .catch(() => {
        lexiconLoad = null // a failed load must not poison later attempts
        return {}
      })
  return lexiconLoad
}

function loadBook(slug: string): Promise<BookTags> {
  const done = books.get(slug)
  if (done) return Promise.resolve(done)
  const inFlight = bookLoads.get(slug)
  if (inFlight) return inFlight
  const p = fetch(`${BASE}data/strongs/${slug}.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: BookTags) => {
      books.set(slug, j)
      bookLoads.delete(slug)
      return j
    })
    .catch(() => {
      bookLoads.delete(slug)
      return {} as BookTags
    })
  bookLoads.set(slug, p)
  return p
}

/**
 * The tagged words of one verse, in the order the KJV reads them.
 *
 * Repeats are kept: 1 Corinthians 13:13 says `charity` twice, and collapsing them
 * would misrepresent the verse. Words the dictionary cannot resolve are dropped
 * rather than shown as a bare number.
 */
export async function verseWords(slug: string, ch: number, v: number): Promise<StrongWord[]> {
  const [book, lex] = await Promise.all([loadBook(slug), loadLexicon()])
  const words = book?.[String(ch)]?.[String(v)]
  if (!words?.length) return []
  const out: StrongWord[] = []
  for (const [word, code] of words) {
    const e = lex[code]
    if (!e) continue
    out.push({ word, code, lemma: e.l, translit: e.x, def: e.d, kjv: e.k })
  }
  return out
}

/** Whether the concordance has already been opened this session, so a reader who
 *  wants it does not have to expand the panel again on every verse. */
let sticky = false
export const concordanceSticky = () => sticky
export const setConcordanceSticky = (on: boolean) => {
  sticky = on
}
