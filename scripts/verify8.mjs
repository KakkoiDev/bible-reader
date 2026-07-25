import { chromium, webkit } from 'playwright'
const ORIGIN = 'http://localhost:4180'

async function run(engine, name) {
  const b = await engine.launch()
  const p = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }).then((c) => c.newPage())
  const selNode = (sel) =>
    p.evaluate((s) => {
      const vt = document.querySelector(s + ' .vt')
      const ruby = vt.querySelector('ruby')
      const node = ruby ? [...ruby.childNodes].find((n) => n.nodeType === 3) : document.createTreeWalker(vt, NodeFilter.SHOW_TEXT).nextNode()
      const r = document.createRange()
      ruby ? r.selectNodeContents(node) : (r.setStart(node, 0), r.setEnd(node, 8))
      const g = getSelection()
      g.removeAllRanges()
      g.addRange(r)
    }, sel)

  // EN highlight → DOM span + persists across reload
  await p.goto(`${ORIGIN}/#/genesis/1/en`, { waitUntil: 'networkidle' })
  await p.waitForSelector('#v-en-1')
  await selNode('#v-en-1')
  await p.waitForSelector('.atoolbar')
  await p.locator('.atoolbar .sw-yellow').click()
  await p.waitForTimeout(120)
  const enSpan = await p.locator('#v-en-1 .hl').count()
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForSelector('#v-en-1')
  const enPersist = await p.locator('#v-en-1 .hl').count()

  // JA highlight on a kanji (furigana ON) → span inside ruby; survives furigana OFF
  await p.goto(`${ORIGIN}/#/psalms/27/ja`, { waitUntil: 'networkidle' })
  await p.waitForSelector('#v-ja-1 ruby')
  await selNode('#v-ja-1')
  await p.waitForSelector('.atoolbar')
  await p.locator('.atoolbar .sw-green').click()
  await p.waitForTimeout(120)
  const jaInRuby = await p.locator('#v-ja-1 ruby .hl').count()
  await p.locator('.tools .icon[title="Settings"]').click()
  await p.locator('.srow', { hasText: 'Furigana' }).locator('input').uncheck()
  await p.locator('.sheet .icon').click()
  await p.waitForTimeout(120)
  const jaFuriOff = await p.locator('#v-ja-1 .hl').count()
  const rubyGone = await p.locator('#v-ja-1 ruby').count()

  console.log(
    `${name}: enSpan=${enSpan} enPersistAfterReload=${enPersist} jaSpanInRuby=${jaInRuby} jaSpanAfterFuriOff=${jaFuriOff} (rubyEls=${rubyGone})`,
  )
  await b.close()
}

await run(chromium, 'CHROMIUM')
await run(webkit, 'WEBKIT  ')
