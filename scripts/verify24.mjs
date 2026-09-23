// The transport: where the audio is, and moving it.
//
// Run:  npx vite preview --port 4191 --strictPort
//       node scripts/verify24.mjs
//
// Before this, the only sign of where playback had got to was the tint on the spoken
// verse — invisible the moment you scrolled away, and no help at all with how far
// through a run you were. The control was a single round button meaning "stop", in a
// different place in each of the three reading surfaces.
//
// So this checks the three questions the bar exists to answer:
//
//   - *what* is playing: the reference names the verse and updates as it moves;
//   - *how far*: the position reads "n of total" over the run, and the run is the
//     chapter, so it resets rather than creeping across a whole book;
//   - *how do I go back over that*: prev and next move a verse at a time, and the
//     verse bar's play cell puts the playhead anywhere in the chapter.
//
// And the two behaviours around it: playback lets go of the page once the reader
// scrolls by hand (it used to drag you back every verse), and the reference is how
// you rejoin.
//
// Speech is stubbed as verify14, verify22 and verify23 do it, but slowly — a verse
// lasts long enough here that a button can be pressed in the middle of a run.
import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4191/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()

const STUB = (ms) => {
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text
    }
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speaking: false, paused: false, pending: false,
      getVoices: () => [{ name: 'Alex', lang: 'en-US', default: true, localService: true, voiceURI: 'Alex' }],
      addEventListener() {}, removeEventListener() {}, cancel() {}, pause() {}, resume() {},
      speak(u) {
        window.__spoken.push(u.text)
        setTimeout(() => u.onstart?.(new Event('start')), 0)
        setTimeout(() => u.onend?.(new Event('end')), ms)
      },
    },
  })
  window.__spoken = []
}

const BASE = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: true, ui: 'en',
  columns: ['en'],
}

/** `ms` is how long a verse takes to speak. The sections that press a button in the
 *  middle of a run use a long one: with a short verse the run moves on between reading
 *  the position and clicking, and the check measures the stub rather than the code. */
async function open(hash = '#/john/3/en', prefs = {}, ms = 250) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), { ...BASE, ...prefs })
  await ctx.addInitScript(STUB, ms)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  // Flowing mode renders spans, not rows.
  await page.locator(prefs.flow ? '.fverse' : '.verse').first().waitFor({ state: 'visible' })
  return { ctx, page }
}

const ref = (page) => page.locator('.nowlabel').innerText()
const pos = (page) => page.locator('.nowref small').innerText()
/** Wait until the run has spoken at least `n` verses. */
const spokenAtLeast = (page, n) => page.waitForFunction((k) => window.__spoken.length >= k, n, { timeout: 15000 })

console.log('\nThe reader has no transport until something plays')
{
  const { ctx, page } = await open()
  check('nothing at rest', (await page.locator('.nowplay').count()) === 0)
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  check('the chapter button raises it', (await page.locator('.nowplay').count()) === 1)
  await ctx.close()
}

console.log('\nIt says which verse, and how far through the chapter')
{
  const { ctx, page } = await open()
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await spokenAtLeast(page, 1)
  check('it names the first verse', (await ref(page)) === 'John 3:1', await ref(page))
  check('and the run is the chapter, 36 verses', (await pos(page)) === '1 of 36', await pos(page))
  await spokenAtLeast(page, 4)
  await page.waitForTimeout(150)
  check('the reference follows the voice', (await ref(page)) === 'John 3:4', await ref(page))
  check('and so does the position', (await pos(page)) === '4 of 36', await pos(page))
  const fill = await page.evaluate(() => document.querySelector('.nowfill').getBoundingClientRect().width)
  const track = await page.evaluate(() => document.querySelector('.nowtrack').getBoundingClientRect().width)
  check('the hairline is filled to match', Math.abs(fill / track - 4 / 36) < 0.02, `${(fill / track).toFixed(3)}`)
  await ctx.close()
}

// The app's own token is 44px, and DESIGN.md's one documented departure is pills and
// chips at 32-36 — which the bar's controls are not.
console.log('\nEvery control in the bar is a 44px target')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.nowplay button')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { label: el.getAttribute('aria-label') ?? el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((b) => b.w < 44 || b.h < 44))
  check('none is under it', small.length === 0, small.map((b) => `${b.label} ${b.w}x${b.h}`).join('; '))
  await ctx.close()
}

