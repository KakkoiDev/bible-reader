// Verify no edition's verse data is corrupt, before it can ship.
//
// Reads the source Markdown in ../data-src directly, NOT the built JSON. build-data
// keys verses by number (last wins, build-data.mjs:48), so a duplicate **7** collapses
// silently and is invisible after the build. Only the source shows it. This is the
// check that would have caught the KJF Revelation 4 interleave (numbers 1,1,...,11,11).
//
// Severities, per (edition, book, chapter):
//   duplicate verse number   FAIL, every edition   (data loss via last-wins)
//   non-monotonic numbering   FAIL, every edition   (a number after a larger one)
//   gap / not starting at 1   FAIL for `en` only    (the KJV spine must be contiguous;
//                             WARN otherwise          other editions legitimately omit
//                                                     verses per their manuscript tradition)
//   verse count != en spine   WARN                  (versification differs by tradition)
//
// Exit nonzero iff any FAIL fired. Warnings print but never fail the build.
// Run: node scripts/check-data.mjs   (wired into `npm run build` before the data build)
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES } from './sources.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')

// The KJV spine's own verse total, as a coarse backstop against a gross regression in
// the reference itself. This is the eBible KJV's actual, fully contiguous count: it
// carries every classic verse (Matthew 17:21, Acts 8:37, 1 John 5:7, ...) and the
// maximal 3 John (15) and Revelation 12 (18). The traditional figure of 31,102 differs
// by two on boundary-verse versification; nothing is missing here.
const EN_TOTAL = 31100

/**
 * Parse one edition into Map<englishName, Map<chapter, number[]>>, verse numbers in
 * file order. Uses the same three patterns as build-data.mjs parseMd - but records an
 * ARRAY, not a Map, so a repeated number is preserved rather than overwritten.
 */
function parse(file) {
  const books = new Map()
  let cur = null
  let ch = null
  for (const raw of readFileSync(resolve(SRC, file), 'utf8').split('\n')) {
    if (raw.startsWith('## ') && !raw.startsWith('###')) {
      const heading = raw.slice(3).trim()
      const m = heading.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      const en = (m ? m[2] : heading).trim()
      if (!books.has(en)) books.set(en, new Map())
      cur = books.get(en)
      ch = null
      continue
    }
    if (raw.startsWith('### ')) {
      const nums = raw.match(/\d+/g)
      ch = nums ? parseInt(nums[nums.length - 1], 10) : null
      if (cur && ch != null && !cur.has(ch)) cur.set(ch, [])
      continue
    }
    const vm = raw.match(/^\*\*(\d+)\*\*\s+(.*?)\s*$/)
    if (vm && cur && ch != null) cur.get(ch).push(parseInt(vm[1], 10))
  }
  return books
}

// Gaps that are documented and deliberately left unfixed, so they do not clutter the
// warning list (docs/KJF-DEFECTS.md sections 3 and 5). Revelation 4 is NOT here: it is
// fixed, so a revert re-introduces its duplicate numbers and the FAIL below fires.
const KNOWN_GAPS = new Set([
  'fr/Leviticus/13', 'fr/Numbers/30', 'fr/1 Chronicles/23', 'fr/Isaiah/9',
  'fr/Ezekiel/20', 'fr/2 Thessalonians/2', 'fr/3 John/1',
  'fr/Psalms/21', 'fr/Psalms/44', 'fr/Psalms/45', 'fr/Psalms/60', 'fr/Psalms/63',
  'fr/Psalms/69', 'fr/Psalms/84', 'fr/Psalms/92', 'fr/Psalms/113', 'fr/Psalms/140',
  'fr/Psalms/142', 'fr/Numbers/13', 'fr/Psalms/57', 'fr/Jonah/2',
])

// Verse-count differences from the KJV that are editorial, not defects
// (docs/KJF-DEFECTS.md section 4).
const KNOWN_DIVERGE = new Set(['fr/1 Samuel/20', 'fr/1 Kings/22', 'fr/Revelation/12'])

