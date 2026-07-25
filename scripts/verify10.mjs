// Drives the preview build with Playwright to check this batch of work:
// header overflow, localized titles, flow-mode chapter nav, RTL, aligned verses,
// multilingual reference search, hidden-edition link fallback, invite links.
//
// Run:  npx vite preview --port 4178 --strictPort
//       node scripts/verify10.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:4178/'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()

/** Fresh context with prefs seeded before the app boots. */
async function open(prefs, { mobile = false, hash = '' } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } },
  )
  await ctx.addInitScript((p) => {
    if (p) localStorage.setItem('prefs', JSON.stringify(p))
  }, prefs)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  return { ctx, page }
}

const BASE = { theme: 'light', size: 'md', furigana: true, align: true, rate: 1, voice: 'male', swipe: false, flow: false, stopAtChapterEnd: false }

// ---------- 1. header does not overflow on a narrow phone ----------
console.log('\nHeader overflow (360px, long localized book name)')
{
  const { ctx, page } = await open(
    { ...BASE, ui: 'fr', columns: ['fr', 'en', 'ja'] },
    { mobile: true, hash: '#/1-thessalonians/5/fr' },
  )
  await page.waitForSelector('.verse')
  const bar = await page.locator('.bar').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  const body = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  check('.bar does not overflow', bar.scroll <= bar.client, `scrollWidth ${bar.scroll} vs clientWidth ${bar.client}`)
  check('header keeps to three routine actions', (await page.locator('.tools .icon').count()) === 3)
  check('page does not scroll horizontally', body.scroll <= body.client, `${body.scroll} vs ${body.client}`)
  await page.screenshot({ path: `${OUT}/10-header-mobile.png` })
  await ctx.close()
}

// ---------- 2. localized chapter titles ----------
console.log('\nLocalized chapter titles')
for (const [ui, lang, expect] of [
  ['fr', 'fr', 'Matthieu'],
  ['en', 'en', 'Matthew'],
  ['ja', 'ja', 'マタイ'],
]) {
  const { ctx, page } = await open({ ...BASE, ui, columns: [lang] }, { mobile: true, hash: `#/matthew/15/${lang}` })
  await page.waitForSelector('.verse')
  const nav = await page.locator('.navbtn').innerText()
  const h1 = await page.locator('.ref').innerText()
  check(`ui=${ui} header shows "${expect}"`, nav.includes(expect), `got "${nav.trim()}"`)
  check(`ui=${ui} h1 shows "${expect}"`, h1.includes(expect), `got "${h1.trim()}"`)
  await ctx.close()
}

// ---------- 3. flow mode chapter navigation ----------
console.log('\nFlow mode chapter nav')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', flow: true, columns: ['en'] }, { hash: '#/mark/1/en' })
  await page.waitForSelector('.fverse')
  check('chapter nav is rendered in flow mode', (await page.locator('.chapnav').count()) === 1)
  check('chapter markers rendered', (await page.locator('.fchap').count()) > 1)

  const before = await page.evaluate(() => window.scrollY)
  await page.locator('.chapnav button').last().click()
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => window.scrollY)
  check('Next scrolls down the book', after > before, `scrollY ${before} → ${after}`)

  // Chapter 2's first verse should now be near the middle of the viewport.
  const box = await page.locator('#fv-2-1').boundingBox()
  const vh = await page.evaluate(() => window.innerHeight)
  check('chapter 2 verse 1 is in view', !!box && box.y > 0 && box.y < vh, box ? `y=${Math.round(box.y)} vh=${vh}` : 'not found')
  check('label followed the jump', (await page.locator('.chaplabel').innerText()).includes('2'))

  // Navigator sheet jump, further into the book
  await page.locator('.navbtn').click()
  await page.waitForSelector('.chgrid')
  await page.locator('.chgrid .chbtn').nth(7).click() // chapter 8
  await page.waitForTimeout(700)
  const box8 = await page.locator('#fv-8-1').boundingBox()
  check('Navigator jumps to chapter 8', !!box8 && box8.y > 0 && box8.y < vh, box8 ? `y=${Math.round(box8.y)}` : 'not found')
  await page.screenshot({ path: `${OUT}/10-flow-nav.png` })
  await ctx.close()
}

