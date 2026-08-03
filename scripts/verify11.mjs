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

// ---------- 1. the card is warm before the first tap ----------
console.log('\nConcordance opens instantly')
{
  const { ctx, page, requests } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  await page.waitForTimeout(2000) // let the idle prefetch run
  const card = requests.filter((u) => /\/data\/concordance\/1-corinthians\.json/.test(u))
  const defs = requests.filter((u) => u.includes('-def.json'))
  check('the book card is prefetched on open', card.length === 1, `${card.length} request(s)`)
  check('definitions are NOT prefetched', defs.length === 0, `${defs.length} request(s)`)
  check('no 2 MB shared dictionary any more', !requests.some((u) => u.includes('lexicon.json')))

  // Opening the verse must not need another request, and must not show a spinner.
  // The card must render from memory. The definitions warm-up fires straight after,
  // so count only the card request here and assert the warm-up separately below.
  const isCard = (u) => u.includes('/data/concordance/') && !u.includes('-def.json')
  const cardsBefore = requests.filter(isCard).length
  await page.locator('#v-en-13').click()
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 2000 })
  const cardsAfter = requests.filter(isCard).length
  check('renders with no further card fetch', cardsAfter === cardsBefore, `${cardsAfter - cardsBefore} extra`)
  check('no toggle to press', await page.locator('.conctoggle').count() === 0)

  const rows = await page.locator('.strongs .conclist li').count()
  const text = await page.locator('.strongs').innerText()
  check('lists the verse words', rows === 12, `${rows} rows`)
  check('shows lemma + translit + code', /ἀγάπη/.test(text) && /agápē/.test(text) && /G26/.test(text))
  check('definitions are not shown up front', !/affection or benevolence/.test(text))

  // Tapping a word fetches that book's definitions once and expands in place.
  await page.waitForTimeout(800) // definitions warm once the panel is on screen
  check('definitions warmed after the panel rendered', requests.filter((u) => u.includes('-def.json')).length === 1)
  await page.locator('.strongs .crowbtn', { hasText: 'charity' }).first().click()
  await page.locator('.strongs .cdef').first().waitFor({ state: 'visible' })
  const dtext = await page.locator('.strongs .cdef').first().innerText()
  check('definition is there on tap, no spinner', /affection or benevolence/.test(dtext), dtext.slice(0, 50))
  check('plus the KJV renderings', /charity\(-ably\)|dear, love/.test(await page.locator('.strongs').innerText()))
  check('still only one definitions request', requests.filter((u) => u.includes('-def.json')).length === 1)
  await ctx.close()
}

