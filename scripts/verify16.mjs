// The reading planner, in the browser.
//
// verify15.mjs covers the arithmetic without a page. This is the other half: that the
// sheet builds a block, that today's reading is the day the calendar says and not the
// first day of the plan, that "Read now" opens the day as one passage with a book
// heading at each seam, in whichever of the reader's two modes is on and with the
// selectors moved onto the day, and that ticking a chapter off persists.
//
// Plans are seeded through localStorage rather than by driving the form, except in the
// one section that is about the form. A plan's whole contract is that it is a pure
// function of its start date, so a seeded block dated ten days ago is exactly what a
// reader who started ten days ago has.
//
// Run:  npx vite preview --port 4184 --strictPort
//       node scripts/verify16.mjs
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

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

async function open({ plans = [], progress = {}, anns = {}, phone = false, tts = false, flow = false, columns = PREFS.columns } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    acceptDownloads: true,
  })
  // addInitScript runs on every navigation, so seeding unconditionally would wipe
  // whatever the app wrote before a reload. Seed once and let the reload be a reload.
  await ctx.addInitScript(
    ([p, blocks, prog, ann]) => {
      if (localStorage.getItem('seeded')) return
      localStorage.setItem('prefs', JSON.stringify(p))
      localStorage.setItem('plans.v1', JSON.stringify(blocks))
      localStorage.setItem('plan-progress.v1', JSON.stringify(prog))
      localStorage.setItem('annotations.v1', JSON.stringify(ann))
      localStorage.setItem('seeded', '1')
    },
    [{ ...PREFS, flow, columns }, plans, progress, anns],
  )
  if (tts) await ctx.addInitScript(STUB)
  const page = await ctx.newPage()
  await page.goto(URL + '#/john/3/en', { waitUntil: 'networkidle' })
  // Either shape of the reader: flow mode has no columns.
  await page.locator('.col, .flow').first().waitFor({ state: 'visible' })
  return { ctx, page }
}

const openPlanner = async (page) => {
  await page.locator('header .icon[title="Reading plan"]').click()
  await page.locator('.sheet').waitFor({ state: 'visible' })
}

/** A day is complete only once every book it spans has been fetched; `.patch` appears
 *  with the first one, so counting verses before this races the other two. */
const readDay = async (page, chapters) => {
  await page.locator('.patch').waitFor({ state: 'visible' })
  await page.waitForFunction(
    (n) => document.querySelectorAll('.patchchap').length === n &&
      [...document.querySelectorAll('.patchchap')].every((c) => c.innerText.length > 200),
    chapters,
  )
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

// A day that crosses a book boundary, so the seam has to be visible. Jude's 25 verses,
// this KJV's maximal 15 in 3 John and Revelation 1's 20 make 60.
const acrossBooks = plan({
  scope: { kind: 'chapters', refs: ['jude.1', '3-john.1', 'revelation.1'] },
  days: 1, startedAt: daysAgo(0),
})

console.log('\nRead now opens the day as one passage, and moves the reader to it')
{
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await openPlanner(page)
  check('the day names all three chapters', (await page.locator('.pref').innerText()).includes('Jude 1'),
    await page.locator('.pref').innerText())
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)

  check('the header says it is today\'s reading', (await page.locator('h1.ref').innerText()) === "Today's reading",
    await page.locator('h1.ref').innerText())
  // The selector used to keep naming whatever was being read before the day was opened.
  check('and the selector names the chapter the day starts at, not the one left behind',
    (await page.locator('.navbtn').innerText()).trim().startsWith('Jude 1'),
    await page.locator('.navbtn').innerText())
  check('which is marked as the day rather than ordinary browsing',
    await page.locator('.navbtn').evaluate((e) => e.classList.contains('onplan')))
  const heads = await page.locator('.patchbook').allInnerTexts()
  check('one faint book heading per book, in reading order', heads.join(',') === 'JUDE,3 JOHN,REVELATION',
    heads.join(','))
  const faint = await page.locator('.patchbook').first().evaluate((e) => getComputedStyle(e).color)
  const body = await page.locator('.patchchap').first().evaluate((e) => getComputedStyle(e).color)
  check('the heading is quieter than the text it introduces', faint !== body, `${faint} vs ${body}`)

  check('three chapters are rendered', (await page.locator('.patchchap').count()) === 3)
  // A day is whole chapters, so "end of Jude 1" would be a claim about a chapter the
  // passage ran straight past.
  check('and the chapter-end row is not offered inside a day', (await page.locator('.chapend').count()) === 0)
  // The verses have to be real text, not placeholders: this is the only check that the
  // second and third books were actually fetched.
  const words = await page.locator('.patchchap').nth(2).innerText()
  check('the last book of the day has its text', words.length > 400, `${words.length} chars`)
  await ctx.close()
}

