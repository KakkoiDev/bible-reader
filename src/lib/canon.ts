// The canon the app can place a book in, as opposed to the books it has text for.
//
// `data/index.json` is the second of those: the books some shipped edition carries.
// `data/canon.json` is the first: every book `scripts/sources.mjs` knows about, in
// order, with its section and the OSIS ids that name it. An imported edition can
// carry a book no shipped edition has — a Tobit, a Judith — and without this there
// would be nowhere to put it: no position among the other books, and no section to
// group it under.

import { importedBook, isImported } from './imported'
import type { EditionBook, IndexItem, Section } from './types'
import type { Lang } from './versions'

export interface CanonBook {
  slug: string
  en: string
  section: Section
  /** Every OSIS id that names this book. Written by the build, so the table has one
   *  home rather than a copy in the app that can drift from the one in the data. */
  osis: string[]
}

const BASE = import.meta.env.BASE_URL

/**
 * One book of one edition, wherever it lives.
 *
 * The single switch between the two sources of verse text. A shipped edition is a
 * file under `data/<id>/`; an imported one is a record in IndexedDB. Everything that
 * reads scripture — the reader, the original-language lookup behind the concordance,
 * the day's passage, the search index — goes through here, so there is one place that
 * knows the difference and no caller that has to.
 *
 * A miss is the empty book rather than a throw, which is what a 404 already gave the
 * reader: a column that says the edition has nothing here, not a broken page.
 */
export const EMPTY_BOOK: EditionBook = { chapters: [] }

export async function loadBook(lang: Lang, slug: string): Promise<EditionBook> {
  if (isImported(lang)) return (await importedBook(lang, slug)) ?? EMPTY_BOOK
  return fetch(`${BASE}data/${lang}/${slug}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<EditionBook>) : EMPTY_BOOK))
    .catch(() => EMPTY_BOOK)
}

let cache: CanonBook[] | null = null

export async function loadCanon(): Promise<CanonBook[]> {
  if (cache) return cache
  try {
    const got = await fetch(`${BASE}data/canon.json`).then((r) => (r.ok ? r.json() : []))
    cache = Array.isArray(got) ? got : []
  } catch {
    cache = []
  }
  return cache
}

/** OSIS id → canonical English name, for the importer. */
export const osisIndex = (canon: CanonBook[]): Map<string, string> =>
  new Map(canon.flatMap((b) => b.osis.map((id) => [id, b.en] as const)))

/**
 * Merge an imported edition's books into the shipped index.
 *
 * Three things happen per book. A book the shipped editions already have gains the
 * imported edition in its `has`, so the reader will fetch it for that column. Its
 * per-chapter verse ceilings grow to the union, so a verse the import has and the
 * others do not still gets a row. And a book no shipped edition has is inserted at
 * its canonical position with its own section, which is what makes a deuterocanon
 * appear in the picker rather than being unreachable text in a database.
 *
 * `spine` stays the KJV's. It is what tells the reader apart the two reasons a column
 * is empty, and an imported edition is not evidence about the KJV; for a book the KJV
 * never had, the spine is zeroes and every gap reads as "numbered differently here",
 * which is the honest answer when there is no English ceiling to compare against.
 */
export function mergeImported(
  index: IndexItem[],
  canon: CanonBook[],
  editions: { id: Lang; books: string[]; chapters?: Record<string, number[]> }[],
): IndexItem[] {
  if (!editions.length || !canon.length) return index
  const bySlug = new Map(index.map((b) => [b.slug, { ...b, has: [...(b.has ?? [])] }]))
  const canonBySlug = new Map(canon.map((b) => [b.slug, b]))
  const slugOfEn = new Map(canon.map((b) => [b.en, b.slug]))

  for (const ed of editions) {
    for (const en of ed.books) {
      const slug = slugOfEn.get(en)
      const cb = slug ? canonBySlug.get(slug) : undefined
      if (!slug || !cb) continue
      const counts = ed.chapters?.[slug] ?? []
      let item = bySlug.get(slug)
      if (!item) {
        item = {
          slug,
          section: cb.section,
          chapters: [...counts],
          // No KJV behind a book the KJV never had.
          spine: counts.map(() => 0),
          names: { en: cb.en },
          has: [],
        }
        bySlug.set(slug, item)
      }
      if (!item.has!.includes(ed.id)) item.has!.push(ed.id)
      for (let i = 0; i < counts.length; i++)
        if ((item.chapters[i] ?? 0) < counts[i]) item.chapters[i] = counts[i]
      while (item.spine.length < item.chapters.length) item.spine.push(0)
    }
  }

  // Canonical order, with anything the canon file does not know about left where it
  // was — dropping a book because the order list is out of date would be worse.
  const order = new Map(canon.map((b, i) => [b.slug, i]))
  return [...bySlug.values()].sort(
    (a, z) => (order.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (order.get(z.slug) ?? Number.MAX_SAFE_INTEGER),
  )
}
