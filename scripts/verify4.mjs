import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const ORIGIN = 'http://localhost:4180'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  window.__spoken = []
  const drive = (u) => {
    window.__spoken.push({ text: u.text, lang: u.lang })
    Promise.resolve().then(() => {
      u.onstart && u.onstart({})
      u.onboundary && u.onboundary({ name: 'word', charIndex: 0, charLength: 3 })
    })
    setTimeout(() => u.onend && u.onend({}), 400)
  }
  Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
})
const page = await ctx.newPage()
const selectText = (sel, n) =>
  page.evaluate(({ sel, n }) => {
    const vt = document.querySelector(sel + ' .vt')
    const w = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement.closest('rt') ? 2 : 1) })
    const tn = w.nextNode()
    const r = document.createRange()
    r.setStart(tn, 0)
    r.setEnd(tn, Math.min(n, tn.length))
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { sel, n })
const hlNames = () => page.evaluate(() => [...CSS.highlights.keys()])

// 1) MOBILE selection toolbar must fit inside the viewport (was overflowing)
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1')
await selectText('#v-en-1', 12)
await page.waitForSelector('.atoolbar.bottom')
const tb = await page.locator('.atoolbar').boundingBox()
await page.screenshot({ path: `${OUT}/e-mobile-toolbar.png` })
log(`1 TOOLBAR   x=${tb.x.toFixed(0)} right=${(tb.x + tb.width).toFixed(0)} vw=390 fits=${tb.x >= 0 && tb.x + tb.width <= 390}`)

// 2) SETTINGS fits vertically; voice + speed rows present
await page.keyboard.press('Escape').catch(() => {})
await page.locator('.tools .icon[title="Settings"]').click()
await page.waitForSelector('.sheet')
const sh = await page.locator('.sheet').boundingBox()
const rows = await page.locator('.srow').allInnerTexts()
await page.screenshot({ path: `${OUT}/f-settings.png` })
log(`2 SETTINGS  height=${sh.height.toFixed(0)} <=viewport(844)=${sh.height <= 844} rows=${rows.length} hasVoice=${rows.some((r) => /voice/i.test(r))} hasSpeed=${rows.some((r) => /speed/i.test(r))}`)
// set female voice, close
await page.locator('.seg').filter({ hasText: 'female' }).getByText('female', { exact: true }).click()
await page.locator('.sheet .icon').click()

// 3) PER-LANGUAGE chapter play button (mobile shows the one visible language)
const colplayN = await page.locator('.colplay').count()
await page.evaluate(() => (window.__spoken = []))
await page.locator('.colplay').first().click()
await page.waitForTimeout(120)
const chSpoken = await page.evaluate(() => window.__spoken)
const stopShown = await page.locator('.colplay.on').count()
log(`3 COLPLAY   buttons=${colplayN} chapterUtterances=${chSpoken.length} stopState=${stopShown}`)

// 4) JA per-word highlight now maps kana→kanji (fires hl-speaking)
await page.goto(`${ORIGIN}/#/psalms/27/ja`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-ja-1')
await page.locator('#v-ja-1 .vplay').click()
await page.waitForTimeout(120)
const jaWordHL = (await hlNames()).includes('hl-speaking')
log(`4 JA WORD   hl-speaking(mapped kana→kanji)=${jaWordHL}`)

await browser.close()
log('screenshots in', OUT)