console.log('\nAnd it is set in the mode the reader is already in, not one of its own')
{
  // The seeded preference is the app's default, which is verse mode.
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)
  check('verse mode sets the day as numbered verses', (await page.locator('.patch .verses .verse').count()) === 60,
    `${await page.locator('.patch .verses .verse').count()} rows`)
  check('with a number on every one', (await page.locator('.patch .vn').count()) === 60)
  check('and no flowing paragraph', (await page.locator('.patch .fpar').count()) === 0)
  await ctx.close()
}
{
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true, flow: true })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)
  check('flow mode runs the same day on as prose', (await page.locator('.patch .fpar').count()) === 3,
    `${await page.locator('.patch .fpar').count()} paragraphs`)
  check('with no verse numbers', (await page.locator('.patch .vn').count()) === 0)
  check('and no verse rows from the ordinary reader', (await page.locator('.patch .verse').count()) === 0)
  await ctx.close()
}

console.log('\nLeaving a day is a chapter away, and the day is where it leaves you')
{
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true, columns: ['en', 'fr'] })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)
  // The ring is the one control that must not be an exit: it is which translation the
  // day is read in, not which passage.
  await page.locator('.ringtab', { hasText: 'Français' }).click()
  await page.waitForTimeout(600)
  check('changing edition keeps the day', (await page.locator('.patch').count()) === 1)
  check('and re-reads it in the other translation',
    (await page.locator('.patch').getAttribute('lang')) === 'fr', await page.locator('.patch').getAttribute('lang'))

  // The way back sits at the end of the day, so reaching it is a scroll through the
  // passage and the selector has followed it there. Scroll first and read the selector
  // before the click: leaving with the click's own scroll still in flight is what
  // decides between the day's first and last chapter, and neither is the thing under
  // test here.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }))
  await page.waitForTimeout(400)
  const onScreen = (await page.locator('.navbtn').innerText()).trim()
  await page.locator('.patchdone').click()
  await page.locator('.reader .cols').waitFor({ state: 'visible' })
  check('the way back leaves the day', (await page.locator('.patch').count()) === 0)
  check('and lands on the chapter that was being read, not the one before the day',
    onScreen.startsWith('Revelation 1') &&
      (await page.locator('.navbtn').innerText()).trim().startsWith('Revelation 1'),
    `${onScreen} then ${(await page.locator('.navbtn').innerText()).trim()}`)
  check('with the day marking gone', !(await page.locator('.navbtn').evaluate((e) => e.classList.contains('onplan'))))
  await ctx.close()
}
{
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)
  // Naming a chapter is the other way out, and the navigator opens on the day's book
  // now that the selector has moved.
  await page.locator('.navbtn').click()
  await page.locator('.sheet.nav').waitFor({ state: 'visible' })
  // The sheet keeps its own copy of the book and adopts the reader's on open, so read
  // it once that has landed rather than on the frame it opened.
  await page.waitForTimeout(300)
  const on = (await page.locator('.sheet.nav .sheet-head b').innerText()).trim()
  check('the navigator opens on the book of the day', on === 'Jude', on)
  await page.locator('.sheet.nav .mini.back').click()
  await page.locator('.bkbtn', { hasText: 'Genesis' }).first().click()
  await page.locator('.chbtn').nth(4).click()
  await page.locator('.reader .cols').waitFor({ state: 'visible' })
  check('choosing a chapter leaves the day rather than being ignored',
    (await page.locator('.patch').count()) === 0)
  check('and goes where it was told', (await page.locator('.navbtn').innerText()).trim().startsWith('Genesis 5'),
    await page.locator('.navbtn').innerText())
  await ctx.close()
}

console.log('\nSwitching mode inside a day does not cost the selector its scroll')
{
  // Flow and verse mode render the day's verses as different elements in the same slot,
  // so the toggle unmounts every `.pverse` the observer holds. If the observer is not
  // rebuilt it keeps the detached nodes and the selector freezes on the day's first
  // chapter however far the reader goes.
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)

  await page.locator('header .icon[title="Settings"]').click()
  await page.locator('.sheet .sgroup').first().waitFor({ state: 'visible' })
  await page.locator('.srow', { hasText: 'Flowing text' }).locator('input[type=checkbox]').check()
  await page.keyboard.press('Escape')
  await page.locator('.sheet').waitFor({ state: 'detached' })
  check('the day is still on screen after the toggle', (await page.locator('.patch').count()) === 1)
  check('and it has been re-set as prose', (await page.locator('.patch .fpar').count()) === 3,
    `${await page.locator('.patch .fpar').count()} paragraphs`)

  // The day's second chapter put just above the observer's band, so nothing of the first
  // is left in it and only the second can win.
  await page.locator('.patchchap').nth(1).evaluate((el) =>
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20 }))
  await page.waitForTimeout(500)
  check('the selector follows the scroll into the second chapter of the day',
    (await page.locator('.navbtn').innerText()).trim().startsWith('3 John 1'),
    await page.locator('.navbtn').innerText())

  // The dwell observer watches the same remounted nodes, so it goes deaf the same way and
  // the day silently stops recording anything the reader has read.
  await page.waitForTimeout(1600)
  const marked = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('plan-progress.v1') || '{}')))
  check('and dwelling still ticks the verses on screen off',
    marked.some((k) => k.startsWith('3-john.1.')), marked.slice(0, 3).join(' ') || '(none)')
  await ctx.close()
}

