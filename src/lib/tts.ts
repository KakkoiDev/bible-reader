// Runtime text-to-speech via the browser's Web Speech API. Zero storage, works
// in the PWA. Japanese is spoken from the furigana readings (not the kanji) so
// the classical 文語 text is pronounced correctly.
import { BY_ID, type Lang } from './versions'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

const langTag = (lang: Lang) => BY_ID[lang].speech

/** Convert stored verse text into something a modern TTS voice reads correctly. */
export function speechText(text: string, lang: Lang): string {
  const markup = BY_ID[lang].markup
  if (markup === 'ruby')
    return text
      .replace(/\{\{[^|}]*\|([^}]+)\}\}/g, '$1') // {{漢字|かな}} → かな (correct reading)
      .replace(/[〔〕]/g, ' ')
      .trim()
  if (markup === 'kjv') return text.replace(/[{}]/g, '') // drop supplied-word braces
  return text
}

let cached: SpeechSynthesisVoice[] = []
const voiceListeners = new Set<() => void>()

export function primeVoices() {
  if (!ttsSupported()) return
  cached = speechSynthesis.getVoices()
  speechSynthesis.addEventListener('voiceschanged', () => {
    cached = speechSynthesis.getVoices()
    for (const cb of voiceListeners) cb()
  })
}

/** Subscribe to the voice list arriving. Returns an unsubscribe function.
 *  Chrome resolves getVoices() asynchronously, so anything rendered from voice
 *  availability has to re-render when the list lands. */
export function onVoicesChanged(cb: () => void): () => void {
  voiceListeners.add(cb)
  return () => voiceListeners.delete(cb)
}

/** Whether the voice list has arrived at all. An empty list means "not known yet",
 *  which is different from "this device has no voice for that language" — treating
 *  the two the same labels every edition unspeakable on first paint. */
export const voicesLoaded = () =>
  ttsSupported() && (cached.length > 0 || speechSynthesis.getVoices().length > 0)
export type Gender = 'male' | 'female'
// Web Speech exposes no gender field, so match well-known voice names per platform.
const MALE = ['male', 'alex', 'daniel', 'fred', 'david', 'mark', 'guy', 'thomas', 'otoya', 'ichiro', 'keita', 'ryan']
const FEMALE = [
  'female', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'susan', 'zira', 'aria', 'jenny',
  'amelie', 'amélie', 'audrey', 'marie', 'kyoko', 'haruka', 'ayumi', 'nanami', 'sara',
]
/** Voices matching an edition's spoken language, best match first.
 *  Matched on the BCP47 tag from the registry, not the edition id — `zht` is
 *  spoken by a `zh-TW` voice, and Koine Greek by whatever `el` voice exists. */
function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  const all = cached.length ? cached : ttsSupported() ? speechSynthesis.getVoices() : []
  const tag = langTag(lang)
  const base = tag.split('-')[0].toLowerCase()
  const exact = all.filter((v) => v.lang?.replace('_', '-').toLowerCase() === tag.toLowerCase())
  const loose = all.filter((v) => v.lang?.replace('_', '-').toLowerCase().split('-')[0] === base)
  return [...exact, ...loose.filter((v) => !exact.includes(v))]
}

/** Whether this device can actually speak an edition — no voice, no play button. */
export const hasVoice = (lang: Lang) => voicesFor(lang).length > 0

function pickVoice(lang: Lang, gender: Gender): SpeechSynthesisVoice | undefined {
  const list = voicesFor(lang)
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
  const myGen = ++genToken
  speechSynthesis.cancel()
  const voice = pickVoice(lang, gender)
  // Sequential: speak one verse, and on its end speak the next. Queuing everything
  // up front is unreliable — many browsers only fire `onstart` for the first
  // utterance, so the highlight would stick on the first verse.
  let i = 0
  const speakNext = () => {
    if (myGen !== genToken) return
    if (i >= items.length) {
      hooks.onDone()
      return
    }
    const it = items[i]
    const spoken = speechText(it.text, lang)
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = langTag(lang)
    if (voice) u.voice = voice
    u.rate = rate
    u.onstart = () => {
      if (myGen === genToken) hooks.onVerse(it.v)
    }
    if (hooks.onWord && lang !== 'ja') {
      u.onboundary = (e) => {
        if (myGen !== genToken || (e.name && e.name !== 'word')) return
        const ci = e.charIndex
        const len = e.charLength || spoken.slice(ci).match(/^\S+/)?.[0].length || 0
        if (len) hooks.onWord!(it.v, ci, ci + len)
      }
    }
    u.onend = () => {
      if (myGen !== genToken) return
      i++
      speakNext()
    }
    u.onerror = () => {
      if (myGen !== genToken) return
      i++
      speakNext()
    }
    speechSynthesis.speak(u)
  }
  speakNext()
}

let genToken = 0
export function stopSpeaking() {
  genToken++
  if (ttsSupported()) speechSynthesis.cancel()
}
