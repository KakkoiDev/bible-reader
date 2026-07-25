// Runtime text-to-speech via the browser's Web Speech API. Zero storage, works
// in the PWA. Japanese is spoken from the furigana readings (not the kanji) so
// the classical 文語 text is pronounced correctly.
import type { Lang } from './types'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

const LANG_TAG: Record<Lang, string> = { en: 'en-US', ja: 'ja-JP', fr: 'fr-FR' }

/** Convert stored verse text into something a modern TTS voice reads correctly. */
export function speechText(text: string, lang: Lang): string {
  if (lang === 'ja')
    return text
      .replace(/\{\{[^|}]*\|([^}]+)\}\}/g, '$1') // {{漢字|かな}} → かな (correct reading)
      .replace(/[〔〕]/g, ' ')
      .trim()
  if (lang === 'en') return text.replace(/[{}]/g, '') // drop KJV supplied-word braces
  return text
}

let cached: SpeechSynthesisVoice[] = []
export function primeVoices() {
  if (!ttsSupported()) return
  cached = speechSynthesis.getVoices()
  speechSynthesis.addEventListener('voiceschanged', () => {
    cached = speechSynthesis.getVoices()
  })
}
export type Gender = 'male' | 'female'
// Web Speech exposes no gender field, so match well-known voice names per platform.
const MALE = ['male', 'alex', 'daniel', 'fred', 'david', 'mark', 'guy', 'thomas', 'otoya', 'ichiro', 'keita', 'ryan']
const FEMALE = [
  'female', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'susan', 'zira', 'aria', 'jenny',
  'amelie', 'amélie', 'audrey', 'marie', 'kyoko', 'haruka', 'ayumi', 'nanami', 'sara',
]
function pickVoice(lang: Lang, gender: Gender): SpeechSynthesisVoice | undefined {
  const all = cached.length ? cached : ttsSupported() ? speechSynthesis.getVoices() : []
  const list = all.filter((v) => v.lang === LANG_TAG[lang] || v.lang?.startsWith(lang))
  if (!list.length) return undefined
  const want = gender === 'female' ? FEMALE : MALE
  const other = gender === 'female' ? MALE : FEMALE
  const named = list.find((v) => want.some((k) => v.name.toLowerCase().includes(k)))
  if (named) return named
  return list.find((v) => !other.some((k) => v.name.toLowerCase().includes(k))) || list[0]
}

export interface SpeakItem {
  v: number
  text: string
}

/** Speak a run of verses in order; hooks fire as each verse begins / all finish.
 *  Word-level highlighting (onWord) is EN/FR only — Japanese highlights per verse,
 *  because its browser voices rarely emit reliable word boundaries (see FUTURE.md). */
export function speakVerses(
  items: SpeakItem[],
  lang: Lang,
  rate: number,
  gender: Gender,
  hooks: {
    onVerse: (v: number) => void
    onDone: () => void
    onWord?: (v: number, start: number, end: number) => void
  },
) {
  if (!ttsSupported() || items.length === 0) return
  speechSynthesis.cancel()
  const voice = pickVoice(lang, gender)
  items.forEach((it, i) => {
    const spoken = speechText(it.text, lang)
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = LANG_TAG[lang]
    if (voice) u.voice = voice
    u.rate = rate
    u.onstart = () => hooks.onVerse(it.v)
    if (hooks.onWord && lang !== 'ja') {
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return
        const ci = e.charIndex
        const len = e.charLength || spoken.slice(ci).match(/^\S+/)?.[0].length || 0
        if (len) hooks.onWord!(it.v, ci, ci + len)
      }
    }
    if (i === items.length - 1) u.onend = () => hooks.onDone()
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel()
}
