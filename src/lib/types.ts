export type { Lang } from './versions'
import type { Lang } from './versions'

export interface IndexItem {
  slug: string
  /** Verse ceiling per chapter — `chapters[0]` is chapter 1. Length = chapter count. */
  chapters: number[]
  /** The KJV's own ceiling for the same chapters. Where it is lower than `chapters`,
   *  the extra rows exist because another tradition numbers differently. */
  spine: number[]
  /** Book name per edition; `en` is always present. */
  names: Partial<Record<Lang, string>> & { en: string }
}

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
