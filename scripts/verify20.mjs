// Adding an edition from a file, and the canon model that makes room for it.
//
// Run:  npx vite preview --port 4186 --strictPort
//       node scripts/verify20.mjs
//
// Two things are under test and they are the same thing from two ends. The importer
// reads an OSIS file the reader chose, into IndexedDB, and registers it as an edition;
// the canon model is what gives the books in that file somewhere to be. A deuterocanon
// is the case that proves both: no shipped edition here has one, so Tobit exists in
// `canon.json` and nowhere else until an import supplies the text.
//
// The fixture is written by this script rather than committed. It is deliberately in
// the *milestone* verse form — `<verse sID=.../>text<verse eID=.../>` — which is what
// the SWORD exporter emits and the harder of the two forms to read, and it carries
// notes and section headings to be stripped, plus one book id the app has no place
// for, so "what the file contains" is something the suite can check rather than
// take on trust.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(__dirname, '../node_modules/.cache')
const FIXTURE = resolve(CACHE, 'osis-fixture.xml')
mkdirSync(CACHE, { recursive: true })

const book = (osis, chapters) => [
  `  <div type="book" osisID="${osis}">`,
  ...chapters.flatMap(([ch, verses]) => [
    `   <chapter osisID="${osis}.${ch}">`,
    `    <title type="section">Caput ${ch}</title>`,
    ...verses.flatMap(([v, text]) => [
      `    <verse sID="${osis}.${ch}.${v}" osisID="${osis}.${ch}.${v}"/>`,
      `    <p>${text}<note type="study">nota marginalis</note></p>`,
      `    <verse eID="${osis}.${ch}.${v}"/>`,
    ]),
    '   </chapter>',
  ]),
  '  </div>',
].join('\n')

writeFileSync(FIXTURE, [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace">',
  ' <osisText osisIDWork="TestVul" xml:lang="la">',
  '  <header><work osisWork="TestVul">',
  '   <title>Vulgata Test Edition</title>',
  '   <language type="IANA">la</language>',
  '   <rights>Public domain. Test fixture, not a real edition.</rights>',
  '  </work></header>',
  book('Tob', [
    [1, [[1, 'Tobias ex tribu et civitate Nephthali.'], [2, 'Qui cum captus esset in diebus Salmanasar regis Assyriorum.'], [3, 'Tertius versus Tobiae.']]],
    [2, [[1, 'Post haec vero cum esset dies festus Domini.'], [2, 'Et factum est convivium bonum in domo Tobiae.']]],
  ]),
  book('Jdt', [[1, [[1, 'Arphaxad itaque rex Medorum subiugaverat multas gentes.'], [2, 'Et aedificavit civitatem potentissimam.']]]]),
  book('Ps151', [[1, [[1, 'Pusillus eram inter fratres meos.']]]]),
  book('John', [[3, [[16, 'Sic enim dilexit Deus mundum ut Filium suum unigenitum daret.'], [17, 'Non enim misit Deus Filium suum in mundum ut iudicet mundum.']]]]),
  book('NotARealBook', [[1, [[1, 'ignored']]]]),
  ' </osisText>',
  '</osis>',
].join('\n'))