// Chapters where the KJF OSIS export mis-numbered a verse so its text landed under a
// duplicate number - the same defect family as the section-3/5 numbering slips, and
// like those it needs the publisher's verse divisions to resolve, so it is documented
// rather than guessed at (docs/KJF-DEFECTS.md sections 3, 5, and 6). build-data keeps
// the last of each pair, so one verse's text is currently lost in these chapters. This
// is a WARN, not a FAIL. Revelation 4 is deliberately NOT here: its interleave was
// mechanically recoverable and is fixed, so a revert re-fails the duplicate check.
const KNOWN_DUPS = new Set([
  'fr/Numbers/13', 'fr/1 Chronicles/23', 'fr/Psalms/30', 'fr/Psalms/44', 'fr/Psalms/60',
  'fr/Psalms/69', 'fr/Psalms/92', 'fr/Isaiah/9', 'fr/Jonah/2', 'fr/2 Thessalonians/2',
])

const fails = []
const warns = []
const editions = []

for (const src of SOURCES) {
  const file = src.file || `${src.id}.md`
  if (!existsSync(resolve(SRC, file))) continue
  editions.push({ id: src.id, books: parse(file) })
}

const spine = editions.find((e) => e.id === 'en')
if (!spine) throw new Error('no `en` edition found - the KJV is the required spine')

// en verse ceiling per book/chapter, for the divergence comparison.
const enMax = new Map() // "book/ch" -> max verse
let enTotal = 0
for (const [book, chapters] of spine.books)
  for (const [ch, nums] of chapters) {
    enMax.set(`${book}/${ch}`, Math.max(...nums))
    enTotal += nums.length
  }

for (const ed of editions) {
  for (const [book, chapters] of ed.books) {
    for (const [ch, nums] of chapters) {
      const where = `${ed.id} ${book} ${ch}`
      const key = `${ed.id}/${book}/${ch}`

      // A. duplicates (the corruption class that build-data silently collapses)
      const seen = new Set()
      const dups = new Set()
      for (const n of nums) (seen.has(n) ? dups : seen).add(n)
      if (dups.size) {
        const list = [...dups].sort((a, b) => a - b).join(', ')
        if (KNOWN_DUPS.has(`${ed.id}/${book}/${ch}`)) warns.push(`${where}: duplicate verse ${list} (known KJF export defect)`)
        else fails.push(`${where}: duplicate verse ${list}`)
      }

      // B. non-monotonic (a verse number that is not larger than the one before it,
      //    duplicates aside - that is a scramble like the interleave produced)
      for (let i = 1; i < nums.length; i++)
        if (nums[i] < nums[i - 1]) {
          fails.push(`${where}: verse ${nums[i]} appears after ${nums[i - 1]} (out of order)`)
          break
        }

      // C. gap / not starting at 1
      const max = Math.max(...nums)
      const present = new Set(nums)
      const missing = []
      for (let n = 1; n <= max; n++) if (!present.has(n)) missing.push(n)
      if (missing.length) {
        const msg = `${where}: missing verse ${missing.join(', ')} (of ${max})`
        if (ed.id === 'en') fails.push(msg)
        else if (!KNOWN_GAPS.has(`${ed.id}/${book}/${ch}`)) warns.push(msg)
      }

      // D. count divergence from the spine (advisory)
      const em = enMax.get(`${book}/${ch}`)
      if (ed.id !== 'en' && em != null && max !== em && !KNOWN_DIVERGE.has(`${ed.id}/${book}/${ch}`))
        warns.push(`${where}: ${max} verses vs KJV ${em}`)
    }
  }
}

// spine total backstop
if (enTotal !== EN_TOTAL)
  fails.push(`en spine total is ${enTotal} verses, expected ${EN_TOTAL} (KJV reference count)`)

const tag = (arr) => arr.map((m) => `  ${m}`).join('\n')

// Warnings are inherent to a mixed-tradition corpus (the Chinese 和合本 alone omits
// scores of verses on purpose), so a full list drowns the log. Summarize per edition;
// `--verbose` dumps every line for an actual audit.
if (warns.length) {
  const verbose = process.argv.includes('--verbose')
  const byEd = {}
  for (const w of warns) {
    const id = w.split(' ')[0]
    byEd[id] = (byEd[id] || 0) + 1
  }
  const tally = Object.entries(byEd)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id} ${n}`)
    .join(', ')
  console.log(`\n${warns.length} versification difference(s), informational (not failures): ${tally}`)
  if (verbose) console.log(tag(warns))
  else console.log('  run `node scripts/check-data.mjs --verbose` for the full list')
}

if (fails.length) {
  console.error(`\n${fails.length} FAILURE(S) - corrupt verse data:`)
  console.error(tag(fails))
  console.error('\ncheck-data failed.')
  process.exit(1)
}
console.log(`\ncheck-data passed: ${editions.length} editions, en spine ${enTotal} verses.`)
