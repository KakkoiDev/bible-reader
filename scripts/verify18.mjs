// Render the print-only table server-side to verify its shape without a browser.
// Run: node scripts/verify18.mjs
import { build } from 'esbuild'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'node_modules/.cache/print-passage.test.mjs')
await build({ entryPoints: [resolve(root, 'src/components/PrintPassage.tsx')], bundle: true,
  format: 'esm', platform: 'node', external: ['react'], outfile: out, logLevel: 'error' })
const { PrintPassage } = await import(pathToFileURL(out).href)
const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8'))
const chapter = { n: 1, verses: [
  { v: 1, text: { en: 'In the {beginning}', ja: '{{初|はじめ}}に', fr: 'Au commencement' } },
  { v: 2, text: { en: 'The earth was without form', ja: '{{地|ち}}は' } },
] }
const store = { 'genesis.1.1': { highlights: [{ id: 'h', lang: 'en', start: 0, end: 2, color: 'yellow' }] } }
const html = renderToStaticMarkup(React.createElement(PrintPassage, {
  title: 'Genesis', chapter, slug: 'genesis', chapterNumber: 1,
  bookIndex: index.findIndex((b) => b.slug === 'genesis'), columns: ['en', 'ja', 'el'], store, furigana: true,
}))

let failures = 0
const check = (name, ok) => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}`); if (!ok) failures++ }
check('one semantic table is rendered', (html.match(/<table>/g) || []).length === 1)
check('one body row is rendered per verse', (html.match(/<tr>/g) || []).length === 3)
check('enabled covered editions become columns', html.includes('KJV') && html.includes('文語訳'))
check('an edition outside this testament is omitted', !html.includes('Textus Receptus'))
check('furigana remains in the printout', html.includes('<ruby>'))
check('saved highlights remain in the printout', html.includes('class="hl hl-yellow"'))
check('the print view stays out of the screen accessibility tree', html.includes('aria-hidden="true"'))

rmSync(out, { force: true })
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
