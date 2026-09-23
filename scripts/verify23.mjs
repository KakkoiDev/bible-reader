// A reading plan day you can put down and pick up.
//
// Run:  npx vite preview --port 4189 --strictPort
//       node scripts/verify23.mjs
//
// A day is usually several chapters, so stopping part way through one is the normal
// case. Three things were missing for it, and all three are checked here:
//
//   - reopening a day put you back at its first verse however much of it you had
//     read. The per-verse tick was already stored; nothing read it back.
//   - once a day was playing there was no control anywhere to stop it. The audio
//     button is flow-mode only, a day renders no column head to hold one, and the
//     planner had already closed behind you.
//   - the day could only be read from its beginning. No way to say "from here".
//
// A fourth followed from the third: a day's verses carried no actions at all, so a
// note could not be written on the passage the reader was actually reading. They now
// carry the reader's own six-cell bar — everything in it is keyed by a verse
// reference, which a day has as surely as a chapter does.
//
// Playback is stubbed the way verify14 and verify22 do it, so "how much was read and
// from where" is the list of utterances handed over rather than something audible.
import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4189/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()

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
      speaking: false, paused: false, pending: false,
      getVoices: () => [{ name: 'Alex', lang: 'en-US', default: true, localService: true, voiceURI: 'Alex' }],
      addEventListener() {}, removeEventListener() {}, cancel() {}, pause() {}, resume() {},
      speak(u) {
        spoken.push(u.text)
        setTimeout(() => u.onstart?.(new Event('start')), 0)
        // Slow enough that a pause can land in the middle of the run. verify22's 1ms
        // would have the whole day spoken before the button could be pressed.
        setTimeout(() => u.onend?.(new Event('end')), 25)
      },
    },
  })
  window.__spoken = spoken
}

// John, a chapter a day: day one is John 1, which is 51 verses.
const PLAN = () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  localStorage.setItem('prefs', JSON.stringify({
    theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
    voice: 'male', swipe: false, flow: false, stopAtChapterEnd: true, ui: 'en', columns: ['en'],
  }))
  localStorage.setItem('plans.v1', JSON.stringify([{
    id: 'j', name: 'John', scope: { kind: 'books', slugs: ['john'] },
    days: 21, repeat: false, order: 0, startedAt: start.getTime(),
  }]))
}

async function openPlanDay({ progress } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(PLAN)
  await ctx.addInitScript(STUB)
  if (progress) await ctx.addInitScript((p) => localStorage.setItem('plan-progress.v1', JSON.stringify(p)), progress)
  const page = await ctx.newPage()
  await page.goto(URL + '#/genesis/1/en', { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  await page.locator('.icon[title="Reading plan"]').click()
  await page.locator('.pblock').waitFor({ state: 'visible' })
  await page.locator('.pblock .pactions .primary').click() // Read now
  await page.locator('.patch .vt').first().waitFor({ state: 'visible' })
  await page.waitForTimeout(700)
  return { ctx, page }
}

const settled = async (page) => {
  await page
    .waitForFunction(
      () => {
        const n = window.__spoken.length
        const stable = n > 0 && n === window.__last
        window.__last = n
        return stable
      },
      null,
      { timeout: 20000, polling: 300 },
    )
    .catch(() => {})
  return page.evaluate(() => window.__spoken)
}

// Verses 1-20 of John 1 already read: the day should open at 21, not at 1.
const PART_READ = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`john.1.${i + 1}`, true]))

console.log('\nA part-read day opens where it was left')
{
  const { ctx, page } = await openPlanDay({ progress: PART_READ })
  const where = await page.evaluate(() => {
    const box = (id) => document.getElementById(id)?.getBoundingClientRect() ?? null
    const vh = window.innerHeight
    const r = box('pv-john-1-21')
    return {
      scrollY: window.scrollY,
      // How far the first unread verse sits from the middle of the window, as a
      // fraction of it. `block: 'center'` is deliberate: landing the resume verse
      // under the header would hide the last verses read, and the reader coming back
      // to a passage wants to see where they stopped, not just what comes next.
      offCentre: r ? Math.abs((r.top + r.bottom) / 2 - vh / 2) / vh : null,
      firstVerseVisible: (() => {
        const f = box('pv-john-1-1')
        return !!f && f.bottom > 84 && f.top < vh
      })(),
    }
  })
  check('the day is scrolled, not reset', where.scrollY > 200, `scrollY ${Math.round(where.scrollY)}`)
  check('verse 1 is off the top', !where.firstVerseVisible)
  check(
    'the first verse not yet read is centred',
    where.offCentre !== null && where.offCentre < 0.12,
    `${where.offCentre === null ? 'not found' : (where.offCentre * 100).toFixed(1) + '% off centre'}`,
  )
  await ctx.close()
}

