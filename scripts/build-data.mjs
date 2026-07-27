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
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`

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

// ---- concordance: KJV Strong's tags per book, in two levels ----
//
// The card shows a word, its lemma and its transliteration; the full Strong's
// definition only appears when a reader taps that word. Splitting along the same
// line is what makes the card open instantly:
//
//   <slug>.json      tags + lemma/translit for the codes this book uses
//   <slug>-def.json  definitions for those codes
//
// A shared 2.1 MB dictionary used to be fetched before the card could render
// anything, which is 610 KB over the wire for a panel showing twelve words. Inlining
// just the two short fields each book actually needs brings that to a median 18 KB in
// one request, and the definitions follow only if asked for.
//
// Duplicating lemmas across books costs more on disk in total, which is the right
// trade: nothing here is precached, and no reader ever downloads all 66.
//
// `-def` rather than `.def` in the name so the filename still matches the service
// worker's runtime-cache pattern (`[a-z0-9-]+\.json`) and stays available offline.
//
// The directory is `concordance/`, not the `strongs/` these files first shipped under.
// That rename is load-bearing: the runtime cache is CacheFirst, so changing what lives
// at a URL strands every reader who already fetched it on the old shape forever. A new
// shape gets a new path. `SHAPE` is checked on read for the same reason, so the next
// change fails loudly instead of rendering an empty panel.
const strongsSrc = resolve(SRC, 'strongs.json')
const lexiconSrc = resolve(SRC, 'lexicon.json')
if (existsSync(strongsSrc) && existsSync(lexiconSrc)) {
  const dir = resolve(OUT, 'concordance')
  mkdirSync(dir, { recursive: true })
  const tags = JSON.parse(readFileSync(strongsSrc, 'utf8'))
  const lex = JSON.parse(readFileSync(lexiconSrc, 'utf8'))
  let books = 0
  let cardBytes = 0
  let defBytes = 0
  for (const en of BOOK_ORDER) {
    const chapters = tags[en]
    if (!chapters) continue
    const codes = new Set()
    for (const verses of Object.values(chapters))
      for (const words of Object.values(verses)) for (const [, code] of words) codes.add(code)

    const words = {}
    const defs = {}
    for (const code of codes) {
      const e = lex[code]
      if (!e) continue
      words[code] = [e.l || '', e.x || '']
      defs[code] = [e.d || '', e.k || '']
    }

    const slug = slugOf(en)
    const cardPath = resolve(dir, `${slug}.json`)
    const defPath = resolve(dir, `${slug}-def.json`)
    writeFileSync(cardPath, JSON.stringify({ v: 2, t: chapters, w: words }))
    writeFileSync(defPath, JSON.stringify(defs))
    books++
    cardBytes += statSync(cardPath).size
    defBytes += statSync(defPath).size
  }
  console.log(
    `Concordance: ${books} books · cards ${mb(cardBytes)} + definitions ${mb(defBytes)} — fetched on demand\n`,
  )
} else {
  console.warn('  ! concordance skipped — run `npm run strongs`\n')
}

// ---- glossary: archaic and shifted KJV words, per book ----
//
// Two sources, merged, because they answer different problems:
//
//   data-src/glossary-en.json      hand-written false friends: words still in ordinary
//                                  use whose KJV sense has shifted (charity, prevent,
//                                  suffer). No filter can find these and no dictionary
//                                  can choose their sense, so a human wrote them.
//   data-src/webster-archaic.json  derived from Webster's 1913, for words a reader knows
//                                  they do not know (astonied, purtenance, meteyard).
//
// The curated file wins on conflict. An entry may carry `refs`, a whitelist of verses,
// for words whose archaic sense is the exception: `let` means hinder in three verses and
// allow in hundreds, so glossing every occurrence would train readers to ignore it.
//
// Matching is exact on a lower-cased word. No stemming: guessing that `charities` is
// `charity` risks glossing a word the entry was not written about.
const curatedSrc = resolve(SRC, 'glossary-en.json')
const archaicSrc = resolve(SRC, 'webster-archaic.json')
if (existsSync(curatedSrc)) {
  const curated = JSON.parse(readFileSync(curatedSrc, 'utf8'))
  const archaic = existsSync(archaicSrc) ? JSON.parse(readFileSync(archaicSrc, 'utf8')) : {}
  const entries = {}
  for (const [w, e] of Object.entries(archaic)) entries[w] = { d: e.d, k: 'arch' }
  let curatedCount = 0
  for (const [w, e] of Object.entries(curated)) {
    if (w.startsWith('_')) continue // the file's own readme block
    entries[w] = { m: e.m, d: e.d, k: 'false', refs: e.refs }
    curatedCount++
  }

  // Grammar: pronoun / verb form-classes (kjv-grammar.json). Each class fires once per
  // verse in which any of its forms appears, so a verse shows a single grammar row.
  const gramSrc = resolve(SRC, 'kjv-grammar.json')
  const gramClasses = existsSync(gramSrc) ? JSON.parse(readFileSync(gramSrc, 'utf8')).classes || [] : []
  const gramByKey = new Map(gramClasses.map((c) => [c.key, c]))
  const gramForm = new Map()
  for (const c of gramClasses) for (const f of c.forms) gramForm.set(f.toLowerCase(), c)

  // Names: proper-name meanings from Hitchcock (fetch-names.mjs), corrected or dropped by
  // names-overrides.json. A capitalized token is glossed as a name only when its
  // lower-cased form NEVER appears as an ordinary word in the KJV, so God, Lord, Rock and
  // every sentence-initial common word are excluded. Meanings are labelled traditional.
  const nameMeaning = new Map()
  const namesSrc = resolve(SRC, 'hitchcock-names.json')
  if (existsSync(namesSrc)) {
    const rawNames = JSON.parse(readFileSync(namesSrc, 'utf8'))
    const overSrc = resolve(SRC, 'names-overrides.json')
    const over = existsSync(overSrc) ? JSON.parse(readFileSync(overSrc, 'utf8')) : {}
    const suppress = new Set((over.suppress || []).map((s) => s.toLowerCase()))
    const correct = over.correct || {}
    for (const [name, meaning] of Object.entries(rawNames)) {
      const lower = name.toLowerCase()
      if (suppress.has(lower)) continue
      nameMeaning.set(lower, correct[name] || meaning)
    }
    const kjvEd = editions.find((e) => e.id === 'en')
    const everLower = new Set()
    if (kjvEd)
      for (const [, b] of kjvEd.books)
        for (const [, verses] of b.chapters)
          for (const [, r] of verses)
            for (const m of cleanKjv(r).matchAll(/[A-Za-z]+/g))
              if (/^[a-z]/.test(m[0])) everLower.add(m[0].toLowerCase())
    for (const lower of [...nameMeaning.keys()]) if (everLower.has(lower)) nameMeaning.delete(lower)
  }

  // New letters-only path + v:2 shape: adding grammar/name kinds changes the payload's
  // meaning, and a fresh directory forces the CacheFirst service worker to refetch (a
  // digit like glossary2 would break the /data/[a-z]+/ runtime-cache pattern).
  const dir = resolve(OUT, 'glosses')
  mkdirSync(dir, { recursive: true })
  const kjv = editions.find((e) => e.id === 'en')
  let books = 0
  let bytes = 0
  let hits = 0
  for (const en of BOOK_ORDER) {
    const book = kjv?.books.get(en)
    if (!book) continue
    const slug = slugOf(en)
    const tags = {}
    const used = new Set()
    const usedGram = new Set()
    const usedName = new Set()
    for (const [ch, verses] of book.chapters) {
      const out = {}
      for (const [v, raw] of verses) {
        const ref = `${slug}.${ch}.${v}`
        const found = []
        const seenGram = new Set()
        const seenName = new Set()
        for (const m of cleanKjv(raw).matchAll(/[A-Za-z]+/g)) {
          const key = m[0].toLowerCase()
          const e = entries[key]
          if (e && (!e.refs || e.refs.includes(ref))) {
            found.push([m[0], key])
            used.add(key)
          }
          // A grammar class fires once per verse: sayeth + doeth + hath in one verse
          // yields a single "hath / doth / saith" row, not three.
          const gc = gramForm.get(key)
          if (gc && !seenGram.has(gc.key)) {
            found.push([gc.label, gc.key])
            usedGram.add(gc.key)
            seenGram.add(gc.key)
          }
          // A capitalized token that is a Hitchcock name and not a common KJV word.
          if (/^[A-Z]/.test(m[0]) && !entries[key] && nameMeaning.has(key) && !seenName.has(key)) {
            found.push([m[0], 'nm:' + key])
            usedName.add(key)
            seenName.add(key)
          }
        }
        if (found.length) out[v] = found
      }
      if (Object.keys(out).length) tags[ch] = out
    }
    if (!Object.keys(tags).length) continue
    // Self-contained per book, like the concordance cards: one fetch, no shared file.
    const e = {}
    for (const key of used) {
      const { m, d, k } = entries[key]
      e[key] = m ? { m, d, k } : { d, k }
    }
    for (const gk of usedGram) {
      const c = gramByKey.get(gk)
      e[gk] = c.m ? { m: c.m, d: c.d, k: 'grammar' } : { d: c.d, k: 'grammar' }
    }
    for (const nlower of usedName) {
      e['nm:' + nlower] = { d: `${nameMeaning.get(nlower)} (traditional, Hitchcock 1869)`, k: 'name' }
    }
    const path = resolve(dir, `${slug}.json`)
    writeFileSync(path, JSON.stringify({ v: 2, t: tags, e }))
    books++
    bytes += statSync(path).size
    for (const chs of Object.values(tags)) for (const ws of Object.values(chs)) hits += ws.length
  }
  console.log(
    `Glossary: ${curatedCount} curated + ${Object.keys(archaic).length} derived + ${gramClasses.length} grammar classes + ${nameMeaning.size} names, ${hits} occurrences over ${books} books ${mb(bytes)}\n`,
  )
} else {
  console.warn('  ! glossary skipped — data-src/glossary-en.json missing\n')
}

// ---- summary ----
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
