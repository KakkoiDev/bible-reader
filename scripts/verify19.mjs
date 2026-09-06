// New editions: corpus shape, representative text and native reference lookup.
// Run: node scripts/verify19.mjs
import { build } from 'esbuild'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'node_modules/.cache/search-editions.test.mjs')
await build({ entryPoints: [resolve(root, 'src/lib/search.ts')], bundle: true,
  format: 'esm', platform: 'node', external: ['react'], outfile: out, logLevel: 'error',
  define: { 'import.meta.env.BASE_URL': "'/'" } })
const { parseReference } = await import(pathToFileURL(out).href)
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const index = json('public/data/index.json')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}
const catalogueIds = new Set(index.flatMap((book) => Object.keys(book.names)))
check('the catalogue has fourteen editions', catalogueIds.size === 14,
  [...catalogueIds].join(', '))
check('Esperanto references resolve by their native title',
  parseReference('Laŭ Johano 3:16', index)?.slug === 'john')
check('Latin references resolve by their native title',
  parseReference('Iohannem 3:16', index)?.slug === 'john')

for (const [id, phrase] of [['eo', 'Ĉar Dio tiel amis'], ['la', 'Sic enim Deus dilexit']]) {
  const john = json(`public/data/${id}/john.json`)
  const verse = john.chapters.find((c) => c.n === 3)?.verses.find((v) => v.v === 16)?.t || ''
  check(`${id} carries John 3:16`, verse.startsWith(phrase), verse.slice(0, 50))
}
const latinEsther = json('public/data/la/esther.json')
const latinDaniel = json('public/data/la/daniel.json')
check('Latin stays inside the current 66-book alignment model',
  latinEsther.chapters.length === 10 && latinDaniel.chapters.length === 12,
  `Esther ${latinEsther.chapters.length}, Daniel ${latinDaniel.chapters.length}`)

rmSync(out, { force: true })
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
