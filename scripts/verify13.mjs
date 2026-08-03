// A chapter an edition does not have: that the pipeline sees it, and that the reader
// says so.
//
// check-data's first four passes iterate each edition's own chapter map, so a chapter
// that is not in the file is never visited and never reported. That is how 18 empty
// 口語訳 chapters shipped. Pass E iterates the KJV spine instead. These assertions
// fail if that pass is removed or narrowed.
//
// Run:  npx vite preview --port 4182 --strictPort
//       node scripts/verify13.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
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
  // 14 rows, not the KJV's 13: the Hebrew counts the superscription, and a row is
  // rendered for every number any shown edition uses.
  check('Psalm 140 is present', !ja.absent && ja.verses === 14, JSON.stringify(ja))
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
