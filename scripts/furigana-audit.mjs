// Rank the 口語訳's generated furigana against the 文語訳's hand-set furigana, so the
// readings worth overriding can be reviewed instead of guessed at.
//
// jako's readings come from kuromoji, which is a general-purpose tokenizer with no idea
// it is reading scripture: it gives 主 as おも rather than しゅ 8,667 times. The 文語訳 in
// data-src/bungo.md carries readings a human set, over the same verses, so it is the
// only reference in the repo. It is a NOISY reference, and the noise is systematic:
//
//   historical kana   わう for おう, じふ for じゅう, みづ for みず, ゐ for い. Normalised
//                     below, imperfectly, because 歴史的仮名遣い has no total mapping to
//                     modern kana that a hundred lines of regex will get right.
//   inflection        行 is おこな in one edition and おこない in the other, 出 is い and
//                     いで. Dropped where one reading is a prefix of the other.
//   different kanji   the 文語訳 writes 惡, 實, 途 where jako writes 悪, 実, 道, so the
//                     two never meet on a key at all. Nothing to do: those rows are
//                     absent rather than wrong.
//
// So this emits CANDIDATES, ranked by how many occurrences a change would touch. What
// survives review goes in data-src/furigana-overrides.json by hand, keyed on the wrong
// reading, and furigana-jako.mjs applies it. Roughly four rows in five here are not
// errors; the point of the ranking is that the errors are concentrated at the top.
//
// Run: node scripts/furigana-audit.mjs [--top 60] [--all]
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../data-src')
const OVERRIDES = resolve(SRC, 'furigana-overrides.json')

const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 60
const all = process.argv.includes('--all')

/**
 * Historical kana to something comparable with modern kana. Deliberately shallow: it
 * folds the four differences that account for most of the noise and does not attempt
 * the rest, because a wrong fold invents an agreement that is not there, which is worse
 * than leaving a row in the list for a human to dismiss.
 */
const A_ROW = 'かさたなはまやらわがざだばぱ'
const O_ROW = 'こそとのほもよろをごぞどぼぽ'
const I_ROW = 'きしちにひみりぎじびぴ'
const modern = (k) =>
  k
    .replace(/ゐ/g, 'い')
    .replace(/ゑ/g, 'え')
    .replace(/ぢ/g, 'じ')
    .replace(/づ/g, 'ず')
    // Medial ha-row is wa-row: まへ -> まえ, かほ -> かお, くは -> くわ. The single
    // biggest rule, and the reason 3,002 occurrences of 王 わう were being listed.
    .replace(/(?!^)は/g, 'わ')
    .replace(/(?!^)ひ/g, 'い')
    .replace(/(?!^)ふ/g, 'う')
    .replace(/(?!^)へ/g, 'え')
    .replace(/(?!^)ほ/g, 'お')
    // きやう -> きゃう, しゆ -> しゅ: a full-size ya/yu/yo after an i-row kana is small.
    .replace(new RegExp(`([${I_ROW}])や`, 'g'), '$1ゃ')
    .replace(new RegExp(`([${I_ROW}])ゆ`, 'g'), '$1ゅ')
    .replace(new RegExp(`([${I_ROW}])よ`, 'g'), '$1ょ')
    // au -> ō, iu -> yū, eu -> yō: かう -> こう, じう -> じゅう, きゃう -> きょう.
    .replace(new RegExp(`([${A_ROW}])う`, 'g'), (m, c) => `${O_ROW[A_ROW.indexOf(c)]}う`)
    .replace(new RegExp(`([${I_ROW}])う`, 'g'), '$1ゅう')
    .replace(/ゃう/g, 'ょう')
    .replace(/えう/g, 'よう')
    // Historical を is お wherever it appears; the modern particle never shows up in
    // a reading. Word-initial included: をんな is onna.
    .replace(/を/g, 'お')

const RUBY = /\{\{([^|}]+)\|([^}]+)\}\}/g

/** kanji -> reading -> count, over one edition's Markdown. */
function readings(file) {
  const out = new Map()
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(RUBY)) {
    const [, kanji, kana] = m
    if (!out.has(kanji)) out.set(kanji, new Map())
    const r = out.get(kanji)
    r.set(kana, (r.get(kana) || 0) + 1)
  }
  return out
}

const jako = readings(resolve(SRC, 'jako.md'))
const bungo = readings(resolve(SRC, 'bungo.md'))

const already = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {}
const total = (m) => [...m.values()].reduce((a, b) => a + b, 0)
const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])

