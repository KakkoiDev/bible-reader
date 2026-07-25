// Build aligned per-book JSON from the three Markdown Bibles in ../data-src.
// Output: ../public/data/index.json + ../public/data/<slug>.json
// Run: node scripts/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')
const OUT = resolve(__dirname, '../public/data')

/** Parse one MD file into { enName -> { ja, chapters: Map<ch, Map<v, text>> } } and a book order. */
function parseMd(file) {
  const books = new Map() // enName -> {ja, chapters: Map}
  const order = []
  let cur = null
  let ch = null
  for (const raw of readFileSync(resolve(SRC, file), 'utf8').split('\n')) {
    if (raw.startsWith('## ') && !raw.startsWith('###')) {
      const heading = raw.slice(3).trim()
      // Bungo: "詩篇 (Psalms)"  |  KJV/KJF: "Genesis"
      const m = heading.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      const en = (m ? m[2] : heading).trim()
      const ja = m ? m[1].trim() : ''
      if (!books.has(en)) { books.set(en, { ja, chapters: new Map() }); order.push(en) }
      else if (ja) books.get(en).ja = ja
      cur = books.get(en); ch = null
      continue
    }
    if (raw.startsWith('### ')) {
      const nums = raw.match(/\d+/g)
      ch = nums ? parseInt(nums[nums.length - 1], 10) : null
      if (cur && ch != null && !cur.chapters.has(ch)) cur.chapters.set(ch, new Map())
      continue
    }
    const vm = raw.match(/^\*\*(\d+)\*\*\s+(.*?)\s*$/)
    if (vm && cur && ch != null) {
      cur.chapters.get(ch).set(parseInt(vm[1], 10), vm[2])
    }
  }
  return { books, order }
}

const kjv = parseMd('kjv.md')   // English names + canonical order
const kjf = parseMd('kjf.md')
const bungo = parseMd('bungo.md') // supplies Japanese names

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// KJV cleanup for the reader: drop translator marginal notes — any {…} group
// containing a colon or "…" (e.g. "{firmament: Heb. expansion}") — while keeping
// genuine supplied-word italics ("{is}", "{was}"). Debracket psalm superscriptions.
const cleanKjv = (t) =>
  t
    .replace(/\s*\{[^}]*(?::|\.\.\.)[^}]*\}/g, '')
    .replace(/[[\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const index = []
for (const en of kjv.order) {
  const kb = kjv.books.get(en)
  const fb = kjf.books.get(en)
  const jb = bungo.books.get(en)
  const ja = jb?.ja || ''
  // union of chapters, then union of verses per chapter
  const chNums = new Set([
    ...(kb?.chapters.keys() || []),
    ...(fb?.chapters.keys() || []),
    ...(jb?.chapters.keys() || []),
  ])
  const chapters = []
  for (const c of [...chNums].sort((a, b) => a - b)) {
    const ek = kb?.chapters.get(c), fk = fb?.chapters.get(c), jk = jb?.chapters.get(c)
    const vNums = new Set([
      ...(ek?.keys() || []), ...(fk?.keys() || []), ...(jk?.keys() || []),
    ])
    const verses = [...vNums].sort((a, b) => a - b).map((v) => ({
      v,
      en: cleanKjv(ek?.get(v) || ''),
      fr: fk?.get(v) || '',
      ja: jk?.get(v) || '',
    }))
    chapters.push({ n: c, verses })
  }
  const sl = slug(en)
  writeFileSync(resolve(OUT, `${sl}.json`), JSON.stringify({ slug: sl, en, ja, chapters }))
  index.push({ slug: sl, en, ja, chapters: chapters.length })
}
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(index))

// summary
const files = readdirSync(OUT).filter((f) => f !== 'index.json')
let totalVerses = 0
for (const b of index) {
  const d = JSON.parse(readFileSync(resolve(OUT, `${b.slug}.json`), 'utf8'))
  totalVerses += d.chapters.reduce((s, c) => s + c.verses.length, 0)
}
console.log(`Books: ${index.length}, files: ${files.length}, aligned verse rows: ${totalVerses}`)
console.log('Sample:', index[0].en, '/', index[18].en, index[18].ja, `(${index[18].chapters} ch)`)