const URL = 'http://127.0.0.1:4186/'
const b = await chromium.launch()
let fails = 0
const check = (n, ok, d = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? `  - ${d}` : ''}`); if (!ok) fails++ }

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => { console.log('  ! page error:', e.message); fails++ })
await page.goto(URL + '#/john/3/en', { waitUntil: 'networkidle' })
await page.waitForSelector('.verse')

console.log('\nAdding a version from an OSIS file')
await page.locator('.icon[title="Settings"]').click()
await page.locator('.sheet').waitFor({ state: 'visible' })
await page.locator('.addversion').scrollIntoViewIfNeeded()
check('the editions list offers to add one', await page.locator('.addversion').count() === 1)
await page.locator('.addversion').click()
await page.locator('.sheet.import').waitFor({ state: 'visible' })
check('the import sheet opens', await page.locator('.sheet.import').count() === 1)

await page.locator('.sheet.import input[type=file]').setInputFiles(FIXTURE)
await page.locator('.importstat').waitFor({ state: 'visible', timeout: 15000 })
const stat = await page.locator('.importstat').innerText()
// Tobit 1-2 (3+2), Judith 1 (2), Psalm 151 (1), John 3 (2) = 5 chapters, 10 verses.
// The eleventh verse is in the book it cannot place, and is not counted.
check('it reports what the file holds before saving',
  /4 books/.test(stat) && /5 chapters/.test(stat) && /10 verses/.test(stat), stat)
const books = await page.locator('.importbooks').innerText()
check('and names them', /Tobit/.test(books) && /Judith/.test(books) && /Psalm 151/.test(books) && /John/.test(books), books)
const skipped = await page.locator('.importerr').innerText()
check('and says what it could not place', /NotARealBook/.test(skipped), skipped)

const label = await page.locator('.sheet.import .ptext').first().inputValue()
check('the name is seeded from the file header', label === 'Vulgata Test Edition', label)
const attrib = await page.locator('.importnote').inputValue()
check('and the attribution from its rights statement', /Public domain/.test(attrib), attrib)

check('save is enabled once both are there', !(await page.locator('.sheet.import .primary').isDisabled()))
await page.locator('.sheet.import .primary').click()
await page.waitForTimeout(1500)
check('the sheet closes', await page.locator('.sheet.import').count() === 0)
const toast = await page.locator('.toast').innerText().catch(() => '')
check('and it says so', /Vulgata Test Edition/.test(toast), toast)

console.log('\nThe edition is real: stored, registered, and readable')
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('editions.v1') || '[]'))
check('metadata is on the device', stored.length === 1, JSON.stringify(stored[0]?.id))
check('with a reserved id', stored[0]?.id?.startsWith('x-'), stored[0]?.id)
check('and its book list', stored[0]?.books?.length === 4, JSON.stringify(stored[0]?.books))
const cols = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs') || '{}').columns)
check('it was switched on', cols.includes(stored[0].id), JSON.stringify(cols))

// It is showing right now, on John 3, beside the KJV.
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const tabs = await page.locator('.ringtab').allInnerTexts()
check('it appears in the language ring', tabs.some((x) => /Vulgata/.test(x)), tabs.join(' | '))
await page.locator('.ringtab', { hasText: 'Vulgata' }).click()
await page.waitForTimeout(900)
const text = await page.locator('.verse').first().innerText()
check('and reading it shows the imported text', /Sic enim dilexit Deus/.test(text), text.slice(0, 60))
check('with the notes stripped out', !/nota marginalis/.test(text))
check('and the section titles too', !/Caput/.test(text))

console.log('\nThe deuterocanon it brought has a place in the canon')
await page.locator('.navbtn').click()
await page.waitForTimeout(500)
await page.locator('.bookfilter').fill('Tobit')
await page.waitForTimeout(400)
check('Tobit is in the book picker', await page.locator('.bkbtn', { hasText: 'Tobit' }).count() === 1)
// The picker opens on the current book's chapters, so the grouped list is behind
// "All books" — clear the filter and go back to it.
await page.locator('.bookfilter').fill('')
await page.waitForTimeout(400)
await page.locator('.mini.back').click()
await page.waitForTimeout(400)
// Rendered text, so uppercased by `.bgtitle`'s text-transform.
const heads = (await page.locator('.bgtitle').allInnerTexts()).map((x) => x.trim().toLowerCase())
check('under a Deuterocanon heading of its own', heads.includes('deuterocanon'), heads.join(' | '))
check('between the two Testaments', heads.indexOf('deuterocanon') === 1, heads.join(' | '))
await page.locator('.bkbtn', { hasText: 'Tobit' }).click()
await page.waitForTimeout(300)
await page.locator('.chbtn').first().click()
await page.waitForTimeout(1200)
const tob = await page.locator('.verse').first().innerText()
check('and Tobit 1 reads', /Tobias ex tribu/.test(tob), tob.slice(0, 50))
check('the header names it', /Tobit/.test(await page.locator('.navbtn').innerText()))

console.log('\nSearch reaches it')
await page.locator('.icon[title="Search"]').click()
await page.waitForTimeout(400)
const chips = await page.locator('.scopechips .chip').allInnerTexts()
check('a deuterocanon scope chip appears', chips.includes('Deuterocanon'), chips.join(' | '))
// Arphaxad is in Genesis too, and results come back in canon order, so the
// deuterocanonical hit is proved by scoping to it rather than by taking the first.
await page.locator('.scopechips .chip', { hasText: 'Deuterocanon' }).click()
await page.locator('.searchin').fill('Arphaxad')
await page.waitForTimeout(4000)
const hits = await page.locator('.dlist .dref').allInnerTexts()
check('and scoped to the deuterocanon it finds Judith', hits.length > 0 && hits.every((h) => /Judith/.test(h)),
  hits.join(' | ').slice(0, 90))

console.log('\nRemoving it')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.goto(URL + '#/john/3/en', { waitUntil: 'networkidle' })
await page.waitForSelector('.verse')
await page.locator('.icon[title="Settings"]').click()
await page.waitForTimeout(600)
await page.locator('.colrow', { hasText: 'Vulgata Test Edition' }).locator('.mini').last().click() // Hide
await page.waitForTimeout(400)
await page.locator('.colrow.off', { hasText: 'Vulgata Test Edition' }).locator('.mini').first().click() // Delete
await page.waitForTimeout(500)
check('removal asks first', await page.locator('.sheet.confirm').count() === 1)
await page.locator('.sheet.confirm .danger').click()
await page.waitForTimeout(1200)
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('editions.v1') || '[]'))
check('the edition is gone', after.length === 0)
const colsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('prefs') || '{}').columns)
check('and out of the columns', !colsAfter.some((c) => c.startsWith('x-')), JSON.stringify(colsAfter))
await page.waitForTimeout(400)
check('the app is still on its feet', await page.locator('.verse').count() > 0)

await b.close()
console.log(fails ? `\n${fails} check(s) failed.` : '\nAll checks passed')
process.exit(fails ? 1 : 0)
