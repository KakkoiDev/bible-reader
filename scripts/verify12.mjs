// Drives the preview build with Playwright to check the redesign batch:
// the shared sheet shell (one scroller, pinned head and footer, drag to dismiss).
//
// The flick path (dismiss above ~0.5 px/ms regardless of distance) is not covered.
// Velocity is measured between the last pointermove and the pointerup, and
// Playwright's mouse.up() cannot carry a coordinate, so every synthetic release
// lands on the previous move and reads as zero. Distance is what is asserted here.
//
// Run:  npx vite preview --port 4181 --strictPort
//       node scripts/verify12.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:4181/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const BASE = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: false, ui: 'en',
}

async function open({ mobile = false, hash = '' } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } },
  )
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), BASE)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  return { ctx, page }
}

// The sheet is now two taps away: the verse opens the bar, and Study opens the sheet.
async function openVerseSheet(page, id = '#v-en-13') {
  await page.locator(id).click()
  await page.locator(`${id} .vbar`).waitFor({ state: 'visible' })
  await page.locator(`${id} .vbtn.study`).click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  await page.waitForTimeout(900) // the concordance card lands and grows the body
}

// 1 Corinthians 13:13 with its panels expanded is taller than a phone, which is the
// only state in which "the footer stays pinned" means anything. The panels are
// `<details>` and ship collapsed, so they are opened here rather than clicked: this
// suite is about the shell, not about how the concordance discloses itself.
async function openTallVerseSheet(page) {
  await openVerseSheet(page)
  await page.locator('.sheet-body details.conc').first().waitFor({ state: 'attached', timeout: 5000 })
  await page.evaluate(() => {
    document.querySelectorAll('.sheet-body details').forEach((d) => { d.open = true })
  })
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => {
    const b = document.querySelector('.sheet-body')
    return b.scrollHeight - b.clientHeight
  })
  if (overflow <= 0) throw new Error('the fixture no longer overflows the sheet body')
}

// A press-move-release along the y axis.
async function dragDown(page, box, dy, { startY = box.y + box.height / 2 } = {}) {
  const x = box.x + box.width / 2
  await page.mouse.move(x, startY)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x, startY + (dy * i) / 8)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

// ---------- 0. precondition ----------
// Everything below addresses the shell's parts by name. Without the shell the suite
// would time out on a locator and print a stack trace, which says nothing.
console.log('\nThe shell and the bar are in the build')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/john/3/en' })
  await page.locator('#v-en-16').click()
  await page.waitForTimeout(400)
  const bar = (await page.locator('#v-en-16 .vbar').count()) === 1
  check('a verse tap opens the action bar', bar)
  if (bar) await page.locator('#v-en-16 .vbtn.study').click()
  await page.locator('.sheet').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  const absent = await page.evaluate(() =>
    ['.sheet-grab', '.sheet-head', '.sheet-body', '.sheet-foot'].filter((s) => !document.querySelector(s)))
  check('handle, head, body and footer all exist', absent.length === 0, `missing ${absent.join(' ')}`)
  await ctx.close()
  if (!bar || absent.length) {
    await browser.close()
    console.log(`\n${failures} check(s) failed\n`)
    process.exit(1)
  }
}

