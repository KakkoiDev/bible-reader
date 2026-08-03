// The reading planner, in the browser.
//
// verify15.mjs covers the arithmetic without a page. This is the other half: that the
// sheet builds a block, that today's reading is the day the calendar says and not the
// first day of the plan, that "Read now" opens the day as one passage with a book
// heading at each seam and no verse numbers, and that ticking a chapter off persists.
//
// Plans are seeded through localStorage rather than by driving the form, except in the
// one section that is about the form. A plan's whole contract is that it is a pure
// function of its start date, so a seeded block dated ten days ago is exactly what a
// reader who started ten days ago has.
//
// Run:  npx vite preview --port 4184 --strictPort
//       node scripts/verify16.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:4184/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const PREFS = {
  theme: 'light', size: 'md', furigana: false, align: false, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: false, ui: 'en',
  columns: ['en'],
}

/** Midnight `n` days before today, in the browser's own zone, as the app computes it. */
const daysAgo = (n) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - n * 86400000
}

const plan = (over = {}) => ({
  id: 'seed', name: 'Proverbs in a month', scope: { kind: 'books', slugs: ['proverbs'] },
  days: 30, repeat: false, order: 0, startedAt: daysAgo(0), ...over,
})

// A synthesiser that says nothing and finishes instantly, borrowed from verify14.
// Headless Chromium ships no voices and the app refuses to speak into a language that
// has none, so one has to be reported for the run to start at all.
const STUB = () => {
  const spoken = []
  const voices = [{ name: 'Alex', lang: 'en-US', default: true, localService: true, voiceURI: 'Alex' }]
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text
    }
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speaking: false, paused: false, pending: false,
      getVoices: () => voices,
      addEventListener() {}, removeEventListener() {}, cancel() {}, pause() {}, resume() {},
      speak(u) {
        spoken.push(u.text)
        setTimeout(() => u.onstart?.(new Event('start')), 0)
        setTimeout(() => u.onend?.(new Event('end')), 1)
      },
    },
  })
  window.__spoken = spoken
}

async function open({ plans = [], progress = {}, phone = false, tts = false } = {}) {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 } })
  // addInitScript runs on every navigation, so seeding unconditionally would wipe
  // whatever the app wrote before a reload. Seed once and let the reload be a reload.
  await ctx.addInitScript(
    ([p, blocks, prog]) => {
      if (localStorage.getItem('seeded')) return
      localStorage.setItem('prefs', JSON.stringify(p))
      localStorage.setItem('plans.v1', JSON.stringify(blocks))
      localStorage.setItem('plan-progress.v1', JSON.stringify(prog))
      localStorage.setItem('seeded', '1')
    },
    [PREFS, plans, progress],
  )
  if (tts) await ctx.addInitScript(STUB)
  const page = await ctx.newPage()
  await page.goto(URL + '#/john/3/en', { waitUntil: 'networkidle' })
  await page.locator('.col').first().waitFor({ state: 'visible' })
  return { ctx, page }
}

const openPlanner = async (page) => {
  await page.locator('header .icon[title="Reading plan"]').click()
  await page.locator('.sheet').waitFor({ state: 'visible' })
}

