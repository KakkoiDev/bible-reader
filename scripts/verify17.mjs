// The sheet's drag-to-dismiss, driven by a real finger.
//
// The captain's report was "the handle for the menu trays does not work all the time,
// the calendar one especially". It was two faults wearing one symptom, and both need a
// real touch pointer to show: a mouse would exercise neither, because `touch-action`
// only governs touch and the scroll race only happens on a scroller a thumb has moved.
//
//   1. `onPointerMove` re-checked `.sheet-body.scrollTop` before committing the drag and
//      killed the gesture when it was non-zero, whatever the gesture had started on. So
//      the handle went dead on any tray whose body had been scrolled by so much as one
//      pixel, and came back to life when it was scrolled home. That is the intermittency.
//   2. `touch-action: none` was on `.sheet-grab` alone, so a gesture starting on the head
//      (the title strip immediately under a 22px handle) was claimed by the browser after
//      one move: pointercancel, no drag. The component has always documented the title as
//      a drag start.
//
// Both directions are asserted. A widening that only proves the new positive would let
// the guard's real job, a body that scrolls out from under a gesture that started in it,
// quietly disappear, so the negatives are here in the same file.
//
// Touch is dispatched through CDP rather than `page.touchscreen`, which taps but does not
// drag. Every check runs at 390x844 with `hasTouch`, which is the only viewport where the
// sheet is docked to the edge and the handle is drawn at all.
//
// Run:  npx vite preview --port 4185 --strictPort
//       node scripts/verify17.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:4185/'

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

const daysAgo = (n) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - n * 86400000
}

/** Blocks are only scenery here: they are how the planner's body is made long enough
 *  to scroll, which is the whole precondition of the bug. */
const plan = (i) => ({
  id: `seed${i}`, name: `Plan ${i}`, scope: { kind: 'books', slugs: ['proverbs'] },
  days: 30, repeat: false, order: i, startedAt: daysAgo(0),
})

async function open(nBlocks = 4) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await ctx.addInitScript(
    ([p, blocks]) => {
      if (localStorage.getItem('seeded')) return
      localStorage.setItem('prefs', JSON.stringify(p))
      localStorage.setItem('plans.v1', JSON.stringify(blocks))
      localStorage.setItem('seeded', '1')
    },
    [PREFS, Array.from({ length: nBlocks }, (_, i) => plan(i))],
  )
  const page = await ctx.newPage()
  await page.goto(URL + '#/john/3/en', { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, cdp }
}

/** One finger, down at (x, y), moved `dy` and lifted. Real touch input, so `touch-action`
 *  and the browser's own gesture arbitration apply exactly as they do on a phone. */
