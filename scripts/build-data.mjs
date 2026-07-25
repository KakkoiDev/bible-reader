// Build the reader's JSON from the verse-numbered Markdown in ../data-src.
//
// Output:
//   ../public/data/index.json        book list: slug, per-chapter verse counts, localized names
//   ../public/data/<id>/<slug>.json  one edition of one book
//   ../public/data/paragraphs.json   flow-mode paragraph breaks (copied through)
//
// One file per edition per book is what lets the app download only the editions a
// reader has switched on — with 11 editions, a combined file would make opening any
// book pull eight translations nobody asked for.
//
// Run: node scripts/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES, BOOK_ORDER, NATIVE_NAMES } from './sources.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')
const OUT = resolve(__dirname, '../public/data')
const DEFAULT_ON = new Set(['en', 'ja', 'fr'])

/** Parse one edition's Markdown into Map<englishName, { native, chapters }>. */
function parseMd(file) {
  const books = new Map()
  let cur = null
  let ch = null
  for (const raw of readFileSync(resolve(SRC, file), 'utf8').split('\n')) {
    if (raw.startsWith('## ') && !raw.startsWith('###')) {
      const heading = raw.slice(3).trim()
      // "詩篇 (Psalms)" → native + English;  "Genesis" → English only
      const m = heading.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      const en = (m ? m[2] : heading).trim()
      const native = m ? m[1].trim() : ''
      if (!books.has(en)) books.set(en, { native, chapters: new Map() })
      else if (native) books.get(en).native = native
      cur = books.get(en)
      ch = null
      continue
    }
    if (raw.startsWith('### ')) {
      const nums = raw.match(/\d+/g)
      ch = nums ? parseInt(nums[nums.length - 1], 10) : null
      if (cur && ch != null && !cur.chapters.has(ch)) cur.chapters.set(ch, new Map())
      continue
    }
    const vm = raw.match(/^\*\*(\d+)\*\*\s+(.*?)\s*$/)
    if (vm && cur && ch != null) cur.chapters.get(ch).set(parseInt(vm[1], 10), vm[2])
  }
  return books
}

// KJV cleanup for the reader: drop translator marginal notes — any {…} group
// containing a colon or "…" (e.g. "{firmament: Heb. expansion}") — while keeping
// genuine supplied-word italics ("{is}", "{was}"). Debracket psalm superscriptions.
const cleanKjv = (t) =>
  t
    .replace(/\s*\{[^}]*(?::|\.\.\.)[^}]*\}/g, '')
    .replace(/[[\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

const slugOf = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---- load every edition ----
const editions = []
for (const src of SOURCES) {
  const file = src.file || `${src.id}.md`
  if (!existsSync(resolve(SRC, file))) {
    console.warn(`  ! ${src.id}: data-src/${file} missing — run \`npm run fetch -- ${src.id}\`. Skipped.`)
    continue
  }
  editions.push({ ...src, file, books: parseMd(file) })
}
if (!editions.some((e) => e.id === 'en')) throw new Error('the English edition is required as the alignment spine')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
for (const e of editions) mkdirSync(resolve(OUT, e.id), { recursive: true })

// ---- emit one file per edition per book, plus the shared index ----
const index = []
const stats = new Map(editions.map((e) => [e.id, { books: 0, verses: 0, bytes: 0 }]))

for (const en of BOOK_ORDER) {
  const slug = slugOf(en)
  const present = editions.filter((e) => e.books.has(en) && e.books.get(en).chapters.size)
  if (!present.length) {
    console.warn(`  ! ${en}: no edition has this book. Skipped.`)
    continue
  }

  // Canonical chapter count and per-chapter verse ceiling: the union across every
  // edition, so a row exists wherever *any* edition has text. Editions missing a
  // row render the placeholder — which is how Greek (NT) and Hebrew (OT) show their
  // half-coverage, and how a verse split differently stays reachable.
  const chapterNums = new Set()
  for (const e of present) for (const c of e.books.get(en).chapters.keys()) chapterNums.add(c)
  const lastChapter = Math.max(...chapterNums)
  const verseCounts = []
  for (let c = 1; c <= lastChapter; c++) {
    let max = 0
    for (const e of present) {
      const vs = e.books.get(en).chapters.get(c)
      if (vs) for (const v of vs.keys()) if (v > max) max = v
    }
    verseCounts.push(max)
  }

  const names = {}
  for (const e of editions) {
    const name = e.books.get(en)?.native || NATIVE_NAMES[e.id]?.[en]
    if (name) names[e.id] = name
  }
  names.en = en

  for (const e of present) {
    const book = e.books.get(en)
    const chapters = []
    for (let c = 1; c <= lastChapter; c++) {
      const vs = book.chapters.get(c)
      if (!vs) continue
      const verses = []
      for (const v of [...vs.keys()].sort((a, z) => a - z)) {
        const t = e.clean === 'kjv' ? cleanKjv(vs.get(v)) : vs.get(v)
        if (t) verses.push({ v, t })
      }
      if (verses.length) chapters.push({ n: c, verses })
    }
    if (!chapters.length) continue
    const path = resolve(OUT, e.id, `${slug}.json`)
    writeFileSync(path, JSON.stringify({ chapters }))
    const s = stats.get(e.id)
    s.books++
    s.verses += chapters.reduce((a, c) => a + c.verses.length, 0)
    s.bytes += statSync(path).size
  }

  index.push({ slug, chapters: verseCounts, names })
}

writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(index))

// Paragraph boundaries for flow/reading mode (derived from WEB USFM, by reference).
if (existsSync(resolve(SRC, 'paragraphs.json'))) copyFileSync(resolve(SRC, 'paragraphs.json'), resolve(OUT, 'paragraphs.json'))

// ---- summary ----
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`
const idxKb = (statSync(resolve(OUT, 'index.json')).size / 1024).toFixed(0)
console.log(`\nBooks: ${index.length}   Editions: ${editions.length}   index.json: ${idxKb} KB\n`)
console.log('  id     books  verses     size   default')
for (const e of editions) {
  const s = stats.get(e.id)
  console.log(
    `  ${e.id.padEnd(6)}${String(s.books).padStart(5)} ${String(s.verses).padStart(7)} ${mb(s.bytes).padStart(9)}   ${DEFAULT_ON.has(e.id) ? 'on' : 'off'}`,
  )
}
const total = [...stats.values()].reduce((a, s) => a + s.bytes, 0)
const shipped = editions.filter((e) => DEFAULT_ON.has(e.id)).reduce((a, e) => a + stats.get(e.id).bytes, 0)
console.log(`\n  ${mb(total)} total · ${mb(shipped)} precached (default editions) · rest fetched on demand`)