console.log('\nPrev and next move a verse at a time')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await spokenAtLeast(page, 1)
  await page.waitForTimeout(200)
  const n = () => pos(page).then((p) => Number(p.split(' ')[0]))
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.waitForTimeout(250)
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.waitForTimeout(250)
  check('two taps of next move two verses', (await n()) === 3, await pos(page))
  await page.locator('.nowbtn[title="Previous verse"]').click()
  await page.waitForTimeout(250)
  check('and previous steps back one', (await n()) === 2, await pos(page))
  // Taps inside one frame: each has to see the one before it, not the position React
  // has yet to commit.
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.waitForTimeout(400)
  check('three fast taps move three, not one', (await n()) === 5, await pos(page))
  check('it keeps playing after a seek', (await page.locator('.nowbtn.play').getAttribute('title')) === 'Pause')
  await ctx.close()
}

// The run is the whole chapter even when playback started half way down it, so the
// transport can step back past where the reader came in.
console.log('\nA run entered at a verse can still be rewound past it')
{
  const { ctx, page } = await open()
  await page.locator('#v-en-20').click()
  await page.locator('#v-en-20 .vbar').waitFor({ state: 'visible' })
  check('with nothing playing the cell reads the verse', (await page.locator('#v-en-20 .vbar .vlabel').nth(4).innerText()) === 'Listen')
  await page.locator('#v-en-20 .vbar .vbtn', { hasText: 'Listen' }).click()
  await spokenAtLeast(page, 1)
  await page.waitForTimeout(1200)
  check('and it is one verse, with no transport', (await page.locator('.nowplay').count()) === 0)
  await ctx.close()
}

console.log('\nWhile a run is playing, the same cell moves the playhead')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await spokenAtLeast(page, 1)
  await page.locator('#v-en-30').click()
  await page.locator('#v-en-30 .vbar').waitFor({ state: 'visible' })
  check('the cell now says so', (await page.locator('#v-en-30 .vbar .vlabel').nth(4).innerText()) === 'Read on',
    await page.locator('#v-en-30 .vbar .vlabel').nth(4).innerText())
  await page.locator('#v-en-30 .vbar .vbtn', { hasText: 'Read on' }).click()
  await page.waitForTimeout(400)
  check('the playhead moved to verse 30', (await pos(page)) === '30 of 36', await pos(page))
  check('and the reference with it', (await ref(page)) === 'John 3:30', await ref(page))
  // Back past the verse it was entered at, which a list truncated at 30 could not do.
  for (let i = 0; i < 3; i++) {
    await page.locator('.nowbtn[title="Previous verse"]').click()
    await page.waitForTimeout(250)
  }
  check('and it can still be rewound past it', (await pos(page)) === '27 of 36', await pos(page))
  await ctx.close()
}

console.log('\nPause keeps the place; stop puts the bar away')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await spokenAtLeast(page, 1)
  await page.waitForTimeout(200)
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.locator('.nowbtn[title="Next verse"]').click()
  await page.waitForTimeout(400)
  const at = await pos(page)
  await page.locator('.nowbtn.play').click()
  await page.waitForTimeout(700)
  const stopped = await page.evaluate(() => window.__spoken.length)
  await page.waitForTimeout(600)
  check('pausing really stops the voice', (await page.evaluate(() => window.__spoken.length)) === stopped, `${stopped}`)
  check('the bar stays, holding the place', (await pos(page)) === at, `${at} -> ${await pos(page)}`)
  check('and the button offers to resume', (await page.locator('.nowbtn.play').getAttribute('title')) === 'Play chapter')
  await page.locator('.nowbtn.play').click()
  await page.waitForTimeout(400)
  check('resuming picks up where it stopped', (await pos(page)) === at, `${at} -> ${await pos(page)}`)
  await page.locator('.nowbtn[title="Stop audio"]').click()
  await page.waitForTimeout(300)
  check('stop puts the bar away', (await page.locator('.nowplay').count()) === 0)
  await ctx.close()
}

// The half of "where is the audio" that a progress bar cannot answer: playback used to
// drag the page back every verse, so looking anything up meant fighting it.
console.log('\nPlayback lets go of the page once the reader scrolls')
{
  const { ctx, page } = await open()
  await page.locator('.colplay').first().click()
  await spokenAtLeast(page, 2)
  await page.waitForTimeout(200)
  // A real wheel, which is the reader's own intent — not `scrollTo`, which is what the
  // app itself does and must not be mistaken for the reader.
  await page.mouse.wheel(0, 6000)
  await page.waitForTimeout(300)
  const parked = await page.evaluate(() => window.scrollY)
  await spokenAtLeast(page, 5)
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => window.scrollY)
  check('it stays where it was put', Math.abs(after - parked) < 40, `${Math.round(parked)} -> ${Math.round(after)}`)
  check('while the bar keeps reporting', /John 3:/.test(await ref(page)), await ref(page))
  // And the way back.
  await page.locator('.nowref').click()
  await page.waitForTimeout(1600) // a smooth scroll of several thousand pixels
  const back = await page.evaluate(() => {
    const el = document.querySelector('.verse.speaking')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { onScreen: r.top > 0 && r.bottom < window.innerHeight }
  })
  check('and tapping the reference brings the verse back', back?.onScreen === true, JSON.stringify(back))
  await ctx.close()
}