// Ruby whose reading is the kanji again: kuroshiro found no reading and echoed the
// input, so the reader shows 燔 above 燔. No reference needed to call that wrong, and
// it is invisible in the 文語訳 comparison whenever the older text uses another kanji.
const echoes = []
for (const [kanji, mine] of jako)
  for (const [reading, count] of mine)
    if (reading === kanji) echoes.push({ kanji, count, fixed: already[kanji]?.[reading] })
echoes.sort((a, b) => b.count - a.count)

// A reading the edition itself almost never uses. 道 is みち 740 times and どう 9, and
// all nine are みち. Lopsidedness is not proof - 山 is やま and さん for good reasons -
// but it is the cheapest place left to look, and it needs no reference at all.
const minority = []
for (const [kanji, mine] of jako) {
  const n = total(mine)
  if (n < 20 || mine.size < 2) continue
  const [[dom, domN]] = rank(mine)
  for (const [reading, count] of mine)
    if (reading !== dom && count >= 2 && count / n <= 0.05)
      minority.push({ kanji, reading, count, dom, domN, fixed: already[kanji]?.[reading] })
}
minority.sort((a, b) => b.count - a.count)

const rows = []
let covered = 0
for (const [kanji, mine] of jako) {
  const theirs = bungo.get(kanji)
  if (!theirs) continue
  const ref = new Set([...theirs.keys()].map(modern))
  for (const [reading, count] of mine) {
    if (ref.has(modern(reading))) continue
    // 行: おこな here, おこない there. One is the stem of the other, so the difference is
    // where the okurigana was cut, not what the kanji says.
    const inflection = [...ref].some((r) => r.startsWith(modern(reading)) || modern(reading).startsWith(r))
    if (inflection) continue
    covered += count
    rows.push({
      kanji,
      reading,
      count,
      share: count / total(mine),
      fixed: already[kanji]?.[reading],
      bungo: rank(theirs).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', '),
      mine: rank(mine).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', '),
    })
  }
}
rows.sort((a, b) => b.count - a.count)

const jakoTotal = [...jako.values()].reduce((a, m) => a + total(m), 0)
console.log(`\n${rows.length} reading(s) the 文語訳 does not corroborate, over ${covered} of jako's ${jakoTotal} ruby occurrences.`)
console.log(`${rows.filter((r) => r.fixed).length} already carried by data-src/furigana-overrides.json.\n`)

const show = all ? rows : rows.slice(0, top)
console.log('  count  kanji  jako reading   -> override      文語訳 says')
console.log('  ' + '-'.repeat(76))
for (const r of show)
  console.log(
    `  ${String(r.count).padStart(5)}  ${r.kanji.padEnd(5)}  ${r.reading.padEnd(12)} ` +
      `${(r.fixed ? `-> ${r.fixed}` : '').padEnd(15)} ${r.bungo}`,
  )
if (!all && rows.length > top) console.log(`\n  ... ${rows.length - top} more; --all for the lot.`)

const echoed = echoes.reduce((a, e) => a + e.count, 0)
console.log(`\n${echoes.length} kanji whose ruby is the kanji again, ${echoed} occurrence(s):`)
console.log(`${echoes.filter((e) => e.fixed).length} already carried by data-src/furigana-overrides.json.\n`)
for (const e of (all ? echoes : echoes.slice(0, top)))
  console.log(`  ${String(e.count).padStart(5)}  ${e.kanji.padEnd(5)}  ${e.fixed ? `-> ${e.fixed}` : ''}`)
if (!all && echoes.length > top) console.log(`\n  ... ${echoes.length - top} more; --all for the lot.`)

console.log(`\n${minority.length} reading(s) used for 5% or less of a kanji's occurrences:`)
console.log(`${minority.filter((m) => m.fixed).length} already carried by data-src/furigana-overrides.json.\n`)
console.log('  count  kanji  rare           -> override      usual')
console.log('  ' + '-'.repeat(76))
for (const m of (all ? minority : minority.slice(0, top)))
  console.log(
    `  ${String(m.count).padStart(5)}  ${m.kanji.padEnd(5)}  ${m.reading.padEnd(12)} ` +
      `${(m.fixed ? `-> ${m.fixed}` : '').padEnd(15)} ${m.dom} ${m.domN}`,
  )
if (!all && minority.length > top) console.log(`\n  ... ${minority.length - top} more; --all for the lot.`)
console.log()
