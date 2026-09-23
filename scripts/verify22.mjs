// How much gets read, and from where.
//
// Run:  npx vite preview --port 4188 --strictPort
//       node scripts/verify22.mjs
//
// Two controls start playback in the reader and they mean two different sizes of
// thing. The button in the column head plays *the chapter*; Listen in a verse's
// action bar plays *that verse*. Neither did:
//
//   - the chapter button started at the top *visible* verse, so pressing it half way
//     down a chapter never read the first half — the same control meant something
//     different depending on how far the reader had scrolled;
//   - Listen ran from that verse to the end of the book, and on into the next book
//     unless "Stop at chapter end" was set.
//
// Fixing the second left a gap — a reader who wanted to hear on from a verse had no
// way to say so — which an offer raised after the verse fills. Where that offer starts
// is checked here as closely as how far it goes.
//
// Both are invisible to a screenshot and inaudible to a headless browser, so this
// stubs `speechSynthesis` the way verify14 does and reads back the list of utterances
// the app handed over. That list is the whole assertion: its length is how much was
// read, and its first entry is where it started.
import { chromium } from 'playwright'

const URL = 'http://localhost:4188/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const BASE = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: true, ui: 'en',
  columns: ['en'],
}

// Says nothing, remembers everything. Same shape as verify14's: the app refuses to
// speak into a language with no installed voice and headless Chromium ships none, so
// one English voice is reported.
const STUB = () => {
  const spoken = []
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
      getVoices: () => [{ name: 'Alex', lang: 'en-US', default: true, localService: true, voiceURI: 'Alex' }],
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

async function open(hash, prefs = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), { ...BASE, ...prefs })
  await ctx.addInitScript(STUB)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  return { ctx, page }
}

/** The run is sequential — each utterance is spoken from the previous one's `onend` —
 *  so the list is complete only once it stops growing. */
async function settled(page) {
  await page
    .waitForFunction(
      () => {
        const n = window.__spoken.length
        const stable = n > 0 && n === window.__last
        window.__last = n
        return stable
      },
      null,
      { timeout: 15000, polling: 200 },
    )
    .catch(() => {})
  return page.evaluate(() => window.__spoken)
}

// John 3 is 36 verses, which is long enough to scroll well past the start.
console.log('\nThe chapter button plays the chapter')
{
  const { ctx, page } = await open('#/john/3/en')
  await page.locator('.colplay').first().click()
  const spoken = await settled(page)
  check('every verse of John 3 was handed over', spoken.length === 36, `${spoken.length} utterance(s)`)
  check('starting at verse 1', /There was a man of the Pharisees/.test(spoken[0]), spoken[0]?.slice(0, 48))
  check('and ending at verse 36', /wrath of God abideth on him/.test(spoken[35]), spoken[35]?.slice(-42))
  await ctx.close()
}

console.log('\nEven when the reader has scrolled past the start')
{
  const { ctx, page } = await open('#/john/3/en')
  // Put verse 30 at the top of the window: this is the case the old behaviour got
  // wrong, silently reading 30-36 and calling it the chapter.
  await page.locator('#v-en-30').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  // Clicked through the DOM, not through Playwright. `locator.click()` scrolls its
  // target into view first, and the column head is at the top of the chapter — so it
  // would scroll the page back and undo the very condition under test. This is the
  // one place in the suite where that distinction decides whether the check has any
  // teeth. Against the old code, clicked this way, it reads 11 utterances from verse
  // 26; clicked through Playwright it reads all 36 and the check proves nothing.
  await page.evaluate(() => document.querySelector('.colplay').click())
  const spoken = await settled(page)
  check('it still reads all 36', spoken.length === 36, `${spoken.length} utterance(s)`)
  check('and still starts at verse 1', /There was a man of the Pharisees/.test(spoken[0]), spoken[0]?.slice(0, 48))
  await ctx.close()
}

