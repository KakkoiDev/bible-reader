// What the corpus says about itself: an absent chapter, and a book's title.
//
// check-data's first four passes iterate each edition's own chapter map, so a chapter
// that is not in the file is never visited and never reported. That is how 18 empty
// 口語訳 chapters shipped. Pass E iterates the KJV spine instead. These assertions
// fail if that pass is removed or narrowed.
//
// Titles: build-data used to prefer whatever heading the export carried over the
// curated table, which put an English title in the Japanese column for the one book
// getbible names differently.
//
// Run:  npx vite preview --port 4182 --strictPort
//       node scripts/verify13.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const URL = 'http://localhost:4182/'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

let out = ''
let code = 0
try {
  out = execFileSync('node', [resolve(__dirname, 'check-data.mjs')], { cwd: root, encoding: 'utf8' })
} catch (e) {
  out = `${e.stdout || ''}${e.stderr || ''}`
  code = e.status
}

console.log('\ncheck-data sees a chapter that is absent from the file')
check('it exits clean', code === 0, `exit ${code}`)
check('and says how many chapters the sources omit', /18 chapter\(s\) the source omits/.test(out),
  out.split('\n').find((l) => /chapter\(s\) the source omits/.test(l)) || 'no such line')

// The five books, named. A pass that only counted would let a chapter move between
// books unnoticed.
for (const [book, chapters] of [
  ['Psalms', '130, 131, 132, 133, 134, 135, 136, 137, 138, 139'],
  ['Proverbs', '30, 31'],
  ['Matthew', '25, 26, 27, 28'],
  ['John', '19'],
  ['Romans', '10'],
])
  check(`jako ${book} ${chapters}`, out.includes(`jako ${book} ${chapters} `))

// An edition that carries half the canon must not be reported for the half it never
// claimed, or the pass is unusable and would be silenced.
console.log('\nHalf-canon editions are not accused of a gap')
check('no Greek Old Testament complaint', !/\bel (Genesis|Psalms|Malachi)\b/.test(out))
check('no Hebrew New Testament complaint', !/\bhe (Matthew|John|Revelation)\b/.test(out))
check('Hebrew Malachi 4 stays silent', !out.includes('he Malachi'))

// ---------- book titles ----------
console.log('\nEvery edition names its books in its own script')
{
  const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8'))
  const latin = []
  for (const b of index)
    for (const id of ['ja', 'jako', 'zht', 'zhs', 'ar', 'he', 'el'])
      if (b.names[id] && /^[\x20-\x7E]+$/.test(b.names[id])) latin.push(`${id} ${b.slug}: ${b.names[id]}`)
  check('no Latin-script title in a non-Latin edition', latin.length === 0, latin.join(', '))

  const rev = index.find((b) => b.slug === 'revelation').names
  check('jako Revelation is ヨハネの黙示録', rev.jako === 'ヨハネの黙示録', rev.jako)
  check('and the other Japanese edition is unchanged', rev.ja === 'ヨハネの黙示録', rev.ja)
  const mat = index.find((b) => b.slug === 'matthew').names
  check('a book the export named correctly still matches the table',
    mat.jako === 'マタイによる福音書', mat.jako)
}

