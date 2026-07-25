import { chromium } from 'playwright'
const ORIGIN = 'http://localhost:4180'
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  window.__ja = []
  const drive = (u) => {
    Promise.resolve().then(() => {
      u.onstart && u.onstart({})
      // fire a JA-style boundary — should be IGNORED now (verse-only)
      u.onboundary && u.onboundary({ name: 'word', charIndex: 0, charLength: 3 })
    })
    setTimeout(() => u.onend && u.onend({}), 500)
  }
  Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
})
const page = await ctx.newPage()
const hlNames = () => page.evaluate(() => [...CSS.highlights.keys()])

// 1) JA audio: verse highlight yes, WORD highlight (hl-speaking) no
await page.goto(`${ORIGIN}/#/psalms/27/ja`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-ja-1 .vplay')
await page.locator('#v-ja-1 .vplay').click()
await page.waitForTimeout(120)
const jaVerse = await page.locator('#v-ja-1.speaking').count()
const jaWord = (await hlNames()).includes('hl-speaking')
log(`JA AUDIO   verseHighlight=${jaVerse} wordHighlight=${jaWord} (want verse=1, word=false)`)

// 2) EN audio still does word highlight
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1 .vplay')
await page.locator('#v-en-1 .vplay').click()
await page.waitForTimeout(120)
const enWord = (await hlNames()).includes('hl-speaking')
log(`EN AUDIO   wordHighlight=${enWord} (want true)`)

// 3) Swipe is OFF by default → swiping does NOT change language
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('.ringtab.active')
const before = await page.locator('.ringtab.active span').innerText()
await page.evaluate(() => {
  const el = document.querySelector('.reader')
  const box = el.getBoundingClientRect()
  const y = box.y + 200
  const t = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })]
  el.dispatchEvent(new TouchEvent('touchstart', { touches: t(box.width * 0.8), bubbles: true }))
  el.dispatchEvent(new TouchEvent('touchend', { changedTouches: t(box.width * 0.2), bubbles: true }))
})
await page.waitForTimeout(150)
const afterOff = await page.locator('.ringtab.active span').innerText()
log(`SWIPE OFF  before="${before}" afterSwipe="${afterOff}" changed=${before !== afterOff} (want changed=false)`)

// 4) enable swipe in settings → now it changes language
await page.locator('.tools .icon[title="Settings"]').click()
await page.locator('.srow', { hasText: 'Swipe to change language' }).locator('input').check()
await page.locator('.sheet .icon').click()
await page.evaluate(() => {
  const el = document.querySelector('.reader')
  const box = el.getBoundingClientRect()
  const y = box.y + 200
  const t = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })]
  el.dispatchEvent(new TouchEvent('touchstart', { touches: t(box.width * 0.8), bubbles: true }))
  el.dispatchEvent(new TouchEvent('touchend', { changedTouches: t(box.width * 0.2), bubbles: true }))
})
await page.waitForTimeout(150)
const afterOn = await page.locator('.ringtab.active span').innerText()
log(`SWIPE ON   afterSwipe="${afterOn}" changed=${afterOn !== before} (want changed=true)`)

await browser.close()