// ---------- 4. aligned verses share a row ----------
console.log('\nAligned verses across editions')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', align: true, columns: ['en', 'ja', 'fr'] }, { hash: '#/john/1/en' })
  await page.waitForSelector('.verse')
  const tops = await page.evaluate(() =>
    ['en', 'ja', 'fr'].map((l) => Math.round(document.getElementById(`v-${l}-5`).getBoundingClientRect().top)),
  )
  check('verse 5 tops match across 3 columns', new Set(tops).size === 1, `tops = ${tops.join(', ')}`)
  await page.screenshot({ path: `${OUT}/10-aligned.png` })
  await ctx.close()

  const { ctx: c2, page: p2 } = await open({ ...BASE, ui: 'en', align: false, columns: ['en', 'ja', 'fr'] }, { hash: '#/john/1/en' })
  await p2.waitForSelector('.verse')
  const tops2 = await p2.evaluate(() =>
    ['en', 'ja', 'fr'].map((l) => Math.round(document.getElementById(`v-${l}-5`).getBoundingClientRect().top)),
  )
  check('unaligned mode does NOT force a shared row', new Set(tops2).size > 1, `tops = ${tops2.join(', ')}`)
  await c2.close()
}

// ---------- 5. RTL ----------
console.log('\nRight-to-left (Arabic UI + Arabic/Hebrew text)')
{
  const { ctx, page } = await open({ ...BASE, ui: 'ar', columns: ['ar', 'he', 'en'] }, { hash: '#/genesis/1/ar' })
  await page.waitForSelector('.verse')
  check('document dir is rtl', (await page.evaluate(() => document.documentElement.dir)) === 'rtl')
  const body = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  check('no horizontal page scroll in RTL', body.scroll <= body.client, `${body.scroll} vs ${body.client}`)
  check('Arabic column carries dir=rtl', (await page.locator('.col[dir="rtl"]').count()) >= 2)
  const arText = await page.locator('#v-ar-1 .vt').innerText()
  check('Arabic text rendered', /[؀-ۿ]/.test(arText), arText.slice(0, 40))
  const heText = await page.locator('#v-he-1 .vt').innerText()
  check('Hebrew text rendered', /[֐-׿]/.test(heText), heText.slice(0, 40))
  // drawer should open against the inline-end edge, which is the left in RTL
  await page.locator('.tools .icon').nth(1).click()
  await page.waitForSelector('.drawer')
  const d = await page.locator('.drawer').boundingBox()
  check('drawer opens on the left in RTL', d.x < 5, `x=${Math.round(d.x)}`)
  await page.screenshot({ path: `${OUT}/10-rtl.png` })
  await ctx.close()
}

// ---------- 6. Greek/Hebrew half-coverage ----------
console.log('\nPartial-coverage editions')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'el', 'he'] }, { hash: '#/genesis/1/en' })
  await page.waitForSelector('.verse')
  check('Greek shows one coverage note in Genesis, not a dotted column',
    (await page.locator('.col.uncovered .coverage').count()) === 1 &&
    (await page.locator('#v-el-1').count()) === 0)
  check('the note says what the edition covers',
    /New Testament/i.test(await page.locator('.col.uncovered .coverage').innerText()))
  const heHas = await page.locator('#v-he-1 .vt').innerText()
  check('Hebrew has text in Genesis', /[֐-׿]/.test(heHas))

  await page.goto(URL + '#/matthew/1/en', { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  const elHas = await page.locator('#v-el-1 .vt').innerText()
  check('Greek has text in Matthew (NT)', /[Ͱ-Ͽἀ-῿]/.test(elHas), elHas.slice(0, 40))
  check('Hebrew shows a coverage note in Matthew',
    /Old Testament/i.test(await page.locator('.col.uncovered .coverage').innerText()))
  await ctx.close()
}

// ---------- 7. multilingual reference search ----------
console.log('\nReference search in any edition language')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en'] })
  await page.waitForSelector('.verse')
  for (const [query, expect] of [
    ['John 3:16', 'John 3:16'],
    ['Mateo 15:3', 'Matthew 15:3'],
    ['マタイ15:3', 'Matthew 15:3'],
    ['馬太福音15:3', 'Matthew 15:3'],
    ['Matthieu 15:3', 'Matthew 15:3'],
    ['ps 23', 'Psalms 23'],
    ['يوحنا 3:16', 'John 3:16'],
    ['إنجيل يوحنا 3:16', 'John 3:16'],
    ['تكوين 1:1', 'Genesis 1:1'],
    ['תהלים 23', 'Psalms 23'],
    ['Ματθαίον 15:3', 'Matthew 15:3'],
    ['Mateus 15:3', 'Matthew 15:3'],
    ['約翰福音3:16', 'John 3:16'],
    ['Juan 3:16', 'John 3:16'],
    ['samuel 3', '(none)'],
  ]) {
    await page.locator('.tools .icon').first().click()
    await page.waitForSelector('.searchin')
    await page.locator('.searchin').fill(query)
    await page.waitForTimeout(120)
    const go = page.locator('.dref.go .dlabel')
    const got = (await go.count()) ? (await go.innerText()).replace(/^→\s*Go to\s*/, '').trim() : '(none)'
    check(`"${query}" → ${expect}`, got === expect, `got "${got}"`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await ctx.close()
}

// ---------- 8. link to a hidden edition falls back ----------
console.log('\nShared link pointing at a hidden edition')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'fr'] }, { hash: '#/matthew/15/ar/3' })
  await page.waitForSelector('.verse')
  const toast = await page.locator('.toast').innerText().catch(() => '')
  check('a toast explains the fallback', /hidden/i.test(toast), `toast: "${toast}"`)
  check('hash rewritten to a visible edition', /\/(en|fr)\//.test(await page.evaluate(() => location.hash)), await page.evaluate(() => location.hash))
  check('verse survived the fallback', (await page.evaluate(() => location.hash)).endsWith('/3'))
  check('Arabic column not shown', (await page.locator('#v-ar-3').count()) === 0)
  await ctx.close()
}