// ---------- 1. anatomy: one scroller, everything else pinned ----------
console.log('\nSheet anatomy')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/1-corinthians/13/en' })
  await openTallVerseSheet(page)

  const geo = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet')
    const body = document.querySelector('.sheet-body')
    const head = document.querySelector('.sheet-head')
    const foot = document.querySelector('.sheet-foot')
    const grab = document.querySelector('.sheet-grab')
    const r = (el) => (el ? el.getBoundingClientRect() : null)
    return {
      sheet: r(sheet), head: r(head), foot: r(foot), grab: r(grab), body: r(body),
      sheetScrolls: sheet.scrollHeight - sheet.clientHeight,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      grabShown: grab ? getComputedStyle(grab).display : 'none',
      grabTouch: grab ? getComputedStyle(grab).touchAction : '',
      bodyChain: getComputedStyle(body).overscrollBehaviorY,
      // The sheet reserves the home-indicator strip below the footer.
      safe: parseFloat(getComputedStyle(sheet).paddingBottom),
      vh: window.innerHeight,
    }
  })

  check('the sheet itself does not scroll', geo.sheetScrolls === 0, `${geo.sheetScrolls}px`)
  check('the body does', geo.bodyOverflow > 0, `${geo.bodyOverflow}px of overflow`)
  check('and it does not chain to the page', geo.bodyChain === 'contain', geo.bodyChain)
  check('sheet is at most 92% of the viewport', geo.sheet.height <= geo.vh * 0.92 + 1,
    `${Math.round(geo.sheet.height)} of ${geo.vh}`)
  check('grab handle is shown on a phone', geo.grabShown === 'block', geo.grabShown)
  check('and it owns the vertical gesture', geo.grabTouch === 'none', geo.grabTouch)
  check('handle sits above the head', geo.grab.bottom <= geo.head.top + 1)
  check('footer is the bottom of the sheet, above the safe strip',
    Math.abs(geo.foot.bottom - (geo.sheet.bottom - geo.safe)) <= 1,
    `foot ${Math.round(geo.foot.bottom)} vs sheet ${Math.round(geo.sheet.bottom)} less ${geo.safe}`)
  check('body sits between them', geo.body.top >= geo.head.bottom - 1 && geo.body.bottom <= geo.foot.top + 1)

  // Scroll the body to the bottom. Head and footer must not have moved a pixel.
  const after = await page.evaluate(() => {
    const body = document.querySelector('.sheet-body')
    body.scrollTop = body.scrollHeight
    const r = (s) => document.querySelector(s).getBoundingClientRect()
    return { scrollTop: body.scrollTop, head: r('.sheet-head'), foot: r('.sheet-foot'), sheet: r('.sheet') }
  })
  check('the body really scrolled', after.scrollTop > 0, `${Math.round(after.scrollTop)}px`)
  check('head stayed put', Math.abs(after.head.top - geo.head.top) < 1,
    `${Math.round(after.head.top)} was ${Math.round(geo.head.top)}`)
  check('footer stayed put', Math.abs(after.foot.top - geo.foot.top) < 1,
    `${Math.round(after.foot.top)} was ${Math.round(geo.foot.top)}`)
  check('footer is still on screen', after.foot.bottom <= after.sheet.bottom + 1 && after.foot.top < 780)
  await ctx.close()
}

// ---------- 2. drag to dismiss ----------
console.log('\nDrag to dismiss')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/1-corinthians/13/en' })
  await openVerseSheet(page)

  // A short drag springs back.
  const grab = await page.locator('.sheet-grab').boundingBox()
  const h = (await page.locator('.sheet').boundingBox()).height
  await dragDown(page, grab, Math.round(h * 0.12))
  await page.waitForTimeout(300)
  check('a short drag springs back', await page.locator('.verse-sheet').count() === 1)
  const t = await page.evaluate(() => document.querySelector('.sheet').style.transform)
  check('and leaves no transform behind', t === '', JSON.stringify(t))

  // Past a quarter of its height, it goes.
  await dragDown(page, grab, Math.round(h * 0.45))
  await page.waitForTimeout(500)
  check('past the threshold it dismisses', await page.locator('.verse-sheet').count() === 0)
  check('and the backdrop goes with it', await page.locator('.sheet-backdrop').count() === 0)
  await ctx.close()
}