// ---------- 1b. pronounce buttons ----------
console.log('\nPronounce buttons')
{
  const { ctx, page } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  await page.waitForTimeout(1800)
  await page.locator('#v-en-13').click()
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 3000 })
  const rows = await page.locator('.strongs .conclist li').count()
  const speak = await page.locator('.strongs .cspeak').count()
  check('one pronounce button per word', speak === rows, `${speak} for ${rows} rows`)
  const label = await page.locator('.strongs .cspeak').nth(5).getAttribute('aria-label')
  check('labelled with the word it speaks', /ἀγάπη/.test(label || ''), label || '')

  // Nested buttons would be invalid markup and would swallow each other's clicks.
  const nested = await page.evaluate(() => document.querySelectorAll('.crowbtn button').length)
  check('no button nested inside the row button', nested === 0, `${nested}`)

  const box = await page.locator('.strongs .cspeak').first().boundingBox()
  check('44px square target', box.width >= 44 && box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`)

  // Speaking must not throw, and must not leave the row expanded (separate controls).
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.locator('.strongs .cspeak').nth(5).click()
  await page.waitForTimeout(300)
  check('speaking does not throw', errors.length === 0, errors[0] || '')
  check('and does not expand the row', await page.locator('.strongs .cdef').count() === 0)

  // Hebrew rows must ask for a Hebrew voice, Greek for Greek.
  await ctx.close()
  const ot = await open(BASE, { hash: '#/genesis/1/en' })
  await ot.page.waitForTimeout(1800)
  await ot.page.locator('#v-en-1').click()
  await ot.page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 3000 })
  const hl = await ot.page.locator('.strongs .cspeak').first().getAttribute('aria-label')
  check('Hebrew lemma gets a button too', /[֑-ׇא-ת]/.test(hl || ''), hl || '')
  await ot.ctx.close()
}

// ---------- 1c. a stale CacheFirst entry must not silently empty the panel ----------
// Regression: the files first shipped under data/strongs/ with a different shape at
// the same URLs. Because the runtime cache is CacheFirst, readers who had already
// opened the panel were served the old shape for good, and it rendered nothing at all.
console.log('\nStale cache cannot blank the panel')
{
  const { ctx, page, requests } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Checked before the probe below, which would otherwise count as the app asking.
  check('the app never requests the old path', !requests.some((u) => u.includes('/data/strongs/')))

  // The abandoned path must not be what the app reads any more. Asserted on content,
  // not status: vite preview answers a missing file with index.html and a 200, while
  // GitHub Pages returns a real 404.
  const oldPath = await page.evaluate(async () => {
    try {
      const r = await fetch('data/strongs/1-corinthians.json')
      const body = await r.text()
      return body.trim().startsWith('{') ? 'still serving json' : 'not json'
    } catch {
      return 'unreachable'
    }
  })
  check('the old data/strongs path serves no card', oldPath !== 'still serving json', oldPath)

  // Poison the *current* URL with a wrong-shape payload and confirm it is rejected
  // as a failure rather than mistaken for a verse with no tagged words.
  await page.evaluate(async () => {
    const url = new URL('data/concordance/1-corinthians.json', location.href).href
    const c = await caches.open('bible-editions')
    await c.put(url, new Response(JSON.stringify({ '13': { '13': [['charity', 'G26']] } }), { status: 200, headers: { 'content-type': 'application/json' } }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.locator('#v-en-13').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  await page.waitForTimeout(800)
  const panels = await page.locator('.strongs').count()
  const failed = await page.locator('.strongs .empty').count()
  check('panel still renders, does not vanish', panels === 1, `${panels} panel(s)`)
  check('and reports the failure', failed === 1 && /could not be loaded/i.test(await page.locator('.strongs .empty').innerText()))

  // Retry must be able to get past a CacheFirst entry, or it is a lie.
  await page.locator('.strongs .empty .mini').click()
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 8000 })
  const rows = await page.locator('.strongs .conclist li').count()
  check('retry evicts the bad entry and recovers', rows === 12, `${rows} rows`)
  await ctx.close()
}

// ---------- 1d. loading indicator ----------
console.log('\nLoading indicator')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), BASE)
  const page = await ctx.newPage()
  // Hold the card back so the first-load state is observable at all.
  await page.route('**/data/concordance/john.json', async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.continue()
  })
  await page.goto(URL + '#/john/3/en', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.locator('#v-en-16').click()
  await page.locator('.strongs').waitFor({ state: 'visible', timeout: 5000 })
  const spinner = await page.locator('.strongs .spin').count()
  const text = await page.locator('.strongs .loadrow').innerText().catch(() => '')
  check('spinner shows while first loading', spinner === 1, `${spinner}`)
  check('and says Loading, not Searching', /Loading/.test(text), text.trim())
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 8000 })
  check('spinner goes away once loaded', await page.locator('.strongs .spin').count() === 0)
  await ctx.close()
}

// ---------- 1e. the pronounce glyph matches the verse play button ----------
console.log('\nPronounce glyph')
{
  const { ctx, page } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  await page.waitForTimeout(1800)
  await page.locator('#v-en-13').click()
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 3000 })
  // These used to assert the button held a literal ▶ and that it matched the verse
  // play button's glyph. Both are gone: the design system bans glyph-as-icon, and the
  // two buttons are now deliberately different icons, because .cspeak pronounces a
  // word and .vplay starts playback of the verse.
  const speakIcon = await page.locator('.strongs .cspeak svg.ic').first().count()
  const speakText = (await page.locator('.strongs .cspeak').first().innerText()).trim()
  check('pronounce is an icon, not a glyph', speakIcon === 1 && speakText === '', JSON.stringify(speakText))
  check('no speaker emoji anywhere', !(await page.locator('.strongs').innerText()).includes('🔊'))
  await ctx.close()
}

// ---------- 1f. glossary of older words ----------
console.log('\nGlossary (older words)')
{
  const { ctx, page } = await open(BASE, { hash: '#/1-corinthians/13/en' })
  await page.waitForTimeout(1800)
  await page.locator('#v-en-13').click()
  await page.locator('.gloss .conclist li').first().waitFor({ state: 'visible', timeout: 5000 })
  const txt = await page.locator('.gloss').innerText()
  check('shows the false friend', /charity/.test(txt), txt.split('\n').slice(0, 4).join(' | '))
  check('and its modern equivalent', /love/.test(txt))
  check('one row per distinct word, not per occurrence', await page.locator('.gloss .conclist li').count() === 1)

  // The glossary answers the more urgent question, so it must come first.
  const order = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.conc')]
    return p.map((el) => (el.classList.contains('gloss') ? 'gloss' : 'conc')).join(',')
  })
  check('sits above the concordance', order === 'gloss,conc', order)

  await page.locator('.gloss .crowbtn').first().click()
  await page.locator('.gloss .cdef').first().waitFor({ state: 'visible' })
  const note = await page.locator('.gloss .cdef').first().innerText()
  check('note explains the shift', /not almsgiving/i.test(note), note.slice(0, 50))
  check('modern word can be spoken too', await page.locator('.gloss .cdef .gsay').count() === 1)
  const box = await page.locator('.gloss .crowbtn').first().boundingBox()
  check('44px touch target', box.height >= 44, `${Math.round(box.height)}px`)
  await ctx.close()
}

console.log('\nGlossary precision')
{
  const { ctx, page } = await open(BASE, { hash: '#/john/3/en' })
  await page.waitForTimeout(1800)
  await page.locator('#v-en-16').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  await page.waitForTimeout(600)
  check('no panel when a verse has nothing archaic', await page.locator('.gloss').count() === 0)
  await ctx.close()

  // `let` means hinder in three verses and allow in hundreds; only the three are tagged.
  const a = await open(BASE, { hash: '#/romans/1/en' })
  await a.page.waitForTimeout(1800)
  await a.page.locator('#v-en-13').click()
  await a.page.locator('.gloss').waitFor({ state: 'visible', timeout: 5000 })
  check('rare sense tagged where it applies', /let/.test(await a.page.locator('.gloss').innerText()))
  await a.ctx.close()

  const b = await open(BASE, { hash: '#/romans/5/en' })
  await b.page.waitForTimeout(1800)
  await b.page.locator('#v-en-3').click()
  await b.page.locator('.verse-sheet').waitFor({ state: 'visible' })
  await b.page.waitForTimeout(600)
  const bt = (await b.page.locator('.gloss').count()) ? await b.page.locator('.gloss').innerText() : ''
  check('and not where it means allow', !/\blet\b/.test(bt), bt.replace(/\n/g, ' ').slice(0, 40))
  await b.ctx.close()

  // A derived Webster entry, badged so its provenance is visible.
  const c = await open(BASE, { hash: '#/1-chronicles/29/en' })
  await c.page.waitForTimeout(1800)
  await c.page.locator('#v-en-4').click()
  await c.page.locator('.gloss').waitFor({ state: 'visible', timeout: 5000 })
  const ct = await c.page.locator('.gloss').innerText()
  check('derived archaic word shown', /withal/.test(ct), ct.replace(/\n/g, ' ').slice(0, 60))
  check('and badged archaic', /archaic/i.test(ct))
  await c.ctx.close()

  // Not the KJV: no glossary, and the cross-edition fallback instead.
  const d = await open(BASE, { hash: '#/1-corinthians/13/ja' })
  await d.page.waitForTimeout(1500)
  await d.page.locator('#v-ja-13').click()
  await d.page.locator('.verse-sheet').waitFor({ state: 'visible' })
  check('absent for a non-KJV edition', await d.page.locator('.gloss').count() === 0)
  check('which falls back to comparing', await d.page.locator('.compare .crow').count() === 3)
  await d.ctx.close()
}

// ---------- 2. one edition on the card, and KJV-only ----------
console.log('\nCard shows one edition')
{
  const { ctx, page } = await open(BASE, { hash: '#/john/3/en' })
  await page.locator('#v-en-16').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  check('exactly one edition row', await page.locator('.compare .crow').count() === 1, `${await page.locator('.compare .crow').count()}`)
  const row = await page.locator('.compare .crow').innerText()
  check('and it is the one tapped', /KJV/.test(row), row.split('\n')[0])
  await ctx.close()

  // An edition with no word panel falls back to comparing across editions.
  const j = await open(BASE, { hash: '#/john/3/ja' })
  await j.page.locator('#v-ja-16').click()
  await j.page.locator('.verse-sheet').waitFor({ state: 'visible' })
  const jrows = await j.page.locator('.compare .crow').count()
  check('no panel yet for the 文語訳', await j.page.locator('.strongs').count() === 0)
  check('so it falls back to all visible editions', jrows === 3, `${jrows} rows`)
  await j.ctx.close()
}

// ---------- 2b. mobile ----------
console.log('\nMobile')
{
  const { ctx, page } = await open(BASE, { mobile: true, hash: '#/1-corinthians/13/en' })
  await page.waitForTimeout(1800)
  await page.locator('#v-en-13').click()
  await page.locator('.strongs .conclist li').first().waitFor({ state: 'visible', timeout: 3000 })
  const box = await page.locator('.strongs .crowbtn').first().boundingBox()
  check('row is a 44px touch target', box.height >= 44, `${Math.round(box.height)}px`)
  const sheet = await page.locator('.verse-sheet').boundingBox()
  check('card does not overflow 360px', sheet.width <= 360, `${Math.round(sheet.width)}px`)
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.verse-sheet')
    return el.scrollWidth - el.clientWidth
  })
  check('no horizontal overflow inside the sheet', overflow <= 1, `${overflow}px`)
  await page.waitForTimeout(700)
  await page.locator('.strongs .crowbtn', { hasText: 'charity' }).first().click()
  await page.locator('.strongs .cdef').first().waitFor({ state: 'visible' })
  await page.locator('.cdef .ckjv').first().waitFor({ state: 'visible', timeout: 4000 })
  check('definition opens on a phone tap', /affection or benevolence/.test(await page.locator('.strongs .cdef').first().innerText()))
  await ctx.close()
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