async function swipe(cdp, x, y, dy, steps = 12) {
  const at = (ty) => [{ x, y: ty, radiusX: 12, radiusY: 12, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(y) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(y + (dy * i) / steps) })
    await new Promise((r) => setTimeout(r, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await new Promise((r) => setTimeout(r, 400))
}

const openTray = async (page, title = 'Reading plan') => {
  if (await page.locator('.sheet').count()) return
  await page.locator(`header .icon[title="${title}"]`).click()
  await page.locator('.sheet').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
}

const centreOf = async (page, sel) => {
  const b = await page.locator(sel).boundingBox()
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
}

const scrollTopOf = (page) => page.locator('.sheet-body').evaluate((el) => Math.round(el.scrollTop))
const isOpen = async (page) => (await page.locator('.sheet').count()) > 0

console.log("\nThe calendar tray's handle answers wherever its body has been scrolled to")
{
  const { ctx, page, cdp } = await open()
  await openTray(page)
  const m = await page.locator('.sheet-body').evaluate((el) => ({ s: el.scrollHeight, c: el.clientHeight }))
  check('the tray is long enough to scroll, which is the precondition', m.s > m.c, `${m.s} in ${m.c}`)

  // One pixel is the whole difference between the working case and the dead one: the
  // guard tested `> 0`, not a threshold. Naming it here is what makes this a regression
  // test rather than a demonstration.
  for (const top of [0, 1, 200, 0]) {
    await openTray(page)
    await page.locator('.sheet-body').evaluate((el, s) => { el.scrollTop = s }, top)
    await page.waitForTimeout(150)
    const at = await scrollTopOf(page)
    const grab = await centreOf(page, '.sheet-grab')
    await swipe(cdp, grab.x, grab.y, 420)
    check(`dragged down from the handle at scrollTop ${at}, the tray goes away`, !(await isOpen(page)))
  }
  await ctx.close()
}

console.log('\nAnd after a thumb has scrolled it, not a script')
{
  const { ctx, page, cdp } = await open()
  await openTray(page)
  const body = await page.locator('.sheet-body').boundingBox()
  await swipe(cdp, Math.round(body.x + body.width / 2), Math.round(body.y + body.height * 0.7), -200)
  const at = await scrollTopOf(page)
  check('the finger scrolled the tray', at > 0, `scrollTop ${at}`)
  const grab = await centreOf(page, '.sheet-grab')
  await swipe(cdp, grab.x, grab.y, 420)
  check('and the handle still answers', !(await isOpen(page)))
  await ctx.close()
}

console.log('\nThe title is a drag start too, as the sheet has always claimed')
{
  const { ctx, page, cdp } = await open()
  await openTray(page)
  const b = await centreOf(page, '.sheet-head b')
  await swipe(cdp, b.x, b.y, 420)
  check('dragging the title down dismisses the tray', !(await isOpen(page)))
  await ctx.close()
}

console.log('\nWhat the scroll guard was for is still guarded')
{
  // The gesture that genuinely competes with the scroller is one that starts inside it.
  // Widening the handle's case must not widen this one.
  const { ctx, page, cdp } = await open()
  await openTray(page)
  await page.locator('.sheet-body').evaluate((el) => { el.scrollTop = 200 })
  await page.waitForTimeout(150)
  const body = await page.locator('.sheet-body').boundingBox()
  await swipe(cdp, Math.round(body.x + body.width / 2), Math.round(body.y + 60), 300)
  check('a drag inside a scrolled body does not dismiss the tray', await isOpen(page))
  check('it scrolls the body back instead', (await scrollTopOf(page)) < 200, `scrollTop ${await scrollTopOf(page)}`)
  await ctx.close()
}

{
  const { ctx, page, cdp } = await open()
  await openTray(page)
  const grab = await centreOf(page, '.sheet-grab')
  await swipe(cdp, grab.x, grab.y, 5, 3)
  check('a tap on the handle that wobbles is still a tap, not a dismissal', await isOpen(page))
  const left = await page.locator('.sheet').evaluate((el) => el.style.transform)
  check('and it leaves no transform behind', !left, left || '(none)')
  await ctx.close()
}

console.log('\nThe head taking touch-action leaves the rest of the sheet alone')
{
  const { ctx, page, cdp } = await open()
  await openTray(page)
  const body = await page.locator('.sheet-body').boundingBox()
  await swipe(cdp, Math.round(body.x + body.width / 2), Math.round(body.y + body.height * 0.7), -250)
  check('the tray body still scrolls under a finger', (await scrollTopOf(page)) > 0, `scrollTop ${await scrollTopOf(page)}`)
  await ctx.close()
}

{
  // The search sheet is the one that puts a field in the head, so its head is left out
  // of the rule entirely. Reading the field's own `touch-action` would prove nothing:
  // the property is not inherited and the effective behaviour is the intersection over
  // the ancestor chain, so the head is the element that has to be measured.
  const { ctx, page, cdp } = await open()
  await page.locator('header .icon[title="Search"]').click()
  await page.locator('.sheet.search').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  const searchHead = await page.locator('.sheet.search .sheet-head').evaluate((el) => getComputedStyle(el).touchAction)
  check('the search sheet\'s head is out of the rule, so the field keeps its touch behaviour', searchHead === 'auto', searchHead)

  // Narrowing the rule must not cost the search sheet the handle every sheet drags by.
  const grab = await centreOf(page, '.sheet-grab')
  await swipe(cdp, grab.x, grab.y, 420)
  check('and its handle still dismisses it under a finger', !(await isOpen(page)))
  await ctx.close()
}

{
  const { ctx, page } = await open()
  await openTray(page)
  const head = await page.locator('.sheet-head').evaluate((el) => getComputedStyle(el).touchAction)
  check('every other sheet\'s head still takes touch-action: none', head === 'none', head)
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
