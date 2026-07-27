// Fetch Hitchcock's Bible Names Dictionary and write the name -> meaning map used to
// gloss KJV proper names.
//
// Source: Roswell D. Hitchcock, "Hitchcock's Bible Names Dictionary" (1869), public
// domain, digitized by CCEL and mirrored as per-letter JSON by
// neuu-org/bible-dictionary-dataset. Hitchcock's meanings are traditional 19th-century
// etymology and are sometimes fanciful or contested: the reader labels every one as
// "traditional (Hitchcock 1869)", and data-src/names-overrides.json can correct a
// meaning or suppress a bad entry. The built glossary is what ships; this script only
// regenerates the committed source.
//
// Run: node scripts/fetch-names.mjs
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../data-src/hitchcock-names.json')
const RAW =
  'https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset/main/data/02_sources/hitchcock/'

const names = {}
for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
  const r = await fetch(RAW + letter + '.json')
  if (!r.ok) continue
  const data = await r.json()
  for (const entry of Object.values(data)) {
    const hit = (entry.definitions || []).find((d) => d.source === 'HIT')
    if (!hit?.text || !entry.name) continue
    // Keep the name as printed, trimmed to a single sensible meaning line.
    names[entry.name] = hit.text.replace(/\s+/g, ' ').trim()
  }
}

const sorted = Object.fromEntries(Object.keys(names).sort().map((k) => [k, names[k]]))
writeFileSync(OUT, JSON.stringify(sorted) + '\n')
console.log(`Hitchcock names: ${Object.keys(sorted).length} entries -> data-src/hitchcock-names.json`)
