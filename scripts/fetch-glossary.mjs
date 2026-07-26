// Build the archaic-word half of the KJV glossary from Webster's Unabridged (1913),
// which is public domain, and which marks obsolete senses explicitly.
//
//   data-src/webster-archaic.json   { word: { d: definition, o: "obs" | "arch" } }
//
// Why Webster's 1913 rather than GCIDE: GCIDE is the same dictionary with GPL-licensed
// editorial work layered on, and this repo keeps its data licences clean. The 1913 text
// itself is public domain, so it is taken straight from Project Gutenberg ebook 29765.
// The Gutenberg licence covers their trademark and packaging, not the 1913 text.
//
// Two things this deliberately does NOT try to do:
//
//   - It does not decide which sense the KJV means. Webster's lists every sense a word
//     ever had; the entry for `charity` opens with "Love; universal benevolence" and
//     also carries the modern almsgiving sense. Picking between them is editorial, so
//     the words a modern reader silently *misreads* are hand-written instead, in
//     data-src/glossary-en.json. This file covers the other kind: words a reader knows
//     they do not know.
//   - It does not include words that are merely *sometimes* archaic. Webster's marks
//     obsolete senses, not obsolete words, so a first attempt at this produced
//     `bottom -> "An abyss"`, `palm -> "To handle"` and `suppose -> "To put by fraud
//     in the place of another"`: true of 1611, wrong for nearly every verse those
//     words appear in. A word is only taken when *every* sense Webster's lists is
//     marked obsolete, which is the difference between "this word is obsolete" and
//     "this word once meant something else". The second kind is a false friend and is
//     hand-written in data-src/glossary-en.json, where a human decided.
//
// Run: node scripts/fetch-glossary.mjs
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')
const URL = 'https://www.gutenberg.org/cache/epub/29765/pg29765.txt'

/**
 * A last guard, after the all-senses-obsolete test below. These are words a reader
 * certainly knows, where any surviving 1611 definition would still mislead, and every
 * one that matters is handled deliberately in the curated file instead.
 */
const MODERN_COMMON = new Set(
  `let want suffer charity prevent conversation quick meat corn comfort communicate carriage
   room mean study take office minister virtue wait wealth wit press deal ear equal coast
   several simple sometime honest instant lively mansion naughty nephew occupy offend prefer
   provoke publish tempt allow admire`
    .split(/\s+/)
    .filter(Boolean),
)

async function get(url) {
  process.stdout.write(`  ↓ Webster's Unabridged (1913), Gutenberg 29765 … `)
  const res = await fetch(url, { headers: { 'user-agent': 'bible-reader/0.1 (+build script)' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const text = await res.text()
  console.log(`${(text.length / 1e6).toFixed(1)} MB`)
  return text
}

/**
 * Words to leave out after review. Two kinds, and both were found by reading all 52
 * candidates rather than trusting the filters:
 *
 *   - still ordinary English, where the 1611 gloss adds nothing (`kettle`, `whale`)
 *   - actively misleading, where the obsolete sense inverts or displaces the one a
 *     reader will assume (`inhabited` glossed as "uninhabited", `traded` as
 *     "professional", `compassed` as "arched" when the KJV means surrounded)
 *
 * `saith` is excluded for a third reason: at 1,261 occurrences it was 46% of the whole
 * glossary on its own, glossed as "3d pers. sing. pres. of Say" — something every
 * reader already gets from context. A panel that fires on half the verses in the Bible
 * to say nothing is a panel readers learn to ignore.
 */
const REVIEWED_OUT = new Set(
  `adversity amazement booty kettle whale bending compassed informed inhabited traded
   wondered leaping hires disdained sorrowed paramours anan cyprus
   saith`
    .split(/\s+/)
    .filter(Boolean),
)

/** The KJV's own vocabulary, so the glossary only carries words that occur in it. */
function kjvWords() {
  const file = resolve(SRC, 'kjv.md')
  if (!existsSync(file)) throw new Error('data-src/kjv.md missing — the glossary is keyed to the KJV')
  // Tracked per casing, because a word that never appears in lower case is a proper
  // name. Without this the glossary claimed Jordan was "a pot or vessel used by
  // alchemists", Luke was "moderately warm", and Gog was "ardent desire to go" —
  // Webster's has obsolete common nouns that collide with KJV names once folded.
  const lower = new Set()
  const seen = new Set()
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.startsWith('#')) continue
    const line = raw
      .replace(/^\*\*\d+\*\*\s*/, '') // verse number
      .replace(/\{[^}]*\}/g, ' ') // supplied words and marginal notes
      .replace(/[[\]]/g, ' ')
    for (const m of line.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)) {
      const raw2 = m[0]
      seen.add(raw2.toLowerCase())
      if (raw2[0] === raw2[0].toLowerCase()) lower.add(raw2.toLowerCase())
    }
  }
  return { seen, lower }
}

/** Pronunciation artefacts and OCR debris that mean the definition is not usable. */
const UNUSABLE = /["*]|\bcontr\. of\b|^,|\b(Beau\. & Fl|Brathwait)\b/

/** A headword line: all caps, possibly several forms separated by `;`. */
const HEAD = /^[A-Z][A-Z'\- ]*(?:; ?[A-Z][A-Z'\- ]*)*$/

/**
 * Walk the Gutenberg text into { headwords, body } blocks.
 *
 * The file marks each entry with its headword alone on a line in capitals, then the
 * pronounced form, etymology, and numbered senses. Nothing else in the body is fully
 * capitalised on its own line, so that is enough to segment on.
 */