// ---------- furigana overrides ----------
// kuromoji reads 主 as おも, the ordinary word for a chief thing. In this text it is
// the Lord and it is しゅ, 8,345 times. data-src/furigana-overrides.json carries that
// and 48 other corrections, keyed on the reading so the ones kuromoji gets right are
// left where they are.
console.log('\nThe furigana overrides are in the source')
{
  const jako = readFileSync(resolve(root, 'data-src/jako.md'), 'utf8')
  const n = (re) => (jako.match(re) || []).length
  check('主 is しゅ', n(/\{\{主\|しゅ\}\}/g) > 8000, `${n(/\{\{主\|しゅ\}\}/g)} occurrence(s)`)
  check('and never おも or あるじ', n(/\{\{主\|(おも|あるじ)\}\}/g) === 0, `${n(/\{\{主\|(おも|あるじ)\}\}/g)} left`)
  // 救主 is すくいぬし, so ぬし is not an error and is deliberately not overridden.
  check('but ぬし survives, because 救主 needs it', n(/\{\{主\|ぬし\}\}/g) > 100, `${n(/\{\{主\|ぬし\}\}/g)}`)
  check('民 is たみ', n(/\{\{民\|みん\}\}/g) === 0 && n(/\{\{民\|たみ\}\}/g) > 2000)
  check('燔祭 is はんさい, not 燔 read as 燔', n(/\{\{燔\|燔\}\}/g) === 0 && n(/\{\{燔\|はん\}\}/g) > 250)
  check('the nine 道 read どう are みち', n(/\{\{道\|どう\}\}/g) === 0 && n(/\{\{道\|みち\}\}/g) > 700)
  // 一頭 is the livestock counter and とう is right, which is why review is a step and
  // the 文語訳's かしら was not applied wholesale.
  check('頭 keeps とう, which the audit only flagged by comparison', n(/\{\{頭\|とう\}\}/g) > 300,
    `${n(/\{\{頭\|とう\}\}/g)}`)
}

// ---------- the reader ----------
const browser = await chromium.launch()
const PREFS = {
  theme: 'light', size: 'md', furigana: true, align: true, justify: false, rate: 1,
  voice: 'male', swipe: false, flow: false, stopAtChapterEnd: false, ui: 'en',
  columns: ['jako', 'en'],
}

async function open(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), PREFS)
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  await page.locator('.col').first().waitFor({ state: 'visible' })
  return { ctx, page }
}

const columns = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.cols > .col')].map((c) => ({
      lang: c.getAttribute('lang'),
      absent: c.classList.contains('absent'),
      note: c.querySelector('.coverage')?.textContent.trim() || null,
      verses: c.querySelectorAll('.verse').length,
      play: !!c.querySelector('.colplay'),
    })),
  )

console.log('\nAn omitted chapter says so instead of showing an empty column')
{
  const { ctx, page } = await open('#/psalms/130/en')
  const [ja, en] = await columns(page)
  check('the 口語訳 column is marked absent', ja.absent, JSON.stringify(ja))
  check('and states that the source is missing it',
    ja.note === 'This chapter is missing from the source this edition was published from.', ja.note)
  check('it renders no verse rows', ja.verses === 0, `${ja.verses}`)
  check('and offers no chapter play', !ja.play)
  check('the KJV column is untouched', !en.absent && en.verses === 8, JSON.stringify(en))
  await ctx.close()
}

console.log('\nThe chapter either side of the hole is normal')
{
  const { ctx, page } = await open('#/psalms/129/en')
  const [ja] = await columns(page)
  check('Psalm 129 is present', !ja.absent && ja.verses === 8, JSON.stringify(ja))
  await ctx.close()
}
{
  const { ctx, page } = await open('#/psalms/140/en')
  const [ja] = await columns(page)
  // 13, the KJV's count. The Hebrew's fourteenth is not rendered because the Hebrew
  // column is not shown.
  check('Psalm 140 is present', !ja.absent && ja.verses === 13, JSON.stringify(ja))
  await ctx.close()
}

