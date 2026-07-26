// Download the concordance data for the KJV and normalise it into two committed
// sources, so the build stays offline and reproducible like every other edition:
//
//   data-src/strongs.json   per verse, the KJV's Strong's-tagged words in order
//   data-src/lexicon.json   what each Strong's number means
//
// Two upstreams, because tagging and definitions are separate problems:
//
//   - eBible's KJV (eng-kjv2006) carries \w word|strong="G0026"\w* on 349,308
//     words — 227,196 Hebrew in the OT and 122,112 Greek in the NT, so the whole
//     canon is covered. Our own data-src/kjv.md is hand-curated and has no tags;
//     it is NOT replaced, because its supplied-word marking is richer (29,394
//     braces against eBible's 20,887 \add spans). Only the tags are borrowed.
//   - openscriptures/strongs supplies the dictionaries, public domain, as the
//     JS-wrapped JSON the project publishes.
//
// The reader shows this on the KJV alone, so no other edition needs tagging.
//
// Run: node scripts/fetch-strongs.mjs
import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { USFM_BOOKS, BOOK_ORDER } from './sources.mjs'
import { bookCodeFromFilename } from './usfm.mjs'
import { unzip } from './unzip.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')

const KJV_REF = 'eng-kjv2006'
const DICTS = [
  ['greek', 'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js'],
  ['hebrew', 'https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js'],
]

async function get(url, label) {
  process.stdout.write(`  ↓ ${label} … `)
  const res = await fetch(url, { headers: { 'user-agent': 'bible-reader/0.1 (+build script)' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`)
  return buf
}

/** `G0026` → `G26`: USFM zero-pads, the dictionaries don't. */
const unpad = (code) => code[0].toUpperCase() + String(parseInt(code.slice(1), 10))

// \w word|strong="G0026"\w*  and the nested \+w …\+w* form used inside \wj.
// Attributes are captured whole because some words carry x-morph etc. alongside.
const TAGGED = /\\\+?w\s+([^|\\]*?)\|([^\\]*?)\\\+?w\*/g
const STRONG = /strong="([GH]\d+)"/g

/**
 * Walk one USFM book keeping the *raw* markup, unlike parseUsfm which strips it.
 * @returns {Map<number, Map<number, Array<[string, string]>>>}
 */
function taggedWords(text) {
  const chapters = new Map()
  let ch = null
  let v = null

  const push = (line) => {
    if (ch == null || v == null) return
    for (const m of line.matchAll(TAGGED)) {
      const word = m[1].trim()
      if (!word) continue
      const codes = [...m[2].matchAll(STRONG)].map((s) => unpad(s[1]))
      // A single \w can carry several numbers; each is a separate lookup.
      for (const code of codes) chapters.get(ch).get(v).push([word, code])
    }
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cm = /^\\c\s+(\d+)/.exec(line)
    if (cm) {
      ch = parseInt(cm[1], 10)
      v = null
      if (!chapters.has(ch)) chapters.set(ch, new Map())
      continue
    }
    if (ch == null) continue
    if (!/\\v\s/.test(line)) {
      push(line) // continuation of the verse in progress
      continue
    }
    // "\v 1 text \v 2 text" — a line can hold several verses.
    const parts = line.split(/\\v\s+/)
    if (parts[0].trim()) push(parts[0])
    for (const part of parts.slice(1)) {
      const vm = /^(\d+)(?:[-–](\d+))?\s*(.*)$/s.exec(part)
      if (!vm) continue
      v = parseInt(vm[1], 10)
      if (!chapters.get(ch).has(v)) chapters.get(ch).set(v, [])
      push(vm[3] || '')
    }
  }
  return chapters
}

/** The dictionaries ship as `var strongsDictionary = {...};` — take the object. */
function parseDict(js) {
  const start = js.indexOf('{')
  const end = js.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('dictionary layout changed — no JSON object found')
  return JSON.parse(js.slice(start, end + 1))
}

if (!existsSync(SRC)) mkdirSync(SRC, { recursive: true })
console.log('Fetching concordance data into data-src/\n')

// ---- tags, from the eBible KJV ----
const zip = await get(`https://ebible.org/Scriptures/${KJV_REF}_usfm.zip`, `KJV tags (eBible ${KJV_REF})`)
const tags = {}
let tagCount = 0
let verseCount = 0
for (const [path, contents] of unzip(zip)) {
  const file = path.split('/').pop()
  if (!file.toLowerCase().endsWith('.usfm')) continue
  const code = bookCodeFromFilename(file, KJV_REF)
  const en = code && USFM_BOOKS[code]
  if (!en) continue // intro files, apocrypha, front/back matter
  const chapters = taggedWords(contents.toString('utf8'))
  const book = {}
  for (const [ch, verses] of chapters) {
    const out = {}
    for (const [v, words] of verses) {
      if (!words.length) continue // untagged verse: omit rather than store an empty
      out[v] = words
      tagCount += words.length
      verseCount++
    }
    if (Object.keys(out).length) book[ch] = out
  }
  if (Object.keys(book).length) tags[en] = book
}
const missing = BOOK_ORDER.filter((b) => !tags[b])
if (missing.length > 3) throw new Error(`only ${66 - missing.length}/66 books tagged — source layout may have changed`)

// ---- definitions, from openscriptures ----
const lexicon = {}
for (const [name, url] of DICTS) {
  const dict = parseDict((await get(url, `${name} dictionary`)).toString('utf8'))
  for (const [key, e] of Object.entries(dict)) {
    // Short keys and only the fields the sheet shows: `derivation` is etymology
    // aimed at scholars and roughly a third of the payload, so it is dropped.
    const entry = {}
    if (e.lemma) entry.l = e.lemma
    // The two dictionaries disagree on this field name: Greek calls it `translit`,
    // Hebrew `xlit`. Reading only one silently drops 8,674 transliterations.
    const xlit = e.translit || e.xlit
    if (xlit) entry.x = xlit
    if (e.strongs_def) entry.d = String(e.strongs_def).trim()
    if (e.kjv_def) entry.k = String(e.kjv_def).trim()
    if (entry.l || entry.d) lexicon[unpad(key)] = entry
  }
}

// Every code the KJV actually uses must resolve, or the sheet shows a bare number.
const unresolved = new Set()
for (const book of Object.values(tags))
  for (const chapter of Object.values(book))
    for (const words of Object.values(chapter)) for (const [, code] of words) if (!lexicon[code]) unresolved.add(code)

writeFileSync(resolve(SRC, 'strongs.json'), JSON.stringify(tags))
writeFileSync(resolve(SRC, 'lexicon.json'), JSON.stringify(lexicon))

const mb = (p) => `${(statSync(resolve(SRC, p)).size / 1e6).toFixed(1)} MB`
console.log(`\n  ✓ ${Object.keys(tags).length} books, ${verseCount} verses, ${tagCount} tagged words → data-src/strongs.json (${mb('strongs.json')})`)
console.log(`  ✓ ${Object.keys(lexicon).length} dictionary entries → data-src/lexicon.json (${mb('lexicon.json')})`)
if (unresolved.size)
  console.warn(`  ! ${unresolved.size} code(s) used by the text have no dictionary entry, e.g. ${[...unresolved].slice(0, 5).join(', ')}`)