console.log('\nThe planner opens from the header')
{
  const { ctx, page } = await open()
  const btn = page.locator('header .icon[title="Reading plan"]')
  check('a calendar control sits in the header', (await btn.count()) === 1, `${await btn.count()}`)
  const box = await btn.boundingBox()
  check('and it is a 44pt target', box.width >= 44 && box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`)
  // It must not be an emoji: the icon set is the only place a glyph comes from.
  check('drawn from the icon set, not an emoji', (await btn.locator('svg.ic').count()) === 1)
  await openPlanner(page)
  check('with nothing set up it says what a plan does',
    (await page.locator('.sheet .empty').innerText()).includes('a few chapters a day'),
    await page.locator('.sheet .empty').innerText())
  check('and offers to make one', (await page.locator('.pnew').innerText()).includes('New plan'))
  await ctx.close()
}

console.log('\nBuilding a plan takes four taps')
{
  const { ctx, page } = await open()
  await openPlanner(page)
  await page.locator('.pnew').click()
  check('the advanced block is closed', (await page.locator('.padv').evaluate((e) => e.open)) === false)
  await page.locator('.chip', { hasText: 'One book' }).click()
  await page.locator('.pselect').selectOption('proverbs')
  await page.locator('.chip', { hasText: 'A month' }).click()
  check('it says what a day will cost before committing',
    (await page.locator('.pform .pmeta').innerText()).includes('31 chapters'),
    await page.locator('.pform .pmeta').innerText())
  await page.locator('.pactions .primary').click()
  check('the block appears', (await page.locator('.pblock').count()) === 1)
  check('named after what it covers', (await page.locator('.pblock-id b').innerText()) === 'Proverbs',
    await page.locator('.pblock-id b').innerText())
  check("and today's reading is the first chapter",
    (await page.locator('.pref').innerText()) === 'Proverbs 1', await page.locator('.pref').innerText())

  // The store is the contract with the next session, so assert its shape, not the DOM.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plans.v1')))
  check('and it is written down', saved.length === 1 && saved[0].days === 30 && saved[0].scope.slugs[0] === 'proverbs',
    JSON.stringify(saved[0]?.scope))
  await ctx.close()
}

console.log('\nA missed day does not move today')
{
  // Ten days in, nothing read. Day 10 of a 31-over-30 split is Proverbs 11.
  const { ctx, page } = await open({ plans: [plan({ startedAt: daysAgo(10) })] })
  await openPlanner(page)
  check('today is day eleven, not day one', (await page.locator('.pref').innerText()) === 'Proverbs 11',
    await page.locator('.pref').innerText())
  check('and nothing accuses the reader of the ten days',
    !(await page.locator('.sheet').innerText()).match(/behind|missed|catch up/i))
  check('the days remaining are counted', (await page.locator('.pblock .pmeta').innerText()).includes('20 days to go'),
    await page.locator('.pblock .pmeta').innerText())
  await ctx.close()
}

console.log('\nA plan that has run out says so instead of repeating')
{
  const { ctx, page } = await open({ plans: [plan({ startedAt: daysAgo(40) })] })
  await openPlanner(page)
  check('it reads as finished', (await page.locator('.pstate').innerText()) === 'Finished',
    await page.locator('.pstate').innerText())
  check('and offers nothing to read', (await page.locator('.pactions').count()) === 0)
  await ctx.close()
}
{
  const { ctx, page } = await open({ plans: [plan({ startedAt: daysAgo(40), repeat: true })] })
  await openPlanner(page)
  check('unless it repeats, when day 41 is day 11', (await page.locator('.pref').innerText()) === 'Proverbs 11',
    await page.locator('.pref').innerText())
  check('and the row says it repeats', (await page.locator('.pblock-id small').innerText()).includes('repeats'),
    await page.locator('.pblock-id small').innerText())
  await ctx.close()
}

console.log('\nRead now opens the day as one passage')
{
  // A day that crosses a book boundary, so the seam has to be visible.
  const acrossBooks = plan({
    scope: { kind: 'chapters', refs: ['jude.1', '3-john.1', 'revelation.1'] },
    days: 1, startedAt: daysAgo(0),
  })
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await openPlanner(page)
  check('the day names all three chapters', (await page.locator('.pref').innerText()).includes('Jude 1'),
    await page.locator('.pref').innerText())
  await page.locator('.pactions .primary').click()
  await page.locator('.patch').waitFor({ state: 'visible' })

  check('the header says it is today\'s reading', (await page.locator('h1.ref').innerText()) === "Today's reading",
    await page.locator('h1.ref').innerText())
  const heads = await page.locator('.patchbook').allInnerTexts()
  check('one faint book heading per book, in reading order', heads.join(',') === 'JUDE,3 JOHN,REVELATION',
    heads.join(','))
  const faint = await page.locator('.patchbook').first().evaluate((e) => getComputedStyle(e).color)
  const body = await page.locator('.patch .fpar').first().evaluate((e) => getComputedStyle(e).color)
  check('the heading is quieter than the text it introduces', faint !== body, `${faint} vs ${body}`)

  check('three chapters are rendered', (await page.locator('.patchchap').count()) === 3)
  check('with no verse numbers', (await page.locator('.patch .vn').count()) === 0)
  check('and no verse rows from the ordinary reader', (await page.locator('.patch .verse').count()) === 0)
  // The verses have to be real text, not placeholders: this is the only check that the
  // second and third books were actually fetched.
  const words = await page.locator('.patchchap').nth(2).locator('.fpar').innerText()
  check('the last book of the day has its text', words.length > 400, `${words.length} chars`)
  await ctx.close()
}

console.log('\nA chapter ticks off, and stays ticked')
{
  const one = plan({ scope: { kind: 'chapters', refs: ['jude.1'] }, days: 1, startedAt: daysAgo(0) })
  const { ctx, page } = await open({ plans: [one], phone: true })
  await openPlanner(page)
  check('nothing is read yet', (await page.locator('.pblock .pmeta').innerText()).includes('0 of 1'),
    await page.locator('.pblock .pmeta').innerText())
  await page.locator('.pactions .primary').click()
  await page.locator('.patch').waitFor({ state: 'visible' })

  const tick = page.locator('.ptick')
  check('the tick offers to mark it read', (await tick.innerText()).includes('Mark as read'), await tick.innerText())
  const box = await tick.boundingBox()
  check('and it is a 44pt target', box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`)
  await tick.click()
  check('it flips to offering the undo', (await tick.innerText()).includes('Mark as unread'), await tick.innerText())
  check('and the chapter dims', await page.locator('.patchchap').first().evaluate((e) => e.classList.contains('read')))

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-progress.v1')))
  check('one chapter key, not one key per verse', JSON.stringify(stored) === '{"jude.1":true}', JSON.stringify(stored))

  await page.reload({ waitUntil: 'networkidle' })
  await openPlanner(page)
  check('and after a reload the plan knows', (await page.locator('.pblock .pmeta').innerText()).includes('Read.'),
    await page.locator('.pblock .pmeta').innerText())
  await ctx.close()
}

