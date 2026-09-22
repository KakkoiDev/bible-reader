// Download every remote edition and normalise it into the same verse-numbered
// Markdown that data-src has always used, so `build-data.mjs` has one input format:
//
//   ## <Native book name> (<English book name>)
//   ### Chapter 1
//   **1** In the beginning…
//
// Run: npm run fetch                       (all remote editions)
//      npm run fetch -- ar el              (just these ids)
//      npm run fetch -- la --from-dir=DIR  (read DIR instead of the network)
//
// `--from-dir` exists because the upstreams are not reachable from every machine
// this is built on: a sandbox or a locked-down CI answers 403 for ebible.org and
// api.getbible.net, and the fetch is then a dead end with no way to hand it the file
// by other means. Put `<ref>_usfm.zip` (eBible) or `<ref>.json` (getbible) in the
// directory — the same names the URLs end in — and each is used in place of its
// download. Anything not found there still goes to the network, so a directory
// holding one edition is enough to update just that one.
//
// Local editions (kjv/bungo/kjf) are hand-curated and never overwritten.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES, USFM_BOOKS, BOOK_ORDER, bookByNumber, sectionOf } from './sources.mjs'
import { parseUsfm, bookCodeFromFilename } from './usfm.mjs'
import { unzip } from './unzip.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('-'))
const fromDirArg = args.find((a) => a.startsWith('--from-dir='))?.slice('--from-dir='.length)
const FROM_DIR = fromDirArg ? (isAbsolute(fromDirArg) ? fromDirArg : resolve(process.cwd(), fromDirArg)) : null
if (FROM_DIR && !existsSync(FROM_DIR)) {
  console.error(`--from-dir: no such directory: ${FROM_DIR}`)
  process.exit(1)
}
const targets = SOURCES.filter((s) => s.kind !== 'local' && (!only.length || only.includes(s.id)))
if (!targets.length) {
  console.error(only.length ? `No remote edition matches: ${only.join(', ')}` : 'Nothing to fetch.')
  process.exit(1)
}

/** The bytes for one edition: from `--from-dir` if it holds them, else the network.
 *  `file` is the basename the URL ends in, so a directory of downloads needs no
 *  renaming — save the link and point at the folder. */
async function get(url, label, file) {
  const local = FROM_DIR && resolve(FROM_DIR, file)
  if (local && existsSync(local)) {
    const buf = readFileSync(local)
    console.log(`  ⇢ ${label} … ${(buf.length / 1e6).toFixed(1)} MB from ${file}`)
    return buf
  }
  process.stdout.write(`  ↓ ${label} … `)
  const res = await fetch(url, { headers: { 'user-agent': 'bible-reader/0.1 (+build script)' } })
  if (!res.ok) {
    // 403 from a proxy is the common case and says nothing useful on its own.
    const hint = FROM_DIR ? '' : ` — unreachable from here? put ${file} in a directory and pass --from-dir=DIR`
    throw new Error(`${url} → HTTP ${res.status}${hint}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`)
  return buf
}

/** eBible USFM zip → { books: Map<englishName, {name, chapters}>, about } */
async function fromEbible(src) {
  const buf = await get(`https://ebible.org/Scriptures/${src.ref}_usfm.zip`, `${src.id} (eBible ${src.ref})`, `${src.ref}_usfm.zip`)
  const files = unzip(buf)
  const books = new Map()
  for (const [path, contents] of files) {
    const file = path.split('/').pop()
    if (!file.toLowerCase().endsWith('.usfm')) continue
    const code = bookCodeFromFilename(file, src.ref)
    const en = code && USFM_BOOKS[code]
    if (!en) continue // intro files, apocrypha, front/back matter
    const parsed = parseUsfm(contents.toString('utf8'))
    const ceiling = src.chapterCeilings?.[en]
    if (ceiling) for (const chapter of parsed.chapters.keys()) if (chapter > ceiling) parsed.chapters.delete(chapter)
    if (parsed.chapters.size) books.set(en, parsed)
  }
  return books
}

/** Decode the HTML entities getbible leaves in verse text (japkougo uses &#x2015; for
 *  its dash breaks), so they are stored as real characters, not literal "&#x2015;". */
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

/** getbible.net whole-Bible JSON → the same shape. */
async function fromGetbible(src) {
  const buf = await get(`https://api.getbible.net/v2/${src.ref}.json`, `${src.id} (getbible ${src.ref})`, `${src.ref}.json`)
  const data = JSON.parse(buf.toString('utf8'))
  const books = new Map()
  for (const b of data.books || []) {
    const en = bookByNumber(b.nr)
    if (!en) continue
    const chapters = new Map()
    for (const c of b.chapters || []) {
      const n = Number(c.chapter)
      const verses = new Map()
      for (const vv of c.verses || []) {
        const t = decodeEntities(String(vv.text || '')).replace(/\s+/g, ' ').trim()
        if (t) verses.set(Number(vv.verse), t)
      }
      if (verses.size) chapters.set(n, verses)
    }
    if (chapters.size) books.set(en, { name: String(b.name || '').trim(), chapters })
  }
  return books
}

function toMarkdown(src, books) {
  const out = [`# ${src.id} — fetched from ${src.kind} \`${src.ref}\``, '']
  out.push(`> Generated by scripts/fetch-sources.mjs. Do not edit by hand — re-run \`npm run fetch -- ${src.id}\`.`, '')
  for (const en of BOOK_ORDER) {
    const b = books.get(en)
    if (!b) continue
    const native = b.name && b.name !== en ? b.name : ''
    out.push(native ? `## ${native} (${en})` : `## ${en}`)
    for (const ch of [...b.chapters.keys()].sort((a, z) => a - z)) {
      const verses = b.chapters.get(ch)
      if (!verses.size) continue
      out.push(`### Chapter ${ch}`)
      for (const v of [...verses.keys()].sort((a, z) => a - z)) out.push(`**${v}** ${verses.get(v)}`)
    }
    out.push('')
  }
  return out.join('\n')
}

if (!existsSync(SRC)) mkdirSync(SRC, { recursive: true })
console.log(`Fetching ${targets.length} edition(s) into data-src/\n`)

for (const src of targets) {
  try {
    const books = src.kind === 'ebible' ? await fromEbible(src) : await fromGetbible(src)
    if (!books.size) throw new Error('no books parsed — source layout may have changed')
    const md = toMarkdown(src, books)
    writeFileSync(resolve(SRC, `${src.id}.md`), md)
    let verses = 0
    for (const b of books.values()) for (const c of b.chapters.values()) verses += c.size
    // By section, not by position: the deuterocanon sits between the Testaments in
    // BOOK_ORDER, so counting "index >= 39" as New Testament stopped being true the
    // moment a source carried one.
    const n = { ot: 0, deutero: 0, nt: 0 }
    for (const name of books.keys()) n[sectionOf(name)]++
    const parts = [`OT ${n.ot}`, n.deutero ? `deutero ${n.deutero}` : null, `NT ${n.nt}`].filter(Boolean)
    console.log(`  ✓ ${src.id}: ${books.size} books (${parts.join(' / ')}), ${verses} verses → data-src/${src.id}.md\n`)
  } catch (err) {
    console.error(`  ✗ ${src.id}: ${err.message}\n`)
    process.exitCode = 1
  }
}