// ---------- 3. dragging never steals a scroll ----------
console.log('\nDrag versus scroll')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/1-corinthians/13/en' })
  await openVerseSheet(page)
  const body = await page.locator('.sheet-body').boundingBox()
  const h = (await page.locator('.sheet').boundingBox()).height

  // At the top of the body there is nothing above to scroll to, so the drag is the
  // only thing the gesture can mean.
  await dragDown(page, body, Math.round(h * 0.45), { startY: body.y + 40 })
  await page.waitForTimeout(500)
  check('dragging the body at scrollTop 0 dismisses', await page.locator('.verse-sheet').count() === 0)

  await openTallVerseSheet(page)
  await page.evaluate(() => { document.querySelector('.sheet-body').scrollTop = 200 })
  const scrolled = await page.locator('.sheet-body').boundingBox()
  await dragDown(page, scrolled, Math.round(h * 0.45), { startY: scrolled.y + 40 })
  await page.waitForTimeout(500)
  check('but a scrolled body keeps its scroll', await page.locator('.verse-sheet').count() === 1)
  const top = await page.evaluate(() => document.querySelector('.sheet-body').scrollTop)
  check('and does not dismiss', top > 0, `scrollTop ${Math.round(top)}`)
  await ctx.close()
}

// ---------- 4. on a wide screen it is a centred card, not a drawer ----------
console.log('\nWide screen')
{
  const { ctx, page } = await open({ hash: '#/1-corinthians/13/en' })
  await openVerseSheet(page)
  const grab = await page.evaluate(() => getComputedStyle(document.querySelector('.sheet-grab')).display)
  check('no grab handle', grab === 'none', grab)

  const box = await page.locator('.sheet').boundingBox()
  await dragDown(page, box, 300, { startY: box.y + 6 })
  await page.waitForTimeout(400)
  check('dragging does nothing', await page.locator('.verse-sheet').count() === 1)
  await ctx.close()
}

// ---------- 5. every sheet is built from the shell ----------
console.log('\nAll sheets use the shell')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/john/3/en' })
  const shell = async (label, openIt) => {
    await openIt()
    await page.locator('.sheet').waitFor({ state: 'visible' })
    const parts = await page.evaluate(() => ({
      grab: document.querySelectorAll('.sheet-grab').length,
      head: document.querySelectorAll('.sheet-head').length,
      body: document.querySelectorAll('.sheet-body').length,
      sheets: document.querySelectorAll('.sheet').length,
    }))
    check(`${label} has handle, head and body`,
      parts.sheets > 0 && parts.grab === parts.sheets && parts.head === parts.sheets && parts.body === parts.sheets,
      JSON.stringify(parts))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await shell('search', () => page.locator('.icon[title="Search"]').click())
  await shell('settings', () => page.locator('.icon[title="Settings"]').click())
  await shell('saved', () => page.locator('.icon[title^="Saved"]').click())
  await shell('verse', () => openVerseSheet(page, '#v-en-16'))
  await ctx.close()
}

// ---------- 6. the verse action bar ----------
console.log('\nVerse action bar')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/john/3/en' })
  await page.locator('#v-en-16').click()
  await page.locator('#v-en-16 .vbar').waitFor({ state: 'visible' })
  check('tapping a verse opens the bar', await page.locator('.vbar').count() === 1)
  check('and does NOT open the sheet', await page.locator('.verse-sheet').count() === 0)
  check('there is no per-verse play button left', await page.locator('.vplay').count() === 0)

  const cells = page.locator('#v-en-16 .vbar .vbtn')
  check('six controls', await cells.count() === 6, `${await cells.count()}`)
  const labels = await cells.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') || e.textContent.trim()))
  check('highlight, share, bookmark, note, listen, Study',
    JSON.stringify(labels) === JSON.stringify(['Highlight', 'Share', 'Bookmark', 'Add note', 'Listen from here', 'Study']),
    labels.join(' | '))

  const boxes = await cells.evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect()
    return [Math.round(r.width), Math.round(r.height)]
  }))
  check('every control is a 44pt target', boxes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(boxes))
  const rows = new Set(await cells.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))))
  check('the row does not wrap at 390px', rows.size === 1, `${rows.size} row(s)`)

  // Tapping another verse moves the bar; tapping the same one puts it away.
  await page.locator('#v-en-17').click()
  check('one bar at a time', await page.locator('.vbar').count() === 1)
  check('and it moved to the tapped verse', await page.locator('#v-en-17 .vbar').count() === 1)
  await page.locator('#v-en-17').click()
  check('tapping the same verse closes it', await page.locator('.vbar').count() === 0)
  await ctx.close()
}