console.log('\nA back press out of a day leaves the day, rather than renaming it')
{
  // Opening a day writes no hash, but every earlier chapter did, so back lands on one of
  // them. The day used to stay on screen under a header naming a passage that was not in
  // it, and nothing but a scroll would put that right.
  const { ctx, page } = await open({ plans: [acrossBooks], phone: true })
  await page.evaluate(() => { location.hash = '#/john/4/en' })
  await page.waitForFunction(() => document.querySelector('.navbtn')?.innerText.includes('John 4'))
  await openPlanner(page)
  await page.locator('.pactions .primary').click()
  await readDay(page, 3)
  check('the day is open, over the history of two chapters',
    (await page.locator('.navbtn').innerText()).trim().startsWith('Jude 1'), await page.locator('.navbtn').innerText())

  await page.goBack()
  // Swallowed rather than awaited outright: a tree that has not been fixed never drops
  // the day, and this section is worth more as four red checks than as one stack trace.
  await page.locator('.patch').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  check('going back leaves the day', (await page.locator('.patch').count()) === 0)
  check('and lands on the chapter the history entry names',
    (await page.locator('.navbtn').innerText()).trim().startsWith('John 3'), await page.locator('.navbtn').innerText())
  check('with the day marking gone', !(await page.locator('.navbtn').evaluate((e) => e.classList.contains('onplan'))))
  check('and the calendar glyph with it', (await page.locator('.navbtn > svg.ic').count()) === 0,
    `${await page.locator('.navbtn > svg.ic').count()} glyphs`)
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

console.log('\nPlans and notes leave as two files, and either one comes back through either button')
{
  const anns = {
    'john.3.16': {
      note: 'the hinge of the book',
      highlights: [{ lang: 'en', start: 4, end: 20, color: 'yellow' }],
      tags: ['love'],
      createdAt: daysAgo(3),
    },
  }
  const { ctx, page } = await open({ plans: [plan()], progress: { 'proverbs.1.1': true }, anns })
  const settings = async () => {
    await page.locator('header .icon[title="Settings"]').click()
    await page.locator('.sheet .sgroup').first().waitFor({ state: 'visible' })
  }
  const grab = async (row) => {
    const wait = page.waitForEvent('download')
    await page.locator('.srow', { hasText: row }).locator('button.mini').first().click()
    const dl = await wait
    return { name: dl.suggestedFilename(), body: JSON.parse(await readFile(await dl.path(), 'utf8')) }
  }
  await settings()
  const plans = await grab('Reading plan')
  check('the plans file names itself a plans file', plans.body.type === 'plans', plans.body.type)
  check('and is called one', /^bible-plans-\d{4}-\d\d-\d\d\.json$/.test(plans.name), plans.name)
  check('it carries the block', plans.body.blocks?.length === 1 && plans.body.blocks[0].name === 'Proverbs in a month',
    JSON.stringify(plans.body.blocks?.map((b) => b.name)))
  check('and what has been read', JSON.stringify(plans.body.progress) === '{"proverbs.1.1":true}',
    JSON.stringify(plans.body.progress))
  check('and no notes', plans.body.data === undefined)

  const notes = await grab('Notes & highlights')
  check('the notes file names itself annotations', notes.body.type === 'annotations', notes.body.type)
  // The request was for notes export to include highlights. It always has; asserted so
  // it stays that way.
  check('it carries the highlight, not only the note',
    notes.body.data['john.3.16'].highlights?.[0].color === 'yellow',
    JSON.stringify(notes.body.data['john.3.16'].highlights))
  check('and no plan', notes.body.blocks === undefined)
  await ctx.close()
}

{
  // The payload names its own kind, so the row a reader picks does not decide what is
  // read. Feeding a plans file to the notes row must still land the plan.
  const { ctx, page } = await open()
  const file = {
    name: 'bible-plans-2026-01-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      app: 'bible-reader', type: 'plans', version: 1,
      blocks: [plan({ id: 'imported', name: 'Gospels in a week', days: 7 })],
      progress: { 'matthew.1': true },
    })),
  }
  await page.locator('header .icon[title="Settings"]').click()
  await page.locator('.sheet .sgroup').first().waitFor({ state: 'visible' })
  await page.locator('.srow', { hasText: 'Notes & highlights' }).locator('input[type=file]').setInputFiles(file)
  await page.locator('.srow', { hasText: 'Notes & highlights' }).waitFor()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('plans.v1')))
  check('a plans file dropped on the notes row still lands the plan',
    stored.length === 1 && stored[0].name === 'Gospels in a week', JSON.stringify(stored.map((b) => b.name)))
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-progress.v1')))
  check('with its progress', JSON.stringify(prog) === '{"matthew.1":true}', JSON.stringify(prog))
  const kept = await page.evaluate(() => localStorage.getItem('annotations.v1'))
  check('and the notes store is untouched', kept === '{}', kept)
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