function* entries(text) {
  const lines = text.split(/\r?\n/)
  let heads = null
  let buf = []
  for (const line of lines) {
    const t = line.trim()
    if (HEAD.test(t) && t.length > 1 && !/^(THE|AND|OF|A)$/.test(t)) {
      if (heads) yield { heads, body: buf.join('\n') }
      heads = t.split(';').map((h) => h.trim().toLowerCase()).filter(Boolean)
      buf = []
      continue
    }
    if (heads) buf.push(line)
  }
  if (heads) yield { heads, body: buf.join('\n') }
}

/** 19th-century citation attributions, which are not help for a reader. */
const CITERS =
  /\s+(Shak|Chaucer|Gower|Spenser|Milton|Dryden|Bacon|Pope|Swift|Addison|Tennyson|Wyclif|Tyndale|Bp\.?\s*\w+|Sir\s+\w+|L'Estrange|Ruskin|Burke|Locke|Hooker|Fuller|Prior|Holland|Camden|Ascham)\s*\.?\s*$/

/**
 * The entry's senses, with the leading pronounced form and etymology removed.
 *
 * The body opens with the respelled headword and part of speech (`Be"som, n.`), which
 * is not a definition and leaked into a first version of this file as
 * `Be"som, n. A brush of twigs…`. Everything before the first `Defn:` or numbered
 * sense is therefore dropped.
 */
function senses(body) {
  let flat = body
    .replace(/Etym:\s*\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const first = flat.search(/\bDefn:\s*|\b1\.\s/)
  if (first > 0) flat = flat.slice(first)
  flat = flat.replace(/\bDefn:\s*/g, ' ').replace(/\s+Syn\.\s*--.*$/, '').trim()
  const parts = flat
    .split(/(?=\b\d{1,2}\.\s)/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts : [flat]
}

/** Two OCR slips in the 1913 scan, corrected rather than shipped as-is. */
const OCR = [
  [/\bthe heard, liver\b/, 'the heart, liver'],
  [/\brear quard\b/, 'rear guard'],
]

/** One sense, cleaned into a single readable line. */
function clean(sense) {
  let out = sense
    .replace(/^\d{1,2}\.\s*/, '')
    // Every bracketed label, not an enumerated few: the scan carries variants like
    // "[Obs. or. Archaic]" and "[Archaic or Dial.]" that a fixed list kept missing.
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Keep only the definition, not the quotation that illustrates it.
  out = out.split(/(?<=[.;])\s+(?=[A-Z][a-z]+\s|["\u201c])/)[0]
  out = out
    .replace(CITERS, '')
    // Trailing scripture citation, e.g. "An ambush. 2 Chron. xiii. 13".
    .replace(/[\s.;,]+\d?\s*[A-Z][a-z]+\.?\s+[ivxlcIVXLC]+\.?(\s*\d+)?\.?\s*$/, '')
    .replace(/\s*[.;,]\s*$/, '')
    .trim()
  for (const [re, to] of OCR) out = out.replace(re, to)
  return out
}

const text = await get(URL)
const vocab = kjvWords()
let scanned = 0

// Aggregate by headword before judging it. Webster's gives homographs their own
// blocks, so `bottom` has a live block (the lowest part of a thing) and a wholly
// obsolete one (a skein of thread). Judging blocks individually accepted the second
// and put "A ball or skein of thread" on every occurrence of the word. A headword
// only qualifies if *no* block for it carries a live sense.
const perWord = new Map()
for (const { heads, body } of entries(text)) {
  scanned++
  const list = senses(body)
  if (!list.length) continue
  const marked = list.filter((x) => /\[Obs\.\]|\bArchaic\b/.test(x))
  for (const head of heads) {
    if (!/^[a-z][a-z']*$/.test(head) || head.length < 3) continue
    if (!vocab.seen.has(head) || MODERN_COMMON.has(head)) continue
    if (!vocab.lower.has(head)) continue // proper name in the KJV, not a word
    if (REVIEWED_OUT.has(head)) continue
    let rec = perWord.get(head)
    if (!rec) perWord.set(head, (rec = { live: 0, dead: 0, def: '', obs: false }))
    if (marked.length === list.length) {
      rec.dead++
      if (!rec.def) {
        rec.def = clean(marked[0])
        rec.obs = /\[Obs\.\]/.test(body)
      }
    } else rec.live++
  }
}

const glossary = {}
for (const [head, rec] of perWord) {
  if (rec.live > 0 || rec.dead === 0) continue // any surviving sense disqualifies it
  const d = rec.def
  if (!d || d.length < 8 || d.length > 220) continue
  if (/^(of|imp\.|p\. p\.|pres\.|see )/i.test(d) && d.length < 30) continue
  if (UNUSABLE.test(d)) continue
  glossary[head] = { d, o: rec.obs ? 'obs' : 'arch' }
}

writeFileSync(resolve(SRC, 'webster-archaic.json'), JSON.stringify(glossary, null, 0))
const kb = (statSync(resolve(SRC, 'webster-archaic.json')).size / 1024).toFixed(0)
console.log(`\n  ✓ ${scanned} entries scanned, ${Object.keys(glossary).length} archaic KJV words → data-src/webster-archaic.json (${kb} KB)`)
console.log(`    sample: ${Object.keys(glossary).slice(0, 8).join(', ')}`)