// Flow mode drops the chapter grid, so the hole used to be silent there: the 口語訳's
// Psalms ran 129, 140 with no seam at all. A run of omitted chapters is one marker.
console.log('\nFlow mode marks the run instead of skipping it')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(
    (p) => localStorage.setItem('prefs', JSON.stringify(p)),
    { ...PREFS, flow: true, columns: ['jako'] },
  )
  const page = await ctx.newPage()
  await page.goto(`${URL}#/psalms/1/jako`, { waitUntil: 'networkidle' })
  await page.locator('.fverse').first().waitFor({ state: 'visible' })
  const gaps = await page.locator('.fgap').allInnerTexts()
  check('Psalms has one marker, not ten', gaps.length === 1, JSON.stringify(gaps))
  check('and it names the whole run',
    gaps[0] === 'The source this edition was published from does not carry Psalms 130-139.', gaps[0])
  // The verse either side of the run is still there, so the marker replaced nothing.
  check('Psalm 129 is still rendered', (await page.locator('#fv-129-1').count()) === 1)
  check('Psalm 140 is still rendered', (await page.locator('#fv-140-1').count()) === 1)
  check('and 130 is not', (await page.locator('#fv-130-1').count()) === 0)

  // Two chapters at the very end of a book, so the run is flushed after the loop.
  await page.goto(`${URL}#/proverbs/1/jako`, { waitUntil: 'networkidle' })
  await page.locator('.fverse').first().waitFor({ state: 'visible' })
  const pr = await page.locator('.fgap').allInnerTexts()
  check('Proverbs closes on its own marker',
    pr.length === 1 && pr[0] === 'The source this edition was published from does not carry Proverbs 30-31.',
    JSON.stringify(pr))

  // Half a canon is a different fact and gets the coverage note, not a 1-50 run.
  await page.goto(`${URL}#/genesis/1/jako`, { waitUntil: 'networkidle' })
  await page.locator('.fverse').first().waitFor({ state: 'visible' })
  check('a book the edition does carry has no marker', (await page.locator('.fgap').count()) === 0)
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(
    (p) => localStorage.setItem('prefs', JSON.stringify(p)),
    { ...PREFS, flow: true, columns: ['el'] },
  )
  const page = await ctx.newPage()
  await page.goto(`${URL}#/genesis/1/el`, { waitUntil: 'networkidle' })
  await page.locator('.flow').waitFor({ state: 'visible' })
  const note = await page.locator('.flow .coverage').innerText()
  check('a New Testament edition at Genesis says so, once',
    note === 'This edition covers the New Testament only.', note)
  check('and does not accuse its source of dropping fifty chapters',
    (await page.locator('.fgap').count()) === 0)
  await ctx.close()
}

