// Runtime text-to-speech via the browser's Web Speech API. Zero storage, works
// in the PWA. Japanese is spoken from the furigana readings (not the kanji) so
// the classical 文語 text is pronounced correctly.
import { BY_ID, type Lang } from './versions'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

const langTag = (lang: Lang) => BY_ID[lang].speech

/** Convert stored verse text into something a modern TTS voice reads correctly. */
export function speechText(text: string, lang: Lang): string {
  const markup = BY_ID[lang].markup
  let s = text
  if (markup === 'ruby')
    s = s.replace(/\{\{[^|}]*\|([^}]+)\}\}/g, '$1').replace(/[〔〕]/g, ' ') // {{漢字|かな}} → かな
  else if (markup === 'kjv') s = s.replace(/[{}]/g, '') // drop supplied-word braces
  // Hebrew: strip niqqud and cantillation so a voice reads words instead of spelling
  // out every pointed letter one by one; turn maqaf and paseq into spaces so joined
  // words separate rather than fuse.
  if (lang === 'he')
    s = s
      .replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '')
      .replace(/[\u05be\u05c0\u05c3\u05c6]/g, ' ')
  // Parentheses aren't pronounced, but a ; or : hugging one is read aloud as an emoticon
  // ("winking face"): the KJV's parenthetical clauses (…;) trigger it. Drop the parens.
  s = s.replace(/[()]/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
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

/** Run cb once the voice list is known, so a speak decision is never made against the
 *  empty pre-load list. That window is exactly when tapping play would start silent
 *  audio for an uninstalled language: the list isn't in yet, so nothing looks
 *  unspeakable. Runs cb synchronously when the list is already loaded (the common
 *  case); otherwise waits for it, falling through after a bounded delay for engines
 *  that never emit voiceschanged. */
function whenVoicesReady(cb: () => void) {
  if (voicesLoaded()) return cb()
  primeVoices()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    off()
    clearTimeout(timer)
    cb()
  }
  const off = onVoicesChanged(finish)
  const timer = setTimeout(finish, 1500)
}
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

/** True only once we KNOW there is no voice: the list has arrived and none matches.
 *  Before it loads this is false, so nothing is wrongly refused (see voicesLoaded). A
 *  caller uses it to warn instead of starting silent audio. */
export const voiceMissing = (lang: Lang) => voicesLoaded() && !hasVoice(lang)

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
    onNoVoice?: () => void
  },
) {
  if (!ttsSupported() || items.length === 0) return
  whenVoicesReady(() => {
    // Decide only now the list is in: refuse (and let the caller warn) rather than
    // speak into an uninstalled voice, which is silent.
    if (voiceMissing(lang)) return hooks.onNoVoice?.()
    speakRun()
  })

  function speakRun() {
  const myGen = ++genToken
  clearPendingHush()
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
      // A stale utterance must be silenced, not merely ignored. cancel() does not
      // reliably drop an utterance the engine has already dispatched, so one that
      // starts after a stop would otherwise speak in full while we quietly declined
      // to move the highlight - audible as a stray syllable seconds later.
      if (myGen !== genToken) {
        speechSynthesis.cancel()
        return
      }
      hooks.onVerse(it.v)
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
}

let genToken = 0

/**
 * The deferred cancel scheduled by `stopSpeaking`, so a new utterance can call it off.
 *
 * Without this, stopping and immediately speaking loses the new utterance: the
 * deferred cancel lands a tick later and kills what was just queued. That is exactly
 * what silenced the concordance's pronounce button, which stops any chapter playback
 * before speaking its word — the trace showed cancel() 14ms after speak().
 */
let hushTimer: ReturnType<typeof setTimeout> | undefined
function clearPendingHush() {
  if (hushTimer !== undefined) {
    clearTimeout(hushTimer)
    hushTimer = undefined
  }
}

/**
 * Speak one short string: a concordance lemma, or a glossed word.
 *
 * Separate from `speakVerses` because the needs are opposite. There is no verse to
 * follow, no word boundaries to track, and the rate is capped: a lone Greek word at
 * 1.25× is not learnable, and this button exists to be learned from. It still bumps
 * the generation token, so a chapter in progress is genuinely stopped rather than
 * left firing highlight callbacks underneath.
 */
export function speakOne(text: string, lang: Lang, rate: number, gender: Gender, onNoVoice?: () => void) {
  if (!ttsSupported()) return
  const spoken = speechText(text, lang).trim()
  if (!spoken) return
  whenVoicesReady(() => {
    // Only refuse once the list is in, so the pre-load window doesn't start silent audio.
    if (voiceMissing(lang)) return onNoVoice?.()
    speakNow()
  })

  function speakNow() {
  genToken++
  clearPendingHush()

  const build = () => {
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = langTag(lang)
    const voice = pickVoice(lang, gender)
    if (voice) u.voice = voice
    u.rate = Math.min(rate, 0.9)
    speechSynthesis.speak(u)
  }

  // cancel() followed by speak() in the same task is dropped by both Chrome and
  // Safari, so only cancel when something is actually talking, and when we do, let
  // the engine settle for a tick before queueing. Tapping a word with nothing playing
  // — the normal case — now never calls cancel() at all.
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel()
    setTimeout(build, 60)
  } else build()
  }
}

export function stopSpeaking() {
  genToken++
  if (!ttsSupported()) return
  // A paused synth can wedge and resume later, so lift the pause before cancelling.
  try {
    speechSynthesis.resume()
  } catch {
    /* not all engines implement resume */
  }
  speechSynthesis.cancel()
  // Cancel again on the next tick: an utterance dispatched in the same turn can
  // slip past the first call and start speaking afterwards. Held in `hushTimer` so
  // that deliberately speaking again before it fires calls it off, instead of having
  // the new utterance silenced by the old stop.
  clearPendingHush()
  hushTimer = setTimeout(() => {
    hushTimer = undefined
    if (ttsSupported()) speechSynthesis.cancel()
  }, 0)
}

// Leaving the page or backgrounding the tab must not leave speech queued to resume.
if (typeof window !== 'undefined' && ttsSupported()) {
  const hush = () => stopSpeaking()
  window.addEventListener('pagehide', hush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hush()
  })
}
