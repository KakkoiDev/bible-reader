import { chromium } from 'playwright'
const ORIGIN = 'http://localhost:4180'
const log = (...a) => console.log(...a)

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})
await ctx.addInitScript(() => {
  window.__spoken = []
  const drive = (u) => {
    window.__spoken.push(u.text)
    Promise.resolve().then(() => u.onstart && u.onstart({}))
    setTimeout(() => u.onend && u.onend({}), 60)
  }
  Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
  Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
})
const p = await ctx.newPage()
const navlabel = () => p.locator('.navbtn').innerText()

// A) SEARCH — reference jump
await p.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
await p.waitForSelector('.verse')
await p.locator('.tools .icon[title="Search"]').click()
await p.locator('.searchin').fill('John 3:16')
await p.waitForSelector('.dref.go')
await p.locator('.dref.go').click()
await p.waitForTimeout(200)
log(`A SEARCH-REF  nav="${(await navlabel()).trim()}" (want John 3)`)

// B) SEARCH — full text
await p.locator('.tools .icon[title="Search"]').click()
await p.locator('.searchin').fill('firmament')
await p.waitForSelector('.dlist li', { timeout: 8000 })
const nHits = await p.locator('.dlist li').count()
await p.locator('.dlist .dref').first().click()
await p.waitForTimeout(200)
log(`B SEARCH-TEXT hits=${nHits} jumpedTo="${(await navlabel()).trim()}"`)

// C) NAVIGATOR — book/chapter grid
await p.locator('.navbtn').click()
await p.waitForSelector('.chgrid, .bookgrid')
await p.locator('.mini.back').click().catch(() => {})
await p.waitForSelector('.bookgrid')
await p.locator('.bkbtn', { hasText: /^Psalms$/ }).click()
await p.waitForSelector('.chgrid')
await p.locator('.chbtn', { hasText: /^23$/ }).click()
await p.waitForTimeout(200)
log(`C NAVIGATOR   nav="${(await navlabel()).trim()}" (want Psalms 23)`)

// D) VERSE SHEET — compare + copy + note
await p.waitForSelector('#v-en-1 .vn')
await p.locator('#v-en-1 .vn').click()
await p.waitForSelector('.verse-sheet')
const rows = await p.locator('.verse-sheet .crow').count()
await p.locator('.verse-sheet .mini', { hasText: 'Copy text' }).click()
await p.waitForTimeout(150)
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))
await p.locator('.verse-sheet .primary', { hasText: 'Note' }).click() // same open sheet
await p.waitForTimeout(120)
const noteOpen = await p.locator('.sheet.note').count()
await p.locator('.sheet.note .icon').click()
log(`D VERSE SHEET rows=${rows} copyHasKJV=${clip.includes('KJV:')} noteEditorOpened=${noteOpen}`)

// E) CONTINUOUS AUDIO — chapter end auto-advances to the next chapter
await p.goto(`${ORIGIN}/#/psalms/117/en`, { waitUntil: 'networkidle' })
await p.waitForSelector('.colplay')
await p.evaluate(() => (window.__spoken = []))
await p.locator('.colplay').first().click()
await p.waitForTimeout(1500)
const spokenCount = await p.evaluate(() => window.__spoken.length)
log(`E CONTINUOUS  after Ps117 → nav="${(await navlabel()).trim()}" (want Psalms 118) utterances=${spokenCount}`)

await b.close()