console.log('\nA day with nothing read still opens at the top')
{
  const { ctx, page } = await openPlanDay()
  check('no scroll', (await page.evaluate(() => window.scrollY)) < 40)
  await ctx.close()
}

console.log('\nPlaying a part-read day starts where it was left')
{
  const { ctx, page } = await openPlanDay({ progress: PART_READ })
  await page.locator('.audiofab').click()
  const spoken = await settled(page)
  check('51 verses less the 20 read is 31', spoken.length === 31, `${spoken.length} utterance(s)`)
  check('starting at John 1:21', /^And they asked him/.test(spoken[0]), spoken[0]?.slice(0, 44))
  await ctx.close()
}

console.log('\nThe day has a transport, and pause resumes where it stopped')
{
  const { ctx, page } = await openPlanDay()
  check('the button is there before anything plays', (await page.locator('.audiofab').count()) === 1)
  check('and it offers to read the day', (await page.locator('.audiofab').getAttribute('title')) === 'Read the day aloud')
  await page.locator('.audiofab').click()
  // Let a few verses go by, then pause mid-run.
  await page.waitForFunction(() => window.__spoken.length >= 4, null, { timeout: 8000 })
  check('it turns into a pause', (await page.locator('.audiofab').getAttribute('title')) === 'Pause')
  await page.locator('.audiofab').click()
  await page.waitForTimeout(600)
  const atPause = await page.evaluate(() => window.__spoken.length)
  await page.waitForTimeout(600)
  check('pausing really stops the voice', (await page.evaluate(() => window.__spoken.length)) === atPause, `${atPause}`)
  check('and the button offers to start again', (await page.locator('.audiofab').getAttribute('title')) === 'Read the day aloud')
  await page.evaluate(() => { window.__spoken.length = 0; window.__last = 0 })
  await page.locator('.audiofab').click()
  const after = await settled(page)
  // Resuming at the top of the verse it was interrupted in: 51 verses, minus the ones
  // finished before the pause.
  check('it resumes rather than restarting', after.length === 51 - (atPause - 1), `${after.length} of 51, paused at ${atPause}`)
  check('and does not repeat John 1:1', !/^In the beginning was the Word/.test(after[0]), after[0]?.slice(0, 44))
  await ctx.close()
}