// Flowing mode renders no column head. It used to have no way to start audio at all —
// only a corner button saying "stop", reachable solely by starting a chapter in the
// parallel view and switching. Its progress row carries the play now.
// A flowing-mode deep link used to open the book's first chapter whatever it named.
// `pos` was right; with no scroll target pending, the observer derived the chapter back
// from a scroll position of zero and overwrote it before anything had scrolled.
console.log('\nA flowing-mode deep link opens the chapter it names')
{
  const { ctx, page } = await open('#/john/3/en', { flow: true })
  await page.waitForTimeout(1200)
  const nav = (await page.locator('.navbtn').innerText()).replace(/\s+/g, ' ').trim()
  check('the header names John 3', /John 3\b/.test(nav), nav)
  check('and the page is scrolled to it', (await page.evaluate(() => window.scrollY)) > 500,
    `scrollY ${Math.round(await page.evaluate(() => window.scrollY))}`)
  await ctx.close()
}

console.log('\nIt is the same bar in flowing mode')
{
  const { ctx, page } = await open('#/john/1/en', { flow: true })
  check('nothing at rest', (await page.locator('.nowplay').count()) === 0)
  check('but there is something to press', (await page.locator('.flowplay').count()) === 1)
  await page.locator('.flowplay').click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await spokenAtLeast(page, 2)
  await page.waitForTimeout(150)
  check('and it reports the same way', /^John 1:\d+$/.test(await ref(page)), await ref(page))
  check('over the chapter it is reading', /of 51$/.test(await pos(page)), await pos(page))
  await page.locator('.nowbtn[title="Stop audio"]').click()
  await page.waitForTimeout(300)
  check('and stop clears it here too', (await page.locator('.nowplay').count()) === 0)
  await ctx.close()
}

// Everything that genuinely ends playback used to leave the bar behind, naming a verse
// nothing was reading. Each of these cancelled the speech and told the transport
// nothing.
console.log('\nThe bar goes when the audio does')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await page.locator('.colplay').first().click() // the same button, now a stop
  await page.waitForTimeout(300)
  check('stopping from the column head clears it', (await page.locator('.nowplay').count()) === 0)

  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await page.locator('.chapnav .mini, .colpage .mini').first().click().catch(() => {})
  await page.evaluate(() => { location.hash = '#/john/4/en' })
  await page.waitForTimeout(700)
  check('and so does navigating away', (await page.locator('.nowplay').count()) === 0)
  await ctx.close()
}

console.log('\nA single verse takes the bar down with it')
{
  const { ctx, page } = await open('#/john/3/en', {}, 4000)
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await page.locator('.nowbtn.play').click() // pause, so the bar stays
  await page.waitForTimeout(300)
  check('a paused run keeps its bar', (await page.locator('.nowplay').count()) === 1)
  await page.locator('#v-en-10').click()
  await page.locator('#v-en-10 .vbar').waitFor({ state: 'visible' })
  // Paused, so there is no playhead being *read* — but there is one to move, and the
  // cell says so rather than offering a one-verse detour that would kill the run.
  check('the cell still offers the playhead', (await page.locator('#v-en-10 .vbar .vlabel').nth(4).innerText()) === 'Read on',
    await page.locator('#v-en-10 .vbar .vlabel').nth(4).innerText())
  await ctx.close()
}

// With "stop at chapter end" off the run rolls into the next chapter. The transport
// used to go on showing the chapter that had finished — its old list, its old count.
console.log('\nRolling into the next chapter moves the bar with it')
{
  const { ctx, page } = await open('#/john/3/en', { stopAtChapterEnd: false }, 20)
  await page.locator('.colplay').first().click()
  await page.locator('.nowplay').waitFor({ state: 'visible' })
  await page.waitForFunction(() => /John 4:/.test(document.querySelector('.nowlabel')?.textContent ?? ''),
    null, { timeout: 20000 })
  check('it names the new chapter', /^John 4:/.test(await ref(page)), await ref(page))
  check('and counts over it, not the old one', /of 54$/.test(await pos(page)), await pos(page))
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