console.log("\nPlay reads the day, across books, and ticks off as it goes")
{
  const acrossBooks = plan({
    scope: { kind: 'chapters', refs: ['jude.1', '3-john.1'] },
    days: 1, startedAt: daysAgo(0),
  })
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true, tts: true })
  await openPlanner(page)
  await page.locator('.pactions .mini').click()
  await page.locator('.patch').waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => {
      const n = window.__spoken?.length ?? 0
      const stable = n > 0 && n === window.__last
      window.__last = n
      return stable
    },
    null,
    { timeout: 20000, polling: 250 },
  )
  const spoken = await page.evaluate(() => window.__spoken)
  // Jude is 25 verses and this KJV's 3 John is the maximal 15. The run must be both
  // books, not one of them twice and not the next chapter of the last one.
  check('the whole day is read, both books', spoken.length === 40, `${spoken.length} utterances`)
  check('starting at Jude 1:1', spoken[0].startsWith('Jude, the servant of Jesus Christ'), spoken[0].slice(0, 40))
  check('and ending at 3 John 1:15', spoken[39].includes('Greet the friends by name'), spoken[39].slice(-40))

  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-progress.v1')))
  // The last verse of the run is the one at risk: onDone clears the speaking state in
  // the same commit, so a tick derived from that state loses it and the chapter never
  // collapses. Both chapters being single keys is what proves it did not.
  check('speaking a chapter marks it read', done['jude.1'] === true && done['3-john.1'] === true,
    Object.keys(done).join(' '))
  check('and it collapsed to two keys, not forty', Object.keys(done).length === 2,
    `${Object.keys(done).length}`)
  await ctx.close()
}

console.log('\nScrolling past a verse ticks it off, but only after dwelling on it')
{
  const one = plan({ scope: { kind: 'chapters', refs: ['jude.1'] }, days: 1, startedAt: daysAgo(0) })
  const { ctx, page } = await open({ plans: [one], phone: true })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await page.locator('.patch').waitFor({ state: 'visible' })

  const keys = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('plan-progress.v1') || '{}')))
  // A fling to the bottom must not mark the whole day read on the way past.
  await page.mouse.wheel(0, 4000)
  await page.mouse.wheel(0, -4000)
  await page.waitForTimeout(200)
  check('a fling through the passage marks nothing', (await keys()).length === 0, (await keys()).join(' '))

  await page.waitForTimeout(1400)
  const after = await keys()
  check('settling on the passage marks what is on screen', after.length > 0, `${after.length} verses`)
  check('as verse keys, not a whole chapter nobody read',
    after.every((k) => /^jude\.1\.\d+$/.test(k)) && !after.includes('jude.1'), after.slice(0, 3).join(' '))
  check('and the tick control has not flipped, since the chapter is not finished',
    (await page.locator('.ptick').innerText()).includes('Mark as read'))
  await ctx.close()
}

console.log('\nBlocks reorder, and the order survives')
{
  const a = plan({ id: 'a', name: 'First', order: 0 })
  const b = plan({ id: 'b', name: 'Second', order: 1 })
  const { ctx, page } = await open({ plans: [a, b] })
  await openPlanner(page)
  check('two blocks, in order', (await page.locator('.pblock-id b').allInnerTexts()).join(',') === 'First,Second')
  check('the top one cannot go up',
    await page.locator('.pblock').first().locator('.dmove button').first().isDisabled())
  await page.locator('.pblock').nth(1).locator('.dmove button').first().click()
  check('moving the second up swaps them',
    (await page.locator('.pblock-id b').allInnerTexts()).join(',') === 'Second,First',
    (await page.locator('.pblock-id b').allInnerTexts()).join(','))
  const orders = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('plans.v1')).sort((x, y) => x.order - y.order).map((x) => `${x.name}:${x.order}`))
  check('and the stored order is a clean 0..n', orders.join(',') === 'Second:0,First:1', orders.join(','))
  await ctx.close()
}

console.log('\nDeleting a block leaves the rest contiguous')
{
  const a = plan({ id: 'a', name: 'First', order: 0 })
  const b = plan({ id: 'b', name: 'Second', order: 1 })
  const { ctx, page } = await open({ plans: [a, b] })
  await openPlanner(page)
  await page.locator('.pblock').first().locator('.icon').click()
  check('one block left', (await page.locator('.pblock').count()) === 1)
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem('plans.v1')))
  check('and it is renumbered to 0', left.length === 1 && left[0].order === 0, JSON.stringify(left))
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
