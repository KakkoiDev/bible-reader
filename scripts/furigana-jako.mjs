// Add furigana to the colloquial Japanese 口語訳 (jako).
//
// The getbible `japkougo` source is plain kanji + kana with no readings, unlike the
// hand-curated 文語訳, and no public-domain machine-readable 口語訳 with furigana exists.
// So readings are generated with kuroshiro (okurigana-aware) over kuromoji's IPADIC and
// written as the same {{漢字|かな}} markup the 文語訳 uses. These are a pronunciation aid:
// good for common vocabulary, but some readings (homographs, rare proper nouns) will be
// wrong. The built edition is what ships; this regenerates the committed source.
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
const Ctor = Kuroshiro.default || Kuroshiro
const Analyzer = KuromojiAnalyzer.default || KuromojiAnalyzer

const kuroshiro = new Ctor()
await kuroshiro.init(new Analyzer())

/** Drop any furigana already present, so the script is idempotent. */
const stripRuby = (t) => t.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1')
/** kuroshiro's <ruby>漢字<rp>(</rp><rt>かな</rt><rp>)</rp></ruby> -> {{漢字|かな}}. */
const toRuby = (html) =>
  html.replace(/<rp>.*?<\/rp>/g, '').replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g, '{{$1|$2}}')

const lines = readFileSync(FILE, 'utf8').split('\n')
let done = 0
for (let i = 0; i < lines.length; i++) {
  // "**n** <text>  " with the trailing hard-break spaces preserved.
  const m = lines[i].match(/^(\*\*\d+\*\*\s+)(.*?)(\s*)$/)
  if (!m) continue
  const html = await kuroshiro.convert(stripRuby(m[2]), { mode: 'furigana', to: 'hiragana' })
  lines[i] = `${m[1]}${toRuby(html)}${m[3]}`
  if (++done % 3000 === 0) console.log(`  ${done} verses…`)
}
writeFileSync(FILE, lines.join('\n'))
console.log(`furigana added to ${done} verses in data-src/jako.md`)