// ---------- a verse that is not there ----------
// Two facts wearing one placeholder until now. Psalm 3 has eight verses in the KJV and
// nine in the Hebrew, which counts the superscription as verse 1; 和合本 John 5 omits
// verse 4, which the KJV carries. The first is a numbering difference, the second is a
// hole, and a reader who cannot tell them apart reads both as a defect.
async function rows(hash, columns) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((p) => localStorage.setItem('prefs', JSON.stringify(p)), { ...PREFS, columns })
  const page = await ctx.newPage()
  await page.goto(URL + hash, { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  const out = await page.evaluate(() =>
    [...document.querySelectorAll('.cols > .col')].map((c) => ({
      lang: c.getAttribute('lang'),
      rows: [...c.querySelectorAll('.verses > li')].map((li) => ({
        n: li.querySelector('.vn').textContent,
        gap: li.querySelector('.vgap')?.className.replace('vgap ', '') || null,
        label: li.querySelector('.vgap')?.textContent || null,
      })),
    })),
  )
  await ctx.close()
  return out
}

console.log('\nA number no shown edition uses is not a row')
{
  const [en] = await rows('#/psalms/3/en', ['en'])
  check('Psalm 3 is eight rows with the KJV alone', en.rows.length === 8, `${en.rows.length}`)
  check('and none of them is a gap', en.rows.every((r) => !r.gap), JSON.stringify(en.rows.filter((r) => r.gap)))
}

console.log('\nShow the Hebrew and the ninth row comes back, tagged')
{
  const [he, en] = await rows('#/psalms/3/en', ['he', 'en'])
  check('nine rows now', en.rows.length === 9, `${en.rows.length}`)
  check('the Hebrew has text for all nine', he.rows.every((r) => !r.gap))
  check('the KJV has eight and one tag', en.rows.filter((r) => r.gap).length === 1)
  const gap = en.rows.find((r) => r.gap)
  check('on row 9', gap?.n === '9', gap?.n)
  check('and it says the numbering differs, not that a verse is missing',
    gap?.gap === 'versification' && gap?.label === 'numbered differently here', `${gap?.gap} / ${gap?.label}`)
}

console.log('\nA verse the KJV carries and an edition does not is the other tag')
{
  const [zh, en] = await rows('#/john/5/en', ['zht', 'en'])
  check('the KJV column is whole', en.rows.every((r) => !r.gap), JSON.stringify(en.rows.filter((r) => r.gap)))
  const gap = zh.rows.find((r) => r.gap)
  check('和合本 has exactly one gap', zh.rows.filter((r) => r.gap).length === 1)
  check('on John 5:4', gap?.n === '4', gap?.n)
  check('tagged absent', gap?.gap === 'absent' && gap?.label === 'not in this edition',
    `${gap?.gap} / ${gap?.label}`)
}

// Study on a row with nothing behind it used to open a sheet whose body was one dot.
console.log('\nThe study sheet repeats the tag rather than a bare dot')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(
    (p) => localStorage.setItem('prefs', JSON.stringify(p)),
    { ...PREFS, columns: ['zht', 'en'] },
  )
  const page = await ctx.newPage()
  await page.goto(`${URL}#/john/5/zht`, { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  const row = page.locator('.col[lang="zh-Hant"] .verses > li').nth(3)
  await row.click()
  await row.locator('.vbtn.study').click()
  await page.locator('.verse-sheet').waitFor({ state: 'visible' })
  const body = await page.evaluate(() => {
    const el = document.querySelector('.verse-sheet .ctext')
    return { text: el.textContent.trim(), gap: el.querySelector('.vgap')?.className || null }
  })
  check('the sheet body is the absent tag', body.gap === 'vgap absent', body.gap)
  check('and reads as the reader does', body.text === 'not in this edition', body.text)
  await ctx.close()
}

console.log('\nAnd the reader draws them')
{
  const { ctx, page } = await open('#/psalms/1/jako')
  const ruby = await page.evaluate(() => {
    const li = document.querySelector('.col[lang="ja"] .verses li:nth-child(2)')
    return [...li.querySelectorAll('ruby')].map((r) => `${r.firstChild.textContent}|${r.querySelector('rt').textContent}`)
  })
  check('Psalm 1:2 reads 主 as しゅ', ruby.includes('主|しゅ'), ruby.join(' '))
  await ctx.close()
}

// A phone: one column, and the heading is the book as the edition being read names
// it. On a wide screen the heading is in the UI language instead, which is a
// different string and not what this is about.
console.log('\nThe reader shows the title the edition uses')
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  await ctx.addInitScript(
    (p) => localStorage.setItem('prefs', JSON.stringify(p)),
    { ...PREFS, columns: ['jako'] },
  )
  const page = await ctx.newPage()
  await page.goto(`${URL}#/revelation/1/jako`, { waitUntil: 'networkidle' })
  await page.locator('.verse').first().waitFor({ state: 'visible' })
  const heading = await page.locator('h1.ref').textContent()
  check('the heading reads ヨハネの黙示録 1', heading.trim() === 'ヨハネの黙示録 1', heading.trim())
  await ctx.close()
}

// An edition that carries no Old Testament gets the half-canon sentence, not this one:
// two different facts, and conflating them would tell a reader the Greek NT's source
// dropped Genesis.
console.log('\nHalf-canon coverage still reads differently')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(
    (p) => localStorage.setItem('prefs', JSON.stringify(p)),
    { ...PREFS, columns: ['el', 'en'] },
  )
  const page = await ctx.newPage()
  await page.goto(`${URL}#/psalms/130/en`, { waitUntil: 'networkidle' })
  await page.locator('.col').first().waitFor({ state: 'visible' })
  const [el] = await columns(page)
  check('Greek is uncovered, not absent', !el.absent, JSON.stringify(el))
  check('and says it carries the New Testament only',
    el.note === 'This edition covers the New Testament only.', el.note)
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
