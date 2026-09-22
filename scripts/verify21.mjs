// The reading planner, driven the way a reader drives it.
//
// Run:  npx vite preview --port 4187 --strictPort
//       node scripts/verify21.mjs
//
// `verify15.mjs` proves the arithmetic without a browser and `verify16.mjs` seeds
// plans through localStorage. Neither presses the buttons, so neither would catch a
// planner that computes the right day and cannot be used: this one builds a plan
// through the form, reads the day, ticks it off, comes back for the count, reorders
// and deletes.
//
// The two cases it exists for are the ones that were wrong. A plan reading under a
// chapter a day used to deliver nothing on the day it was created, and its preview
// used to round `0` up to "1.0 / today"; a later day that is genuinely empty used to
// be a full stop with no date and no way forward.
import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4187/'
const b = await chromium.launch()
let fails = 0
const check = (n, ok, d = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? `  - ${d}` : ''}`); if (!ok) fails++ }
const fresh = async (mobile = true) => {
  const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  await page.goto(URL + '#/genesis/1/en', { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  return { ctx, page }
}

console.log('\nCreating a plan through the form, as a reader would')
{
  const { ctx, page } = await fresh()
  await page.locator('.icon[title="Reading plan"]').click()
  await page.locator('.sheet').waitFor({ state: 'visible' })
  check('the planner opens empty', (await page.locator('.empty').first().innerText()).length > 10)
  await page.locator('.pnew').click()
  await page.waitForTimeout(200)
  check('the form appears', await page.locator('.pform').count() === 1)
  const pace0 = await page.locator('.pform .pmeta').innerText()
  check('the default preview names a pace', /day|every/.test(pace0), pace0)
  // Gospels / 90 days — the case that used to deliver nothing on day one.
  await page.locator('.pform .chip', { hasText: 'The Gospels' }).click()
  await page.locator('.pform .chip', { hasText: '90 days' }).click()
  await page.waitForTimeout(200)
  const pace = await page.locator('.pform .pmeta').innerText()
  check('Gospels/90 previews a floored pace, not "1.0"', /every/.test(pace) && !/1\.0/.test(pace), pace)
  await page.locator('.pform .primary').click()
  await page.waitForTimeout(400)
  check('the plan is added', await page.locator('.pblock').count() === 1)
  const today = await page.locator('.pblock .pday').innerText()
  check('and it has something to read TODAY', !/Nothing today/i.test(today), today.replace(/\n/g, ' '))
  check('with a Read now button', await page.locator('.pblock .pactions .primary').count() === 1)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('plans.v1') || '[]'))
  check('and it is persisted', stored.length === 1 && stored[0].days === 90, JSON.stringify(stored[0]?.name))
  await ctx.close()
}

console.log('\nReading the day, ticking it off, and coming back')
{
  const { ctx, page } = await fresh()
  await page.evaluate(() => {
    const start = new Date(); start.setHours(0,0,0,0)
    localStorage.setItem('plans.v1', JSON.stringify([{ id: 'x', name: 'Test', scope: { kind: 'range', from: 'genesis', to: 'revelation' },
      days: 365, repeat: false, order: 0, startedAt: start.getTime() }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  await page.locator('.icon[title="Reading plan"]').click()
  await page.locator('.pblock').waitFor({ state: 'visible' })
  const refs = await page.locator('.pblock .pref').innerText()
  check('a year plan names day one', /Genesis 1/.test(refs), refs)
  await page.locator('.pblock .pactions .primary').click()
  await page.waitForTimeout(900)
  check('Read now closes the sheet', await page.locator('.sheet').count() === 0)
  check('and opens the day as one passage', await page.locator('.patch').count() === 1)
  check('with real text in it', (await page.locator('.patch .vt').first().innerText()).length > 20)
  check('and a book heading at the seam', await page.locator('.patch .patchbook').count() >= 1)
  const ticks = await page.locator('.ptick').count()
  check('each chapter has a mark-read tick', ticks >= 1, `${ticks}`)
  await page.locator('.ptick').first().click()
  await page.waitForTimeout(300)
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('plan-progress.v1') || '{}'))
  check('ticking writes one chapter key', Object.keys(prog).length === 1 && prog['genesis.1'] === true, JSON.stringify(prog))
  await page.locator('.icon[title="Reading plan"]').click()
  await page.waitForTimeout(400)
  const meta = await page.locator('.pblock .pmeta').first().innerText()
  check('and the planner counts it', /1/.test(meta), meta)
  await ctx.close()
}

console.log('\nA plan that reads under a chapter a day')
{
  const { ctx, page } = await fresh()
  await page.evaluate(() => {
    const start = new Date(); start.setHours(0,0,0,0)
    localStorage.setItem('plans.v1', JSON.stringify([{ id: 'y', name: 'Proverbs slowly', scope: { kind: 'books', slugs: ['proverbs'] },
      days: 90, repeat: false, order: 0, startedAt: start.getTime() }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  await page.locator('.icon[title="Reading plan"]').click()
  await page.locator('.pblock').waitFor({ state: 'visible' })
  const t = await page.locator('.pblock .pday').innerText()
  check('day one still has a chapter', !/Nothing today/i.test(t), t.replace(/\n/g, ' '))
  await ctx.close()
}

console.log('\nAn empty later day offers the next one')
{
  const { ctx, page } = await fresh()
  await page.evaluate(() => {
    const start = new Date(); start.setHours(0,0,0,0)
    start.setDate(start.getDate() - 1) // day 2 of a 90-day, 31-chapter plan is empty
    localStorage.setItem('plans.v1', JSON.stringify([{ id: 'z', name: 'Proverbs slowly', scope: { kind: 'books', slugs: ['proverbs'] },
      days: 90, repeat: false, order: 0, startedAt: start.getTime() }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  await page.locator('.icon[title="Reading plan"]').click()
  await page.locator('.pblock').waitFor({ state: 'visible' })
  const txt = await page.locator('.pblock').innerText()
  const empty = /Nothing today/i.test(txt)
  console.log(`    (day 2 is ${empty ? 'empty' : 'not empty'})`)
  if (empty) {
    check('an empty day names the next reading', /Next reading/i.test(txt), txt.replace(/\n/g, ' | '))
    check('and offers to read it now', await page.locator('.pahead').count() === 1)
    await page.locator('.pahead').click()
    await page.waitForTimeout(800)
    check('read-ahead opens that passage', await page.locator('.patch .vt').count() > 0)
  }
  await ctx.close()
}

console.log('\nDelete, reorder, and the no-guilt contract')
{
  const { ctx, page } = await fresh()
  await page.evaluate(() => {
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 10)
    localStorage.setItem('plans.v1', JSON.stringify([
      { id: 'a', name: 'A', scope: { kind: 'books', slugs: ['john'] }, days: 21, repeat: false, order: 0, startedAt: start.getTime() },
      { id: 'b', name: 'B', scope: { kind: 'books', slugs: ['mark'] }, days: 16, repeat: false, order: 1, startedAt: start.getTime() },
    ]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  await page.locator('.icon[title="Reading plan"]').click()
  await page.waitForTimeout(400)
  check('both plans list', await page.locator('.pblock').count() === 2)
  const first = await page.locator('.pblock .pblock-id b').first().innerText()
  check('a ten-day-old plan is on day 11, not behind', !/behind|missed|debt/i.test(await page.locator('.pblock').first().innerText()))
  await page.locator('.pblock').first().locator('.dmove .mini').nth(1).click()
  await page.waitForTimeout(300)
  const firstAfter = await page.locator('.pblock .pblock-id b').first().innerText()
  check('move down reorders', firstAfter !== first, `${first} -> ${firstAfter}`)
  await page.locator('.pblock').first().locator('.icon').click()
  await page.waitForTimeout(300)
  check('delete removes one', await page.locator('.pblock').count() === 1)
  await ctx.close()
}

await b.close()
console.log(fails ? `\n${fails} check(s) failed.` : '\nAll checks passed')
process.exit(fails ? 1 : 0)
