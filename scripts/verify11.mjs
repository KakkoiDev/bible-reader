// Drives the preview build with Playwright to check this batch of work:
// the KJV concordance panel, its settings badge, the Anki export, multi-word
// search, and that the concordance data really is fetched on demand.
//
// Run:  npx vite preview --port 4179 --strictPort
//       node scripts/verify11.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:4179/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const BASE = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: false, ui: 'en',
}

async function open(prefs = BASE, { mobile = false, hash = '' } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } },
  )
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), prefs)
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  return { ctx, page, requests }
}

// ---------- 1. concordance is not fetched until asked for ----------
console.log('\nConcordance loads on demand')
{
  const { ctx, page, requests } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  const before = requests.filter((u) => u.includes('/data/strongs/')).length
  check('nothing from data/strongs on page load', before === 0, `${before} request(s)`)

  // Open the verse sheet for 1 Cor 13:13 by tapping the verse row.
  await page.locator('#v-en-13').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  const toggle = page.locator('.conctoggle')
  check('verse sheet offers the concordance', await toggle.count() === 1)
  const stillNone = requests.filter((u) => u.includes('/data/strongs/')).length
  check('still nothing fetched while collapsed', stillNone === 0, `${stillNone} request(s)`)

  await toggle.click()
  await page.locator('.conclist li').first().waitFor({ state: 'visible' })
  const fetched = requests.filter((u) => u.includes('/data/strongs/'))
  check('fetched tags + dictionary on expand', fetched.length === 2, fetched.map((u) => u.split('/').pop()).join(', '))

  // 1 Cor 13:13 — "charity" is G26, ἀγάπη.
  const rows = await page.locator('.conclist li').count()
  const text = await page.locator('.conc').innerText()
  check('lists the verse words', rows === 12, `${rows} rows`)
  check('resolves charity to ἀγάπη / G26', text.includes('ἀγάπη') && text.includes('G26'), '')
  check('shows the transliteration', text.includes('agápē'))
  check('shows a definition', /affection or benevolence/.test(text))
  await ctx.close()
}

// ---------- 2. sticky across verses, and KJV-only ----------
console.log('\nConcordance is sticky, and KJV-only')
{
  const { ctx, page } = await open(BASE, { hash: '#/john/3/en' })
  await page.locator('#v-en-16').click()
  await page.locator('.conctoggle').click()
  await page.locator('.conclist li').first().waitFor({ state: 'visible' })
  await page.locator('.verse-sheet .icon').click() // close
  await page.locator('#v-en-17').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  check('stays open on the next verse', await page.locator('.conclist').count() === 1)
  await ctx.close()

  // With the KJV hidden there is no concordance at all.
  const b = await open({ ...BASE, columns: ['ja', 'fr'] }, { hash: '#/john/3/ja' })
  await b.page.locator('#v-ja-16').click()
  await b.page.locator('.verse-sheet').waitFor({ state: 'visible' })
  const none = (await b.page.locator('.conctoggle').count()) + (await b.page.locator('.conc').count())
  check('absent when the KJV is hidden', none === 0, `${none} element(s)`)
  await b.ctx.close()
}

// ---------- 3. the settings badge ----------
console.log('\nSettings badge')
{
  const { ctx, page } = await open()
  await page.locator('.icon[title="Settings"]').click()
  await page.locator('.sheet').waitFor({ state: 'visible' })
  const badges = page.locator('.cbadge')
  check('exactly one edition is badged', await badges.count() === 1, `${await badges.count()}`)
  const row = await page.locator('.colrow', { has: page.locator('.cbadge') }).innerText()
  check('and it is the KJV', /King James|English/i.test(row), row.replace(/\n/g, ' ').slice(0, 60))
  await ctx.close()
}

// ---------- 4. Anki export ----------
console.log('\nAnki export')
{
  const { ctx, page } = await open()
  // Seed two notes, one with a multi-word tag, and reload so the app picks them up.
  await page.evaluate(() => {
    localStorage.setItem(
      'annotations.v1',
      JSON.stringify({
        'john.3.16': { note: 'Line one\nLine two', tags: ['study notes', 'love'], createdAt: 1, updatedAt: 1 },
        'genesis.1.1': { note: 'Creation\there', tags: [], createdAt: 1, updatedAt: 1 },
        'genesis.1.2': { highlights: [{ id: 'x', lang: 'en', start: 0, end: 3, color: 'yellow' }] },
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.icon[title="Settings"]').click()
  const dl = page.waitForEvent('download')
  await page.locator('.databtns .mini', { hasText: /^Anki$/ }).click()
  const download = await dl
  const stream = await download.createReadStream()
  let tsv = ''
  for await (const chunk of stream) tsv += chunk
  const lines = tsv.trim().split('\n')
  const rows = lines.filter((l) => !l.startsWith('#'))

  check('filename is a .tsv', /^bible-anki-\d{4}-\d{2}-\d{2}\.tsv$/.test(download.suggestedFilename()), download.suggestedFilename())
  check('declares tab separator + html', lines[0] === '#separator:tab' && lines.includes('#html:true'))
  check('declares the tags column', lines.includes('#tags column:3'))
  check('one row per note, highlight-only skipped', rows.length === 2, `${rows.length} rows`)
  check('book order, Genesis before John', rows[0].startsWith('Genesis'), rows[0].slice(0, 20))
  check('every row has exactly 3 fields', rows.every((r) => r.split('\t').length === 3))
  check('newline became <br>', rows.some((r) => r.includes('Line one<br>Line two')))
  check('tab inside a note was neutralised', rows.some((r) => r.includes('Creation here')))
  check('multi-word tag joined with _', rows.some((r) => /\bstudy_notes love\b/.test(r)))
  await ctx.close()
}

// ---------- 5. multi-word search ----------
console.log('\nMulti-word search')
{
  const { ctx, page } = await open()
  const run = async (q) => {
    const input = page.locator('.searchin')
    await input.fill(q)
    await page.waitForTimeout(700)
    const n = await page.locator('.dlist li').count()
    const first = n ? await page.locator('.dlist li').first().innerText() : ''
    return { n, first }
  }
  await page.locator('.icon[title="Search"]').click()
  await page.locator('.searchin').waitFor({ state: 'visible' })

  const fhc = await run('faith hope charity')
  check('faith hope charity finds 1 Corinthians 13:13', /1 Corinthians 13:13/.test(fhc.first), fhc.first.split('\n')[0])
  const marks = await page.locator('.dlist li mark').count()
  check('marks every matched term', marks >= 3, `${marks} marks`)

  const phrase = await run('"in the beginning"')
  check('quoted phrase still works', /Genesis 1:1/.test(phrase.first), phrase.first.split('\n')[0])

  const iam = await run('I am')
  check('I am does not lead with firmament', !/firmament/i.test(iam.first), iam.first.split('\n')[1] || '')

  const none = await run('faith hopez charityz')
  check('unmatched terms return nothing', none.n === 0, `${none.n}`)
  await ctx.close()
}

// ---------- 6. backgrounding handler is harmless when nothing is playing ----------
// The resume offer itself needs a real TTS voice, which headless Chromium has none
// of, so this only checks the listener cannot throw or invent a toast.
console.log('\nBackgrounding handler')
{
  const { ctx, page } = await open()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(300)
  check('no page error on hide/show', errors.length === 0, errors[0] || '')
  check('no resume toast when idle', await page.locator('.toast').count() === 0)
  check('reader still rendered', await page.locator('.verse').count() > 0)
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
