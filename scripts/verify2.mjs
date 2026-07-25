import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const ORIGIN = 'http://localhost:4180'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await ctx.newPage()

async function selectText(sel, n = 8) {
  return page.evaluate(({ sel, n }) => {
    const vt = document.querySelector(sel + ' .vt')
    const w = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement.closest('rt') ? 2 : 1),
    })
    const tn = w.nextNode()
    const end = Math.min(n, tn.length)
    const r = document.createRange()
    r.setStart(tn, 0)
    r.setEnd(tn, end)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
    return tn.textContent.slice(0, end)
  }, { sel, n })
}
const hlNames = () => page.evaluate(() => [...CSS.highlights.keys()])
const lsAnn = () => page.evaluate(() => JSON.parse(localStorage.getItem('annotations.v1') || '{}'))

await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.verse')

// 1) HIGHLIGHT create + persist
const selText = await selectText('#v-en-1', 10)
await page.waitForSelector('.atoolbar', { timeout: 3000 })
await page.locator('.atoolbar .sw-yellow').click()
await page.waitForTimeout(150)
log(`1 HIGHLIGHT  selected="${selText}"  cssHighlights=${JSON.stringify(await hlNames())}  stored=${!!(await lsAnn())['genesis.1.1']}`)
await page.screenshot({ path: `${OUT}/a-highlight.png` })

// 2) NOTE add
await selectText('#v-en-2', 12)
await page.waitForSelector('.atoolbar')
await page.locator('.atoolbar .abtn').first().click() // ✎ note
await page.waitForSelector('.sheet.note textarea')
await page.locator('.sheet.note textarea').fill('my note on verse 2')
await page.screenshot({ path: `${OUT}/b-note-editor.png` })
await page.locator('.sheet.note .primary').click()
await page.waitForTimeout(120)
const noteMk = await page.locator('#v-en-2 .mk.note').count()
log(`2 NOTE       marker=${noteMk}  stored="${(await lsAnn())['genesis.1.2']?.note}"`)

// 3) BOOKMARK + drawer jump
await selectText('#v-en-3', 8)
await page.waitForSelector('.atoolbar')
await page.locator('.atoolbar .abtn').nth(1).click() // 🔖 bookmark
await page.waitForTimeout(120)
const bkMk = await page.locator('#v-en-3 .mk').first().count()
await page.locator('.tools .icon').first().click() // open drawer
await page.waitForSelector('.drawer')
const drawerCount = await page.locator('.dlist li').count()
await page.screenshot({ path: `${OUT}/c-drawer.png` })
await page.locator('.dlist .dref').first().click()
await page.waitForTimeout(200)
log(`3 BOOKMARK   marker=${bkMk}  drawerItems=${drawerCount}  drawerClosed=${(await page.locator('.drawer').count()) === 0}`)

// 4) SETTINGS: theme + font size
await page.locator('.tools .icon').nth(1).click()
await page.waitForSelector('.sheet')
await page.locator('.seg').first().getByText('dark', { exact: true }).click()
await page.locator('.seg').nth(1).getByText('L', { exact: true }).click()
const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme)
const sizeAttr = await page.evaluate(() => document.documentElement.dataset.size)
await page.screenshot({ path: `${OUT}/d-dark-large.png` })
await page.locator('.sheet .icon').click() // close
log(`4 SETTINGS   data-theme=${themeAttr}  data-size=${sizeAttr}`)

// 5) VERSE LINK copy
await page.locator('#v-en-1 .vn').click()
await page.waitForTimeout(150)
const hash1 = await page.evaluate(() => location.hash)
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
log(`5 LINK       hash=${hash1}  clipboardHasLink=${clip.includes('/genesis/1/en/1')}`)

// 6) OPEN LINK → right book/lang/verse + scroll + flash
await page.goto(`${ORIGIN}/#/psalms/27/ja/1`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-ja-1')
await page.waitForTimeout(400)
const activeTab = await page.locator('.ringtab.active span').innerText()
const scrolled = await page.evaluate(() => window.scrollY)
const flashed = await page.locator('#v-ja-1.flash').count()
log(`6 OPEN LINK  activeLang="${activeTab}"  scrollY=${scrolled}  flashed=${flashed}`)

// 7) FURIGANA-STABLE highlight: highlight ja text, then toggle furigana off
await selectText('#v-ja-1', 6)
await page.waitForSelector('.atoolbar')
await page.locator('.atoolbar .sw-blue').click()
await page.waitForTimeout(120)
const hlWithFuri = await hlNames()
await page.locator('.tools .icon').nth(1).click()
await page.locator('.srow input[type=checkbox]').uncheck() // furigana off
await page.waitForTimeout(150)
await page.locator('.sheet .icon').click()
const rtAfter = await page.locator('#v-ja-1 ruby rt').count()
const hlAfter = await hlNames()
log(`7 FURI-STABLE hlWithFurigana=${JSON.stringify(hlWithFuri)}  rt_after_off=${rtAfter}  hl_still=${JSON.stringify(hlAfter)}`)

// 8) RESUME last position
await page.goto(`${ORIGIN}/#/genesis/5/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1')
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5))
await page.waitForTimeout(600)
const lastRead = await page.evaluate(() => JSON.parse(localStorage.getItem('lastRead') || 'null'))
await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' }) // no hash → resume
await page.waitForSelector('.verse')
await page.waitForTimeout(500)
const resumeBook = await page.locator('.chaplabel').innerText()
const resumeScroll = await page.evaluate(() => window.scrollY)
log(`8 RESUME     lastRead=${JSON.stringify(lastRead)}  reopenedAt="${resumeBook.trim()}"  scrollY=${resumeScroll}`)

await browser.close()
log('screenshots in', OUT)
