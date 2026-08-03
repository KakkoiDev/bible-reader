// Add furigana to the colloquial Japanese 口語訳 (jako).
//
// The getbible `japkougo` source is plain kanji + kana with no readings, unlike the
// hand-curated 文語訳, and no public-domain machine-readable 口語訳 with furigana exists.
// So readings are generated with kuroshiro (okurigana-aware) over kuromoji's IPADIC and
// written as the same {{漢字|かな}} markup the 文語訳 uses. These are a pronunciation aid:
// good for common vocabulary, but some readings (homographs, rare proper nouns) will be
// wrong. The built edition is what ships; this regenerates the committed source.
//
// data-src/furigana-overrides.json corrects what kuromoji gets wrong, keyed on the
// kanji AND the reading it produced, so a reading it gets right elsewhere is left
// alone: 主 is おも or あるじ 8,345 times and しゅ 160, but ぬし 162 times is correct
// (救主 is すくいぬし), so only the first two are rewritten. Candidates come from
// scripts/furigana-audit.mjs; the entries are hand-checked against the text, because
// the audit's reference is the 文語訳 and roughly four of its rows in five are not
// errors at all. 頭 is the example: とう looks wrong beside the 文語訳's かしら until you
// see that every occurrence is 一頭, the counter for livestock.
//
// Run after `npm run fetch -- jako`. Idempotent: existing {{漢字|かな}} is stripped and
// regenerated, so a re-run reproduces the same file.
// Run: node scripts/furigana-jako.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Kuroshiro from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(__dirname, '../data-src/jako.md')
const OVERRIDES = JSON.parse(readFileSync(resolve(__dirname, '../data-src/furigana-overrides.json'), 'utf8'))
const Ctor = Kuroshiro.default || Kuroshiro
const Analyzer = KuromojiAnalyzer.default || KuromojiAnalyzer

const kuroshiro = new Ctor()
await kuroshiro.init(new Analyzer())

/** Drop any furigana already present, so the script is idempotent. */
const stripRuby = (t) => t.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1')
/** kuroshiro's <ruby>漢字<rp>(</rp><rt>かな</rt><rp>)</rp></ruby> -> {{漢字|かな}}. */
const toRuby = (html) =>
  html.replace(/<rp>.*?<\/rp>/g, '').replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g, '{{$1|$2}}')

const applied = new Map()
const override = (line) =>
  line.replace(/\{\{([^|}]+)\|([^}]+)\}\}/g, (whole, kanji, kana) => {
    const fix = OVERRIDES[kanji]?.[kana]
    if (!fix) return whole
    applied.set(`${kanji} ${kana}`, (applied.get(`${kanji} ${kana}`) || 0) + 1)
    return `{{${kanji}|${fix}}}`
  })

const lines = readFileSync(FILE, 'utf8').split('\n')
let done = 0
for (let i = 0; i < lines.length; i++) {
  // "**n** <text>  " with the trailing hard-break spaces preserved.
  const m = lines[i].match(/^(\*\*\d+\*\*\s+)(.*?)(\s*)$/)
  if (!m) continue
  const html = await kuroshiro.convert(stripRuby(m[2]), { mode: 'furigana', to: 'hiragana' })
  lines[i] = `${m[1]}${override(toRuby(html))}${m[3]}`
  if (++done % 3000 === 0) console.log(`  ${done} verses…`)
}
writeFileSync(FILE, lines.join('\n'))
console.log(`furigana added to ${done} verses in data-src/jako.md`)

const hits = [...applied.entries()].sort((a, b) => b[1] - a[1])
const unused = Object.entries(OVERRIDES).flatMap(([k, m]) =>
  Object.keys(m).filter((r) => !applied.has(`${k} ${r}`)).map((r) => `${k} ${r}`))
console.log(`${hits.reduce((a, [, n]) => a + n, 0)} reading(s) corrected by furigana-overrides.json:`)
for (const [k, n] of hits) console.log(`  ${String(n).padStart(5)}  ${k} -> ${OVERRIDES[k.split(' ')[0]][k.split(' ')[1]]}`)
// An entry that never fires is either a reading kuromoji stopped producing or a typo
// in the table. Either way it is dead weight that looks like a correction.
if (unused.length) console.log(`\n  ! never matched, remove or fix: ${unused.join(', ')}`)