console.log('\nListen in a verse bar plays that verse and stops')
{
  const { ctx, page } = await open('#/john/3/en')
  await page.locator('#v-en-16').click()
  await page.locator('#v-en-16 .vbar').waitFor({ state: 'visible' })
  await page.locator('#v-en-16 .vbar .vbtn', { hasText: 'Listen' }).click()
  const spoken = await settled(page)
  check('exactly one utterance', spoken.length === 1, `${spoken.length} utterance(s)`)
  check('and it is John 3:16', /For God so loved the world/.test(spoken[0]), spoken[0]?.slice(0, 48))
  check('the bar closed behind it', (await page.locator('.vbar').count()) === 0)
  await ctx.close()
}

// Listen reads a verse and stops, which leaves a reader who wanted a run with
// nowhere to go. The way back is an offer raised once the verse has been read, not a
// control sitting somewhere waiting to be found.
// The offer starts at the *next* verse: the one just read is read, and an offer that
// replayed it would be answering a question nobody asked.
console.log('\nAfter one verse, the offer reads on from the next')
{
  const { ctx, page } = await open('#/john/3/en')
  await page.locator('#v-en-16').click()
  await page.locator('#v-en-16 .vbar').waitFor({ state: 'visible' })
  await page.locator('#v-en-16 .vbar .vbtn', { hasText: 'Listen' }).click()
  const one = await settled(page)
  check('the verse alone was read first', one.length === 1, `${one.length} utterance(s)`)
  await page.locator('.toast .toastact').waitFor({ state: 'visible' })
  check('and an offer appeared', (await page.locator('.toast .toastact').textContent()) === 'Read on')
  await page.evaluate(() => {
    window.__spoken.length = 0
    window.__last = 0
  })
  await page.locator('.toast .toastact').click()
  const spoken = await settled(page)
  check('17 to the end of the chapter is 20 verses', spoken.length === 20, `${spoken.length} utterance(s)`)
  check('starting at verse 17, not 16 again', /For God sent not his Son/.test(spoken[0]), spoken[0]?.slice(0, 48))
  await ctx.close()
}

// The last verse has nothing after it, so the offer would start a run with no verses
// in it — a button that does nothing when pressed. It is not shown.
console.log('\nAt the end of the chapter there is nothing to read on to')
{
  const { ctx, page } = await open('#/john/3/en')
  await page.locator('#v-en-36').click()
  await page.locator('#v-en-36 .vbar').waitFor({ state: 'visible' })
  await page.locator('#v-en-36 .vbar .vbtn', { hasText: 'Listen' }).click()
  const spoken = await settled(page)
  check('the last verse was read', spoken.length === 1, `${spoken.length} utterance(s)`)
  await page.waitForTimeout(600)
  check('and no offer was raised', (await page.locator('.toast .toastact').count()) === 0)
  await ctx.close()
}

// The setting governs whether the *chapter* rolls on. A single verse is a single
// verse either way, which is the half that would be easy to get wrong.
console.log('\nA single verse ignores "stop at chapter end", both ways')
{
  const { ctx, page } = await open('#/john/3/en', { stopAtChapterEnd: false })
  await page.locator('#v-en-16').click()
  await page.locator('#v-en-16 .vbar').waitFor({ state: 'visible' })
  await page.locator('#v-en-16 .vbar .vbtn', { hasText: 'Listen' }).click()
  const spoken = await settled(page)
  check('still exactly one utterance', spoken.length === 1, `${spoken.length} utterance(s)`)
  check('and it did not run into John 4', !spoken.some((s) => /When therefore the Lord knew/.test(s)))
  await ctx.close()
}

// The last verse is the one that would expose a chapter play that quietly rolled on
// when it was told not to.
console.log('\nThe chapter stops where the reader asked it to')
{
  const { ctx, page } = await open('#/john/3/en', { stopAtChapterEnd: true })
  await page.locator('.colplay').first().click()
  const spoken = await settled(page)
  check('36 utterances, not 36 plus the next chapter', spoken.length === 36, `${spoken.length}`)
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