// ---------- 9. invite links ----------
console.log('\nInvite links')
{
  const payload = Buffer.from(JSON.stringify({ c: ['ar', 'en'], l: 'ar', s: 'matthew', ch: 15, v: 3 }), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // Receiving: applies immediately, no approval step.
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'fr'] }, { hash: `#/i/${payload}` })
  await page.waitForSelector('.verse')
  check('no approval dialog appears', (await page.locator('.sheet.invite').count()) === 0)
  const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')).columns)
  check('sender’s editions applied at once', JSON.stringify(applied) === JSON.stringify(['ar', 'en']), applied.join(','))
  check('opens in the sender’s first edition', (await page.evaluate(() => location.hash)).includes('/ar/'))
  check('lands on the shared verse', (await page.evaluate(() => location.hash)).endsWith('/3'))
  const toast = await page.locator('.toast').innerText()
  check('toast names what changed', /العربية/.test(toast), toast.replace(/\n/g, ' '))

  // Undo restores the reader's own arrangement without a dialog.
  await page.locator('.toastact').click()
  await page.waitForTimeout(300)
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs')).columns)
  check('Undo restores the previous editions', JSON.stringify(undone) === JSON.stringify(['en', 'fr']), undone.join(','))
  await ctx.close()

  // Sending: the builder picks which editions to share, and their order.
  const { ctx: c2, page: p2 } = await open({ ...BASE, ui: 'en', columns: ['en', 'ja'] }, { hash: '#/matthew/15/en' })
  await p2.waitForSelector('.verse')
  await p2.locator('#v-en-3 .vn').click()
  await p2.waitForSelector('.verse-sheet')
  await p2.locator('.verse-sheet .noteact .mini').nth(3).click()   // Copy invite
  await p2.waitForSelector('.sheet.invite')
  check('builder lists the sender’s editions first', (await p2.locator('.sheet.invite .colrow:not(.off)').count()) === 2)
  check('builder offers the other nine', (await p2.locator('.sheet.invite .colrow.off').count()) === 9)
  check('builder marks which edition it opens in', (await p2.locator('.sheet.invite .opens').count()) === 1)
  check('builder is reached from the verse, carrying the reference',
    /15:3/.test(await p2.locator('.sheet.invite .opens').innerText()),
    await p2.locator('.sheet.invite .opens').innerText())
  // add Arabic, then move it to the top so the link opens in it
  await p2.locator('.sheet.invite .colrow.off', { hasText: 'العربية' }).locator('.mini').click()
  await p2.waitForTimeout(150)
  await p2.locator('.sheet.invite .colrow:not(.off)').last().locator('.mini').nth(0).click()
  await p2.locator('.sheet.invite .colrow:not(.off)').nth(1).locator('.mini').nth(0).click()
  await p2.waitForTimeout(150)
  const order = await p2.locator('.sheet.invite .colrow:not(.off) .collabel').allInnerTexts()
  check('reordering works in the builder', /العربية/.test(order[0]), order.map(x => x.split('\n')[0]).join(' | '))
  await p2.screenshot({ path: `${OUT}/10-invite.png` })
  await c2.close()
}