console.log('\nA day\'s verses carry the reader\'s own bar')
{
  const { ctx, page } = await openPlanDay()
  check('a verse carries no bar until it is tapped', (await page.locator('.patch .vbar').count()) === 0)
  await page.locator('#pv-john-1-40').click()
  await page.locator('#pv-john-1-40 .vbar').waitFor({ state: 'visible' })
  const cells = await page.locator('#pv-john-1-40 .vbar .vlabel').allInnerTexts()
  check('six cells, the same as everywhere else', cells.length === 6, cells.join(' · '))
  check('Note among them', cells.includes('Note'))
  check('and the play cell is the day\'s, not one verse', cells.includes('Read on'), cells[4])
  // Measured against an unclipped probe, not `scrollWidth`. A `text-overflow` label
  // shrinks to fit, so its scrollWidth equals its clientWidth whether or not the text
  // was cut — that comparison reports every label as fine and caught nothing. "From
  // here" needed 50.1px in 50px of box and lost two characters to a tenth of a pixel.
  await page.evaluate(() => document.fonts.ready)
  const room = await page.evaluate(() => {
    const cell = document.querySelector('.patch .vbar .vbtn')
    const cs = getComputedStyle(cell.querySelector('.vlabel'))
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.whiteSpace = 'nowrap'
    probe.style.font = `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
    probe.style.letterSpacing = cs.letterSpacing
    cell.appendChild(probe)
    const p = getComputedStyle(cell)
    const box = cell.getBoundingClientRect().width - parseFloat(p.paddingLeft) - parseFloat(p.paddingRight)
    const out = [...document.querySelectorAll('.patch .vbar .vlabel')].map((e) => {
      probe.textContent = e.textContent
      return { text: e.textContent, needs: probe.getBoundingClientRect().width, box }
    })
    probe.remove()
    return out
  })
  const tight = room.filter((r) => r.needs > r.box - 2)
  check('every label fits its cell with room to spare', tight.length === 0,
    tight.map((r) => `${r.text} needs ${r.needs.toFixed(1)} of ${r.box.toFixed(1)}`).join('; '))
  await ctx.close()
}

// The reason this exists. A note written in a day is a note: same store, same key,
// same mark on the verse, visible from the reader afterwards.
console.log('\nA note can be written on a verse of the day')
{
  const { ctx, page } = await openPlanDay()
  await page.locator('#pv-john-1-14').click()
  await page.locator('#pv-john-1-14 .vbar').waitFor({ state: 'visible' })
  await page.locator('#pv-john-1-14 .vbar .vbtn', { hasText: 'Note' }).click()
  await page.locator('.notearea').waitFor({ state: 'visible' })
  check('the editor names the verse', (await page.locator('.sheet-title').innerText()).includes('John 1:14'),
    await page.locator('.sheet-title').innerText())
  await page.locator('.notearea').fill('the Word was made flesh')
  await page.locator('.sheet .primary', { hasText: 'Save' }).click()
  await page.waitForTimeout(400)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('annotations.v1') || '{}'))
  check('it is stored under the verse\'s own reference', saved['john.1.14']?.note === 'the Word was made flesh',
    JSON.stringify(Object.keys(saved)))
  check('and the verse now carries the mark', (await page.locator('#pv-john-1-14 .mk.note').count()) === 1)
  // The same note, from the ordinary reader.
  await page.goto(URL + '#/john/1/en', { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  check('the reader shows the same note', (await page.locator('#v-en-14 .mk.note').count()) === 1)
  await ctx.close()
}

console.log('\nHighlight and bookmark work there too')
{
  const { ctx, page } = await openPlanDay()
  await page.locator('#pv-john-1-12').click()
  await page.locator('#pv-john-1-12 .vbar .vbtn', { hasText: 'Bookmark' }).click()
  await page.waitForTimeout(300)
  check('bookmarking marks the verse', (await page.locator('#pv-john-1-12 .mk.bm').count()) === 1)
  await page.locator('#pv-john-1-12 .vbar .vbtn', { hasText: 'Highlight' }).click()
  await page.locator('#pv-john-1-12 .vbar .swatch').first().click()
  await page.waitForTimeout(300)
  const ann = await page.evaluate(() => JSON.parse(localStorage.getItem('annotations.v1') || '{}'))
  check('and the highlight is stored under the same key',
    ann['john.1.12']?.bookmarked === true && ann['john.1.12']?.highlights?.length === 1,
    JSON.stringify(ann['john.1.12']))
  check('with the verse text saved on it, as the reader does',
    typeof ann['john.1.12']?.highlights?.[0]?.text === 'string' && ann['john.1.12'].highlights[0].text.length > 20)
  await ctx.close()
}

// The copy actions used to name whatever book the day happened to be scrolled to.
console.log('\nShare names the verse\'s own book, not the scrolled-to one')
{
  const { ctx, page } = await openPlanDay()
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('#pv-john-1-18').click()
  await page.locator('#pv-john-1-18 .vbar .vbtn', { hasText: 'Share' }).click()
  await page.locator('.patch .vbar .vbtn', { hasText: 'Copy link' }).click()
  await page.waitForTimeout(400)
  const url = await page.evaluate(() => navigator.clipboard.readText())
  check('the link points at John 1:18', /john\/1\/.*18/.test(url) || /john.*1.*18/.test(url), url)
  await ctx.close()
}

console.log('\nAny verse of the day can start the reading')
{
  const { ctx, page } = await openPlanDay()
  await page.locator('#pv-john-1-40').click()
  await page.locator('#pv-john-1-40 .vbar').waitFor({ state: 'visible' })
  await page.locator('#pv-john-1-40 .vbar .vbtn', { hasText: 'Read on' }).click()
  const spoken = await settled(page)
  check('John 1:40 to the end of the day is 12 verses', spoken.length === 12, `${spoken.length} utterance(s)`)
  check('starting at verse 40', /Andrew, Simon Peter's brother/.test(spoken[0]), spoken[0]?.slice(0, 44))
  check('the bar closed behind it', (await page.locator('.patch .vbar').count()) === 0)
  await ctx.close()
}

console.log('\nThe day is still the whole run')
{
  const { ctx, page } = await openPlanDay()
  await page.locator('.audiofab').click()
  const spoken = await settled(page)
  check('all 51 verses of John 1', spoken.length === 51, `${spoken.length} utterance(s)`)
  check('and it did not roll on into John 2', !spoken.some((s) => /there was a marriage in Cana/i.test(s)))
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
