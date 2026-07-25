export type Lang = 'en' | 'ja' | 'fr'

export interface IndexItem {
  slug: string
  en: string
  ja: string
  chapters: number
}

export interface Verse {
  v: number
  en: string
  fr: string
  ja: string
}

export interface Chapter {
  n: number
  verses: Verse[]
}

export interface BookData {
  slug: string
  en: string
  ja: string
  chapters: Chapter[]
}

// Reading ring order for the mobile swipe: English → Japanese → French → …
export const RING: Lang[] = ['en', 'ja', 'fr']

export const LANG_META: Record<Lang, { label: string; edition: string; htmlLang: string }> = {
  en: { label: 'English', edition: 'KJV', htmlLang: 'en' },
  ja: { label: '日本語', edition: '文語訳', htmlLang: 'ja' },
  fr: { label: 'Français', edition: 'KJF', htmlLang: 'fr' },
}
