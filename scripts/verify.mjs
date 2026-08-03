import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:4178/'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log(...a)

const browser = await chromium.launch()

// ---------- DESKTOP: expect 3 parallel columns ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  const cols = await page.locator('.col').count()
  const ref = await page.locator('.ref').first().innerText()
  const ruby = await page.locator('.col[lang="ja"] ruby').count()
  await page.screenshot({ path: `${OUT}/1-desktop.png`, fullPage: false })
  log(`DESKTOP  ref="${ref}"  columns=${cols}  ja-ruby=${ruby}`)
  await ctx.close()
}

// ---------- MOBILE: single language, ring, swipe, furigana ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  // Swipe-to-change-language is opt-in, so the swipe checks below need it enabled.
  await ctx.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem('prefs') || '{}')
    localStorage.setItem('prefs', JSON.stringify({ ...p, swipe: true }))
  })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')

  const cols0 = await page.locator('.col').count()
  const active0 = await page.locator('.ringtab.active span').innerText()
  await page.screenshot({ path: `${OUT}/2-mobile-en.png` })
  log(`MOBILE   columns=${cols0}  activeLang="${active0}"`)

  // tap the 日本語 tab
  await page.getByRole('tab', { name: /日本語/ }).click()
  await page.waitForTimeout(120)
  const activeJa = await page.locator('.ringtab.active span').innerText()
  const rubyOn = await page.locator('ruby rt').count()
  await page.screenshot({ path: `${OUT}/3-mobile-ja-furigana.png` })
  log(`TAP JA   activeLang="${activeJa}"  ruby<rt>=${rubyOn}`)

  // toggle furigana OFF -> rt should disappear, base kanji remain.
  // The toggle lives in the Settings sheet (there is no longer a header control).
  const furigana = async (on) => {
    await page.locator('.tools .icon:last-child').click()
    await page.waitForSelector('.sheet .sgroup')
    const row = page.locator('.srow', { hasText: /Furigana|ふりがな/ }).first()
    await (on ? row.locator('input').check() : row.locator('input').uncheck())
    await page.locator('.sheet .icon[aria-label]').first().click()
    await page.waitForTimeout(150)
  }
  await furigana(false)
  const rubyOff = await page.locator('ruby rt').count()
  const jaText = await page.locator('.verse .vt').first().innerText()
  await page.screenshot({ path: `${OUT}/4-mobile-ja-nofurigana.png` })
  log(`FURI OFF ruby<rt>=${rubyOff}  firstVerseHasKanji=${/[一-鿿]/.test(jaText)}`)
  await furigana(true)

  // SWIPE left on the reader -> ring should advance JA -> FR
  async function swipe(dir) {
    const box = await page.locator('.reader').boundingBox()
    const y = box.y + box.height / 2
    const x0 = dir === 'left' ? box.x + box.width * 0.8 : box.x + box.width * 0.2
    const x1 = dir === 'left' ? box.x + box.width * 0.2 : box.x + box.width * 0.8
    await page.evaluate(
      ([x0, x1, y]) => {
        const el = document.querySelector('.reader')
        const t = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })]
        el.dispatchEvent(new TouchEvent('touchstart', { touches: t(x0), bubbles: true }))
        el.dispatchEvent(new TouchEvent('touchend', { changedTouches: t(x1), bubbles: true }))
      },
      [x0, x1, y],
    )
    await page.waitForTimeout(120)
  }
  await swipe('left')
  const afterLeft = await page.locator('.ringtab.active span').innerText()
  log(`SWIPE ←  activeLang="${afterLeft}"  (expected Français)`)
  await swipe('right')
  const afterRight = await page.locator('.ringtab.active span').innerText()
  log(`SWIPE →  activeLang="${afterRight}"  (expected 日本語)`)

  // chapter navigation. The row at the foot of the passage names its destination
  // instead of saying "Next", so it is reached by class.
  const refBefore = await page.locator('.ref').innerText()
  await page.locator('.chapend-go').click()
  await page.waitForTimeout(120)
  const refAfter = await page.locator('.ref').innerText()
  log(`NEXT CH  "${refBefore.trim()}" -> "${refAfter.trim()}"`)

  await ctx.close()
}

await browser.close()
log('screenshots in', OUT)