// ---------- 10. verse sheet: visible editions only, with highlight controls ----------
console.log('\nVerse sheet')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'fr'] }, { hash: '#/john/3/en' })
  await page.waitForSelector('.verse')
  await page.locator('#v-en-16 .vn').click()
  await page.waitForSelector('.verse-sheet')
  check('only visible editions are compared', (await page.locator('.verse-sheet .crow').count()) === 2)
  check('no whole-verse colour swatches', (await page.locator('.verse-sheet .hlctl').count()) === 0)

  // Select part of the verse inside the sheet — the same gesture as in the reader.
  await page.evaluate(() => {
    const ct = document.querySelector('#sv-en-3-16 .ctext')
    const t = document.createTreeWalker(ct, NodeFilter.SHOW_TEXT).nextNode()
    const r = document.createRange()
    r.setStart(t, 0)
    r.setEnd(t, 11)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
  await page.waitForSelector('.atoolbar')
  check('selecting inside the sheet opens the highlight toolbar', true)
  await page.locator('.atoolbar .sw-blue').click()
  await page.waitForTimeout(300)
  const painted = await page.locator('#sv-en-3-16 .ctext .hl.hl-blue').allInnerTexts()
  check('only the selected words are highlighted', painted.join('') === 'For God so ', `got "${painted.join('')}"`)
  check('reader shows the same partial highlight', (await page.locator('#v-en-16 .hl.hl-blue').count()) > 0)
  await page.screenshot({ path: `${OUT}/10-versesheet.png` })
  await page.locator('.verse-sheet .abtn.tiny').click()
  await page.waitForTimeout(250)
  check('per-edition clear removes it', (await page.locator('#sv-en-3-16 .ctext .hl').count()) === 0)
  await ctx.close()
}

// ---------- 10b. selection → highlight, as real DOM spans ----------
// Persistent highlights are DOM spans, not CSS Custom Highlights (the latter
// mispaints over <ruby> in Safari), so assert on .hl elements and their text.
console.log('\nSelection → highlight')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'ja'] }, { hash: '#/genesis/1/en' })
  await page.waitForSelector('#v-en-1')

  // Selection anchored at the element boundary (offset 0) — the edge case that
  // baseOffsetTo() in highlight.ts exists to get right.
  await page.evaluate(() => {
    const vt = document.querySelector('#v-en-1 .vt')
    const first = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT).nextNode()
    const r = document.createRange()
    r.setStart(vt, 0)
    r.setEnd(first, 8)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
  await page.waitForSelector('.atoolbar')
  await page.locator('.atoolbar .sw-yellow').click()
  await page.waitForTimeout(250)
  const enHl = await page.locator('#v-en-1 .hl.hl-yellow').allInnerTexts()
  check('first-character selection highlights exactly it', enHl.join('') === 'In the b', `got "${enHl.join('')}"`)

  // Japanese: offsets are in displayed-base coordinates, so a highlight over kanji
  // must cover the kanji and not leak into the furigana <rt>.
  await page.evaluate(() => {
    const ruby = document.querySelector('#v-ja-1 ruby')
    const base = document.createTreeWalker(ruby, NodeFilter.SHOW_TEXT).nextNode()
    const r = document.createRange()
    r.setStart(base, 0)
    r.setEnd(base, base.length)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
  await page.waitForSelector('.atoolbar')
  await page.locator('.atoolbar .sw-green').click()
  await page.waitForTimeout(250)
  const jaHl = await page.locator('#v-ja-1 .hl.hl-green').count()
  check('kanji selection highlights over ruby', jaHl > 0)
  const leaked = await page.locator('#v-ja-1 rt .hl').count()
  check('highlight does not leak into furigana', leaked === 0)

  // survives a reload (localStorage round trip)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#v-en-1')
  check('highlights persist across reload', (await page.locator('#v-en-1 .hl.hl-yellow').count()) > 0)
  await page.screenshot({ path: `${OUT}/10-highlight.png` })
  await ctx.close()
}

// ---------- 11. notes: tags, sort, confirm-before-delete ----------
console.log('\nNotes drawer')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en'] }, { hash: '#/john/3/en' })
  await page.waitForSelector('.verse')
  await page.locator('#v-en-16 .vn').click()
  await page.waitForSelector('.verse-sheet')
  await page.locator('.verse-sheet .primary').click()
  await page.waitForSelector('.notearea')
  await page.locator('.notearea').fill('God so loved the world')
  // comma-separated entry creates several at once
  await page.locator('.taginput').fill('study, prayer')
  await page.keyboard.press('Enter')
  const active = await page.locator('.tagedit .chip.on').allInnerTexts()
  check('comma separated entry creates two tags', active.length === 2, active.map(x => x.replace('✕','').trim()).join(' + '))
  await page.locator('.sheet.note .primary').click()
  await page.waitForTimeout(250)

  // A second note should offer the first note's tags as dimmed, clickable chips.
  await page.locator('#v-en-17 .vn').click()
  await page.waitForSelector('.verse-sheet')
  await page.locator('.verse-sheet .primary').click()
  await page.waitForSelector('.notearea')
  const dim = await page.locator('.tagedit .chip.dim').allInnerTexts()
  check('existing tags offered as dimmed chips', dim.length === 2, dim.join(' + '))
  await page.locator('.tagedit .chip.dim').first().click()
  await page.waitForTimeout(150)
  check('clicking a dimmed chip applies it', (await page.locator('.tagedit .chip.on').count()) === 1)
  await page.locator('.tagedit .chip.on').first().click()
  await page.waitForTimeout(150)
  check('clicking it again removes it', (await page.locator('.tagedit .chip.on').count()) === 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  await page.locator('.tools .icon').nth(1).click()
  await page.waitForSelector('.drawer')
  check('note listed', (await page.locator('.dlist li').count()) === 1)
  check('tags shown on the note', (await page.locator('.dlist .chip.static').count()) === 2)
  check('updated timestamp shown', /\d/.test(await page.locator('.dmeta').first().innerText()))
  check('tag filter chips offered', (await page.locator('.dfrow.tagrow .chip').count()) === 2)

  // A misspelled tag can be deleted everywhere, with a confirmation naming the count.
  await page.locator('.tagedit-toggle').click()
  await page.waitForTimeout(150)
  check('edit mode reveals a delete on each tag', (await page.locator('.dfrow.tagrow .chipx').count()) === 2)
  await page.locator('.dfrow.tagrow .chipx').first().click()
  await page.waitForSelector('.sheet.confirm')
  const body = await page.locator('.sheet.confirm .empty').innerText()
  check('confirmation names the tag and how many notes', /prayer|study/.test(body) && /\d/.test(body), body)
  await page.locator('.sheet.confirm .danger').click()
  await page.waitForTimeout(300)
  check('tag removed everywhere', (await page.locator('.dfrow.tagrow .chip').count()) === 1)
  check('the note itself survives', (await page.locator('.dlist li').count()) === 1)

  await page.locator('.dfilters .seg button').nth(3).click() // Custom
  check('reorder arrows appear in custom mode', (await page.locator('.dmove').count()) === 1)
  await page.screenshot({ path: `${OUT}/10-notes.png` })

  await page.locator('.dlist .icon.del').click()
  await page.waitForSelector('.sheet.confirm')
  check('delete asks for confirmation', true)
  await page.locator('.sheet.confirm .ghost').click()
  await page.waitForTimeout(150)
  check('cancelling keeps the note', (await page.locator('.dlist li').count()) === 1)
  await page.locator('.dlist .icon.del').click()
  await page.waitForSelector('.sheet.confirm')
  await page.locator('.sheet.confirm .danger').click()
  await page.waitForTimeout(200)
  check('confirming deletes the note', (await page.locator('.dlist li').count()) === 0)
  await ctx.close()
}

// ---------- 11b. stop at chapter end (audio behaviour) ----------
// Drives speechSynthesis synthetically so a whole chapter plays in a moment, then
// checks whether playback rolls into the next chapter or halts.
console.log('\nStop at chapter end')
for (const [stopAtChapterEnd, expectAdvance] of [
  [false, true],
  [true, false],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(
    (p) => {
      localStorage.setItem('prefs', JSON.stringify(p))
      window.__spoken = 0
      const drive = (u) => {
        window.__spoken++
        Promise.resolve().then(() => u.onstart && u.onstart({}))
        setTimeout(() => u.onend && u.onend({}), 3)
      }
      Object.defineProperty(window.speechSynthesis, 'speak', { value: drive, configurable: true })
      Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => {}, configurable: true })
      // getVoices() is deliberately NOT stubbed: assigning anything other than a real
      // SpeechSynthesisVoice to utterance.voice throws a TypeError, which would kill
      // playback before onDone and make this test look like an app bug.
    },
    { ...BASE, ui: 'en', columns: ['en'], stopAtChapterEnd },
  )
  const page = await ctx.newPage()
  // Psalm 117 is two verses long, so the roll-on happens almost immediately.
  await page.goto(URL + '#/psalms/117/en', { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  await page.locator('.colplay').click()
  await page.waitForTimeout(1800)
  const hash = await page.evaluate(() => location.hash)
  // Verses are driven at 3ms each, so continuous mode runs through several chapters
  // in the window — the check is "did it leave 117", not "did it land on 118".
  const chapter = Number(/psalms\/(\d+)/.exec(hash)?.[1])
  const advanced = chapter > 117
  check(
    `stopAtChapterEnd=${stopAtChapterEnd} → ${expectAdvance ? 'rolls on past Psalm 117' : 'halts at the end of Psalm 117'}`,
    advanced === expectAdvance,
    `stopped at Psalm ${chapter}`,
  )
  await ctx.close()
}

// ---------- 12. settings groups + licences ----------
console.log('\nSettings: stop at chapter end + licences sheet')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en'] })
  await page.waitForSelector('.verse')
  await page.locator('.tools .icon').nth(2).click()
  await page.waitForSelector('.sheet')
  const groups = await page.locator('.sgroup').allInnerTexts()
  check('settings are grouped', groups.length >= 3, groups.join(' | '))
  check('language options grouped together', groups.some((g) => /language/i.test(g)), groups.join(' | '))
  const langGroupRows = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.sheet .sgroup, .sheet .srow, .sheet .collist')]
    const start = nodes.findIndex((n) => n.classList.contains('sgroup') && /language/i.test(n.textContent))
    const out = []
    for (let i = start + 1; i < nodes.length; i++) {
      if (nodes[i].classList.contains('sgroup')) break
      out.push(nodes[i].textContent.trim().slice(0, 40))
    }
    return out
  })
  check('UI language, versions, align, furigana, swipe all in that group', langGroupRows.length >= 5, `${langGroupRows.length} rows`)

  // Group headings must have real room beneath them, and must not sit between two
  // hairlines: .sgroup once had a negative bottom margin, which pulled the first
  // row's border up over the label.
  const spacing = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet .sgroup')].map((g) => {
      const n = g.nextElementSibling
      const first = n.querySelector('span, .collabel') || n
      return {
        group: g.textContent.trim(),
        gap: +(first.getBoundingClientRect().top - g.getBoundingClientRect().bottom).toFixed(1),
        doubleRule: getComputedStyle(n).borderTopWidth !== '0px',
      }
    }),
  )
  const tight = spacing.filter((x) => x.gap < 8)
  check('every group heading has >=8px beneath it', tight.length === 0,
    tight.length ? tight.map((x) => `${x.group}:${x.gap}px`).join(', ') : spacing.map((x) => `${x.group}:${x.gap}px`).join(', '))
  const doubled = spacing.filter((x) => x.doubleRule)
  check('no group heading is followed by a second rule', doubled.length === 0,
    doubled.map((x) => x.group).join(', ') || 'clean')

  // In an LTR UI every version row must read name-then-badge, including the RTL
  // editions: without <bdi> the Arabic label dragged its badge across the row.
  const rowOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet .colrow')].map((r) => {
      const name = r.querySelector('.collabel bdi')
      const badge = r.querySelector('.collabel small')
      if (!name || !badge) return null
      return { name: name.textContent, nameLeft: name.getBoundingClientRect().left, badgeLeft: badge.getBoundingClientRect().left }
    }).filter(Boolean),
  )
  const wrongOrder = rowOrder.filter((r) => r.nameLeft > r.badgeLeft)
  check('every version row reads name then badge', wrongOrder.length === 0,
    wrongOrder.map((r) => r.name).join(', ') || `${rowOrder.length} rows consistent`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.locator('.attrib .liclink').click()
  await page.waitForSelector('.sheet.licences')
  check('licences sheet lists all 11 editions', (await page.locator('.liclist li').count()) === 11)
  check('licences sheet links the repo', (await page.locator('.licrepo a').count()) === 1)
  await page.screenshot({ path: `${OUT}/10-licences.png` })
  await ctx.close()
}

