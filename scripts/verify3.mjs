import { chromium } from 'playwright'
const ORIGIN = 'http://localhost:4180'
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
// Stub the speech engine before the app loads: record utterances, drive callbacks.
await ctx.addInitScript(() => {
  ;window.__spoken = []
  const drive = (u) => {
    ;window.__spoken.push({ text: u.text, lang: u.lang })
    Promise.resolve().then(() => {
      u.onstart && u.onstart({})
      u.onboundary && u.onboundary({ name: 'word', charIndex: 0, charLength: 5 })
    })
    setTimeout(() => u.onend && u.onend({}), 500)
  }
  Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => [], configurable: true })
})
const page = await ctx.newPage()
const spoken = () => page.evaluate(() => window.__spoken)
const hlNames = () => page.evaluate(() => [...CSS.highlights.keys()])
const clearSpoken = () => page.evaluate(() => (window.__spoken = []))

// A) EN — per-verse play → verse highlight + word highlight
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-2')
await clearSpoken()
await page.locator('#v-en-2 .vplay').click()
await page.waitForTimeout(90)
const enSpoken = await spoken()
const speakingNow = await page.locator('#v-en-2.speaking').count()
const wordHL = (await hlNames()).includes('hl-speaking')
log(`A EN VERSE  spokenCount=${enSpoken.length} lang=${enSpoken[0]?.lang} braces=${enSpoken[0]?.text.includes('{')} | speakingClass=${speakingNow} wordHL=${wordHL}`)
await page.waitForTimeout(550)
const clearedSpeak = await page.locator('.verse.speaking').count()
const clearedWord = (await hlNames()).includes('hl-speaking')
log(`A CLEARED   speakingClass=${clearedSpeak} wordHL=${clearedWord} (both expected 0/false)`)

// B) JA — kana transform (furigana readings), no kanji markers
await page.goto(`${ORIGIN}/#/psalms/27/ja`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-ja-1')
await clearSpoken()
await page.locator('#v-ja-1 .vplay').click()
await page.waitForTimeout(90)
const jaSpoken = await spoken()
log(`B JA KANA   lang=${jaSpoken[0]?.lang} hasMarker=${jaSpoken[0]?.text.includes('{{')} hasReading(ひかり)=${jaSpoken[0]?.text.includes('ひかり')}`)

// C) Chapter play → many utterances + play/stop toggle
await page.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
await page.waitForSelector('#v-en-1')
await clearSpoken()
await page.locator('.tools .icon.playing, .tools .icon').first().click() // ▶ play chapter
await page.waitForTimeout(120)
const chSpoken = await spoken()
const stopShown = await page.locator('.tools .icon', { hasText: '⏹' }).count()
log(`C CHAPTER   utterances=${chSpoken.length} stopButtonShown=${stopShown}`)
await page.locator('.tools .icon', { hasText: '⏹' }).click()
await page.waitForTimeout(80)
const playShown = await page.locator('.tools .icon', { hasText: '▶' }).count()
log(`C STOP      playButtonBack=${playShown}`)

await browser.close()
