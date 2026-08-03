// What reaches the speech synthesiser.
//
// The Web Speech API gives no way to hear back what an engine did with a string, so
// this stubs speechSynthesis before the app boots and records the text of every
// utterance the reader hands it. That is the last thing the app controls; how it
// sounds after that is the engine's, and the user's ear.
//
// Run:  npx vite preview --port 4183 --strictPort
//       node scripts/verify14.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:4183/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const BASE = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: true, ui: 'en',
}

// A synthesiser that says nothing and remembers everything. It reports one voice per
// language the suite asks about, because the app refuses to speak into a language with
// no installed voice, and headless Chromium ships none. The utterance is stubbed too:
// the real one type-checks its `voice` setter and rejects a plain object.
const STUB = () => {
  const spoken = []
  const voices = [
    { name: 'Alex', lang: 'en-US', default: true, localService: true, voiceURI: 'Alex' },
    { name: 'Thomas', lang: 'fr-FR', default: false, localService: true, voiceURI: 'Thomas' },
  ]
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text
    }
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speaking: false,
      paused: false,
      pending: false,
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
      cancel() {},
      pause() {},
      resume() {},
      speak(u) {
        spoken.push(u.text)
        setTimeout(() => u.onstart?.(new Event('start')), 0)
        setTimeout(() => u.onend?.(new Event('end')), 1)
      },
    },
  })
  window.__spoken = spoken
}

async function speakChapter(hash, columns, sel = '.colplay') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), { ...BASE, columns })
  await ctx.addInitScript(STUB)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  await page.locator(sel).first().click()
  // The run is sequential: each utterance is spoken from the previous one's onend, so
  // the list is complete only once it stops growing. Psalm 119 is 176 of them, and
  // the prefs stop the reader at the chapter end so the count can settle at all.
  await page.waitForFunction(
    () => {
      const n = window.__spoken.length
      const stable = n > 0 && n === window.__last
      window.__last = n
      return stable
    },
    null,
    { timeout: 15000, polling: 250 },
  )
  const spoken = await page.evaluate(() => window.__spoken)
  await ctx.close()
  return spoken
}

// ---------- 0. the stub is wired to the real path ----------
console.log('\nThe suite is reading real utterances')
{
  const spoken = await speakChapter('#/psalms/4/en', ['en'])
  check('the chapter was handed over verse by verse', spoken.length === 8, `${spoken.length} utterance(s)`)
  check('and it is the text of Psalm 4', /Offer the sacrifices of righteousness/.test(spoken[4]), spoken[4])
}

// ---------- 1. the divine name is not spelled out ----------
// Psalm 4:5 ends "...trust in the LORD." and it was read L-O-R-D. Small caps are
// typography for the tetragrammaton, so nothing is lost by lowering them.
console.log('\nThe divine name reaches the engine as a word')
{
  const spoken = await speakChapter('#/psalms/4/en', ['en'])
  const caps = spoken.filter((s) => /\b(LORD|GOD|JEHOVAH|JAH)\b/.test(s))
  check('no all-caps divine name in the whole chapter', caps.length === 0, caps.join(' | '))
  check('Psalm 4:5 says Lord', spoken[4].endsWith('trust in the Lord.'), spoken[4])
  check('and 4:6 too, where it was already read correctly', spoken[5].includes('Lord, lift thou up'), spoken[5])
}

// ---------- 2. capitals that are not the divine name are left alone ----------
// Psalm 119's stanza headings are the Hebrew alphabet. They are letters, and a reader
// who lowered them would be changing the text, not its typography.
console.log('\nAcrostic headings keep their capitals')
{
  const spoken = await speakChapter('#/psalms/119/en', ['en'])
  check('ALEPH survives', spoken.some((s) => /\bALEPH\b/.test(s)), spoken[0])
  check('and BETH', spoken.some((s) => /\bBETH\b/.test(s)))
  check('while the LORD in the same chapter does not',
    !spoken.some((s) => /\bLORD\b/.test(s)),
    spoken.filter((s) => /\bLORD\b/.test(s))[0] || '')
}

// ---------- 3. the same convention in the French edition ----------
console.log('\nThe KJF uses the same convention and gets the same treatment')
{
  const spoken = await speakChapter('#/psalms/4/fr', ['fr'])
  check('no all-caps SEIGNEUR', !spoken.some((s) => /\bSEIGNEUR\b/.test(s)),
    spoken.filter((s) => /\bSEIGNEUR\b/.test(s))[0] || '')
  check('it is there as a word', spoken.some((s) => /\bSeigneur\b/.test(s)),
    spoken.find((s) => /Seigneur/.test(s)) || 'no Seigneur at all')
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
