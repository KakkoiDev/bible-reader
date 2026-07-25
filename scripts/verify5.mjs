import { chromium } from 'playwright'
const ORIGIN = 'http://localhost:4180'
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  const drive = (u) => {
    Promise.resolve().then(() => u.onstart && u.onstart({}))
    setTimeout(() => u.onend && u.onend({}), 600)
  }
  Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
})
const page = await ctx.newPage()
const hlText = (name) =>
  page.evaluate((n) => {
    const h = CSS.highlights.get(n)
    if (!h) return null
    let s = ''
    for (const r of h) s += r.toString()
    return s
  }, name)

// BUG 2 — selection starting at the very first character (element-boundary) shows the toolbar
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1')
await page.evaluate(() => {
  const vt = document.querySelector('#v-en-1 .vt')
  const first = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT).nextNode()
  const r = document.createRange()
  r.setStart(vt, 0) // element container, offset 0 — the case that used to fail
  r.setEnd(first, 8)
  const s = getSelection()
  s.removeAllRanges()
  s.addRange(r)
})
const toolbarShown = await page
  .waitForSelector('.atoolbar', { timeout: 2500 })
  .then(() => true)
  .catch(() => false)
await page.locator('.atoolbar .sw-yellow').click()
await page.waitForTimeout(120)
log(`BUG2 first-char: toolbarShown=${toolbarShown}  highlightText="${await hlText('hl-yellow')}" (expect "In the b")`)

// BUG 1 — highlighting a kanji (inside <ruby>) with furigana ON lands on the kanji, not the reading
await page.goto(`${ORIGIN}/#/psalms/27/ja`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-ja-1 ruby')
const kanji = await page.evaluate(() => {
  const vt = document.querySelector('#v-ja-1 .vt')
  const ruby = vt.querySelector('ruby')
  const base = [...ruby.childNodes].find((n) => n.nodeType === 3) // base text (not <rt>)
  const r = document.createRange()
  r.selectNodeContents(base)
  const s = getSelection()
  s.removeAllRanges()
  s.addRange(r)
  return base.textContent
})
await page.waitForSelector('.atoolbar')
await page.locator('.atoolbar .sw-green').click()
await page.waitForTimeout(120)
const got = await hlText('hl-green')
log(`BUG1 kanji hl: selectedKanji="${kanji}"  highlightText="${got}"  match=${got === kanji}`)

// FEATURE — per-verse play button toggles to ⏹ while its verse is playing
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1 .vplay')
const before = await page.locator('#v-en-1 .vplay').innerText()
await page.locator('#v-en-1 .vplay').click()
await page.waitForTimeout(120)
const during = await page.locator('#v-en-1 .vplay').innerText()
await page.locator('#v-en-1 .vplay').click() // now ⏹ → stop
await page.waitForTimeout(120)
const after = await page.locator('#v-en-1 .vplay').innerText()
log(`VERSE STOP: before="${before.trim()}" during="${during.trim()}" afterStop="${after.trim()}"`)

await browser.close()
