export type { Lang } from './versions'
import type { Lang } from './versions'

/** Where a book sits in the canon. Carried per book rather than inferred from a
 *  position against a hard-coded 39, so the canon can be longer than 66 books. */
export type Section = 'ot' | 'deutero' | 'nt'

export interface IndexItem {
  slug: string
  /** Old Testament, deuterocanon, or New Testament. Written by `build-data.mjs`. */
  section?: Section
  /** Verse ceiling per chapter — `chapters[0]` is chapter 1. Length = chapter count. */
  chapters: number[]
  /** The KJV's own ceiling for the same chapters. Where it is lower than `chapters`,
   *  the extra rows exist because another tradition numbers differently. */
  spine: number[]
  /** Book name per edition; `en` is always present. */
  names: Partial<Record<Lang, string>> & { en: string }
  /** The editions that actually carry this book, from the build rather than from a
   *  coverage rule — see `coversBook`. */
  has?: Lang[]
}

/**
 * A book's section, tolerating an index.json from before the field existed.
 *
 * The fallback is the old rule, and it is only ever reached by a reader whose
 * service worker is still serving the previous precache: an installed app can be a
 * version behind for one launch, and a book landing in no section at all would drop
 * it out of the picker entirely. A canon with a deuterocanon cannot be described
 * this way, which is exactly why the field exists.
 */
export const sectionOf = (b: IndexItem | undefined, at: number): Section =>
  b?.section ?? (at < 39 ? 'ot' : 'nt')

/** Books of one section, in canonical order. */
export const inSection = (index: IndexItem[], section: Section): IndexItem[] =>
  index.filter((b, i) => sectionOf(b, i) === section)

/** One row of a chapter: the verse number plus whichever editions have text for it. */
export interface Verse {
  v: number
  text: Partial<Record<Lang, string>>
}

export interface Chapter {
  n: number
  verses: Verse[]
}

/** Shape of public/data/<id>/<slug>.json. */
export interface EditionBook {
  chapters: { n: number; verses: { v: number; t: string }[] }[]
}

export const bookName = (b: IndexItem | undefined, lang: Lang): string =>
  (b && (b.names[lang] || b.names.en)) || ''