console.log('\nBar actions')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/john/3/en' })
  await page.locator('#v-en-16').click()

  // Highlight swaps the row in place rather than opening anything.
  await page.locator('#v-en-16 .vbar .vbtn').first().click()
  await page.locator('#v-en-16 .vbar .swatch').first().waitFor({ state: 'visible' })
  check('highlight swaps the row in place', await page.locator('.sheet').count() === 0)
  check('five colours, no clear yet', await page.locator('#v-en-16 .vbar .swatch').count() === 5)
  await page.locator('#v-en-16 .vbar .sw-blue').click()
  await page.waitForTimeout(200)
  check('the whole verse is tinted', await page.locator('#v-en-16 .hl.hl-blue').count() > 0)
  check('and the row is back to its six', await page.locator('#v-en-16 .vbar .vbtn').count() === 6)

  await page.locator('#v-en-16 .vbar .vbtn').first().click()
  check('now clear is the sixth swatch', await page.locator('#v-en-16 .vbar .swatch').count() === 6)
  await page.locator('#v-en-16 .vbar .swatch.nocolour').click()
  await page.waitForTimeout(200)
  check('and it removes the tint', await page.locator('#v-en-16 .hl').count() === 0)

  // Bookmark completes on the tap: no sheet, and it survives a reload.
  await page.locator('#v-en-16 .vbar .vbtn').nth(2).click()
  await page.waitForTimeout(200)
  check('bookmark opens nothing', await page.locator('.sheet').count() === 0)
  check('the bar stays open', await page.locator('#v-en-16 .vbar').count() === 1)
  check('the verse is marked in the reader', await page.locator('#v-en-16 .mk.bm').count() === 1)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('annotations.v1') || '{}'))
  check('and it is written to storage', saved['john.3.16']?.bookmarked === true, JSON.stringify(saved['john.3.16']))

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  check('a bookmark with nothing else survives a reload', await page.locator('#v-en-16 .mk.bm').count() === 1)

  // Share holds three things and opens no sheet of its own.
  await page.locator('#v-en-16').click()
  await page.locator('#v-en-16 .vbar .vbtn').nth(1).click()
  await page.waitForTimeout(150)
  check('share swaps the row too', await page.locator('.sheet').count() === 0)
  check('back plus three actions', await page.locator('#v-en-16 .vbar .vbtn').count() === 4)
  await page.locator('#v-en-16 .vbar .vbtn').first().click()
  check('back returns to the six', await page.locator('#v-en-16 .vbar .vbtn').count() === 6)

  // Study is the one control that opens the sheet.
  await page.locator('#v-en-16 .vbtn.study').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  check('Study opens the sheet', await page.locator('.verse-sheet').count() === 1)
  check('and closes the bar', await page.locator('.vbar').count() === 0)
  await ctx.close()
}

console.log('\nBookmarks in the Saved drawer')
{
  const { ctx, page } = await open({ mobile: true, hash: '#/john/3/en' })
  await page.evaluate(() => {
    localStorage.setItem('annotations.v1', JSON.stringify({
      'john.3.16': { bookmarked: true, createdAt: 1, updatedAt: 1 },
      'genesis.1.1': { note: 'a note', createdAt: 2, updatedAt: 2 },
    }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.icon[title^="Saved"]').click()
  await page.locator('.sheet.saved').waitFor({ state: 'visible' })
  check('a bookmark-only verse is listed', await page.locator('.dlist li').count() === 2,
    `${await page.locator('.dlist li').count()}`)
  await page.locator('.dcheck', { hasText: 'Bookmarks' }).locator('input').check()
  await page.waitForTimeout(200)
  const rows = await page.locator('.dlist li').count()
  check('the filter leaves only the bookmark', rows === 1, `${rows}`)
  check('and it is John 3:16', /John 3:16/.test(await page.locator('.dlist li').innerText()))
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