// ---------- 12b. apostrophes and quotes fold in search ----------
// The editions disagree: KJV/Almeida use U+0027, the KJF uses U+2019. A reader types
// whichever their keyboard gives, so both must match either.
console.log('\nSearch: punctuation folding')
{
  const { ctx, page } = await open({ ...BASE, ui: 'en', columns: ['en', 'fr'] })
  await page.waitForSelector('.verse')
  const hits = async (q) => {
    await page.locator('.tools .icon').first().click()
    await page.waitForSelector('.searchin')
    await page.locator('.searchin').fill(q)
    await page.waitForTimeout(2500)
    const n = await page.locator('.dlist li').count()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    return n
  }
  const straight = await hits("l'Esprit")
  const curly = await hits('l\u2019Esprit')
  check("straight apostrophe finds French text (l'Esprit)", straight > 0, `${straight} hits`)
  check('curly apostrophe finds the same', curly > 0, `${curly} hits`)
  check('both forms agree', straight === curly, `${straight} vs ${curly}`)
  const gods = await hits("God's")
  check("straight apostrophe finds English text (God's)", gods > 0, `${gods} hits`)
  await ctx.close()
}

// ---------- 12c. no em-dash in rendered copy ----------
console.log('\nCopy convention: no em-dash on the frontend')
{
  for (const ui of ['en', 'fr', 'ja', 'ar']) {
    const { ctx, page } = await open({ ...BASE, ui, columns: ['en', 'el', 'he'] }, { hash: '#/genesis/1/en' })
    await page.waitForSelector('.verse')
    // Open each panel so its copy is in the DOM, closing with Escape between.
    for (const i of [2, 1, 0]) {
      await page.locator('.tools .icon').nth(i).click()
      await page.waitForTimeout(250)
      const seen = await page.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll('button, label, .empty, .sgroup, option, .collabel, .licname, .lictext')) {
          if (el.textContent && el.textContent.includes('\u2014')) out.push(el.textContent.trim().slice(0, 60))
        }
        return out
      })
      if (seen.length) console.log('      panel copy with em-dash:', seen.join(' / '))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    // chrome text only: verse text is scripture and not ours to restyle
    const found = await page.evaluate(() => {
      const bad = []
      for (const el of document.querySelectorAll('button, label, .empty, .sgroup, .toast, .attrib, .coverage, .clang, .dmeta, .badge, .cnote, option')) {
        if (el.textContent && el.textContent.includes('\u2014')) bad.push(el.textContent.trim().slice(0, 50))
      }
      const attrs = []
      for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
        for (const a of ['title', 'aria-label', 'placeholder']) {
          const v = el.getAttribute(a)
          if (v && v.includes('\u2014')) attrs.push(`${a}="${v.slice(0, 40)}"`)
        }
      }
      return [...bad, ...attrs]
    })
    check(`ui=${ui} no em-dash in chrome`, found.length === 0, found.join(' / ') || 'clean')
    await ctx.close()
  }
}

// ---------- 13. splash lists every edition ----------
console.log('\nPWA splash')
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  // Read the served document before scripts replace #root.
  const html = await (await fetch(URL)).text()
  const count = (html.match(/<li lang=/g) || []).length
  check('splash markup lists 11 editions', count === 11, `${count} entries`)
  for (const s of ['和合本', 'فان دايك', 'עברית', 'Ἑλληνική', 'Almeida', 'ADB 1905'])
    check(`splash mentions ${s}`, html.includes(s))
  await page.goto(URL, { waitUntil: 'networkidle' })
  check('splash is replaced once the app mounts', (await page.locator('#splash').count()) === 0)
  await ctx.close()
}

await browser.close()
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\nScreenshots in ${OUT}\n`)
process.exit(failures === 0 ? 0 : 1)
