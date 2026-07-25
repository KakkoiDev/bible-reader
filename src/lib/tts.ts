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

// Maps a run of the spoken (kana) string to the displayed (kanji) base text.
interface Seg {
  ss: number
  se: number
  bs: number
  be: number
}
/** For Japanese, build the spoken kana string alongside a chunk map back to the
 *  displayed base text (kanji). Each chunk is a kanji group ({{…}}) or a run of
 *  kana between them; a boundary highlights its whole chunk so nothing is skipped. */
function jaSpeech(text: string): { spoken: string; map: Seg[] } {
  const map: Seg[] = []
  let spoken = ''
  let bpos = 0
  const pushPlain = (chunk: string) => {
    if (!chunk) return
    const spokenChunk = chunk.replace(/[〔〕]/g, ' ')
    map.push({ ss: spoken.length, se: spoken.length + spokenChunk.length, bs: bpos, be: bpos + chunk.length })
    spoken += spokenChunk
    bpos += chunk.length
  }
  const re = /\{\{([^|}]*)\|([^}]+)\}\}/g
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > i) pushPlain(text.slice(i, m.index))
    map.push({ ss: spoken.length, se: spoken.length + m[2].length, bs: bpos, be: bpos + m[1].length })
    spoken += m[2]
    bpos += m[1].length
    i = m.index + m[0].length
  }
  if (i < text.length) pushPlain(text.slice(i))
  return { spoken, map }
}
/** Base range of the chunk the spoken position falls in. */
function segmentBaseAt(map: Seg[], ci: number): { s: number; e: number } | null {
  for (const seg of map) if (seg.ss <= ci && ci < seg.se) return { s: seg.bs, e: seg.be }
  const last = map[map.length - 1]
  return last ? { s: last.bs, e: last.be } : null
}

/** Speak a run of verses in order; hooks fire as each verse begins / all finish.
 *  onWord reports the spoken word's displayed char range. For JA the kana index is
 *  mapped back to the kanji; it still only fires if the voice emits word boundaries. */
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
  const ja = lang === 'ja'
  items.forEach((it, i) => {
    const built = ja ? jaSpeech(it.text) : { spoken: speechText(it.text, lang), map: null as Seg[] | null }
    const spoken = built.spoken
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = LANG_TAG[lang]
    if (voice) u.voice = voice
    u.rate = rate
    u.onstart = () => hooks.onVerse(it.v)
    if (hooks.onWord) {
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return
        const ci = e.charIndex
        if (ja) {
          if (built.map) {
            const r = segmentBaseAt(built.map, ci)
            if (r) hooks.onWord!(it.v, r.s, r.e)
          }
          return
        }
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
