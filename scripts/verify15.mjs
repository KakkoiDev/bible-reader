// The reading planner's arithmetic, tested directly rather than through a browser.
//
// A day's reading is a pure function of the start date, the length and the scope, so
// it can be asserted without a page: bundle src/lib/plans.ts with esbuild and call it.
// Nothing about which day you are on is stored, and these assertions are what says so.
//
// Run:  node scripts/verify15.mjs        (no server needed)
import { build } from 'esbuild'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const out = resolve(root, 'node_modules/.cache/plans.test.mjs')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  - ${detail}` : ''}`)
  if (!ok) failures++
}

await build({
  entryPoints: [resolve(root, 'src/lib/plans.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['react'],
  outfile: out,
  logLevel: 'error',
})
const P = await import(pathToFileURL(out).href)

const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8'))
const bySlug = new Map(index.map((b) => [b.slug, b]))
const chaptersIn = (slug) => bySlug.get(slug).chapters.length

const day = (y, m, d) => new Date(y, m - 1, d, 9, 30).getTime() // mid-morning, not midnight
const block = (over) => ({
  id: 'b', name: 'x', scope: { kind: 'books', slugs: ['proverbs'] },
  days: 30, repeat: false, order: 0, startedAt: day(2026, 3, 1), ...over,
})

console.log('\nA scope expands to chapters in reading order')
{
  const r = P.scopeChapters({ kind: 'range', from: 'matthew', to: 'revelation' }, index)
  const nt = index.slice(39).reduce((n, b) => n + b.chapters.length, 0)
  check('the New Testament is every chapter from Matthew to Revelation', r.length === nt, `${r.length} vs ${nt}`)
  check('and it starts and ends where it says',
    r[0].slug === 'matthew' && r[0].ch === 1 && r[r.length - 1].slug === 'revelation',
    `${r[0].slug} ${r[0].ch} .. ${r[r.length - 1].slug} ${r[r.length - 1].ch}`)

  const back = P.scopeChapters({ kind: 'range', from: 'revelation', to: 'matthew' }, index)
  check('a range given backwards reads forwards anyway', back.length === nt && back[0].slug === 'matthew')

  const books = P.scopeChapters({ kind: 'books', slugs: ['jude', 'james'] }, index)
  check('hand-picked books come back in canonical order, not the order typed',
    books[0].slug === 'james' && books[books.length - 1].slug === 'jude',
    books.map((r) => r.slug).join(','))

  const refs = P.scopeChapters(
    { kind: 'chapters', refs: ['matthew.5', 'matthew.6', 'matthew.7', 'nowhere.1', '1-corinthians.13', 'psalms.999'] },
    index,
  )
  check('an explicit list keeps the order typed and drops what does not exist',
    refs.length === 4 && refs[3].slug === '1-corinthians' && refs[3].ch === 13,
    refs.map((r) => `${r.slug}.${r.ch}`).join(' '))
}

console.log('\nA pass divides as evenly as it can, and never splits a chapter')
{
  const all = P.scopeChapters({ kind: 'books', slugs: ['proverbs'] }, index)
  check('Proverbs is 31 chapters', all.length === 31, `${all.length}`)
  const slices = Array.from({ length: 30 }, (_, i) => P.daySlice(all, 30, i))
  const sizes = slices.map((s) => s.length)
  check('30 days cover all 31 chapters', sizes.reduce((a, b) => a + b, 0) === 31, sizes.join(''))
  check('and no day gets more than two', Math.max(...sizes) === 2, `max ${Math.max(...sizes)}`)
  // "31 chapters in a 30-day month: put the fraction on the last day."
  check('the one leftover chapter falls on the last day',
    sizes.filter((n) => n === 2).length === 1 && sizes[29] === 2, sizes.lastIndexOf(2) + 1)
  const flat = slices.flat().map((r) => r.ch)
  check('in order, with nothing repeated or skipped',
    flat.join(',') === all.map((r) => r.ch).join(','))

  // A bigger remainder does spread, rather than saving up 95 chapters for New Year's Eve.
  const year = Array.from({ length: 365 }, (_, i) =>
    P.daySlice(P.scopeChapters({ kind: 'range', from: 'genesis', to: 'revelation' }, index), 365, i).length)
  check('a remainder with room to spread does spread',
    year.indexOf(4) === 3 && year.filter((n) => n === 4).length === 95,
    `first heavy day ${year.indexOf(4) + 1} of ${year.filter((n) => n === 4).length}`)

  // More days than chapters: a chapter is never split, so some days are empty.
  const jude = P.scopeChapters({ kind: 'books', slugs: ['jude'] }, index)
  const week = Array.from({ length: 7 }, (_, i) => P.daySlice(jude, 7, i))
  check('a one-chapter book over a week gives one day the chapter and six nothing',
    week.filter((s) => s.length).length === 1 && week.flat().length === 1,
    week.map((s) => s.length).join(''))
}

console.log('\nWhich day of the pass today is')
{
  const b = block({ startedAt: day(2026, 3, 1) })
  check('the day it starts is day 0', P.dayIndex(b, day(2026, 3, 1)) === 0)
  check('the day before it starts is nothing at all', P.dayIndex(b, day(2026, 2, 28)) === null)
  check('the last day of a 30-day pass is day 29', P.dayIndex(b, day(2026, 3, 30)) === 29)
  check('the day after that is nothing', P.dayIndex(b, day(2026, 3, 31)) === null)
  check('unless it repeats, when it is day 0 again',
    P.dayIndex({ ...b, repeat: true }, day(2026, 3, 31)) === 0)
  check('and day 40 of a repeating 30-day pass is day 10',
    P.dayIndex({ ...b, repeat: true }, day(2026, 4, 10)) === 10,
    `${P.dayIndex({ ...b, repeat: true }, day(2026, 4, 10))}`)

  // The clocks go forward in Europe on the last Sunday of March 2026, so 29 March is
  // 23 hours long. Truncating the division would put 30 March at day 28.
  check('a clock change does not lose a day', P.dayIndex(b, day(2026, 3, 30)) === 29)
  check('and the reader is on the same day whatever time of day they open it',
    P.dayIndex(b, new Date(2026, 2, 15, 0, 1).getTime()) === P.dayIndex(b, new Date(2026, 2, 15, 23, 59).getTime()))

  check('days left counts today', P.daysLeft(b, day(2026, 3, 1)) === 30)
  check('and runs out', P.daysLeft(b, day(2026, 3, 31)) === null)
}

console.log("\nA missed day changes nothing about today's reading")
{
  const b = block({ startedAt: day(2026, 3, 1) })
  const d5 = P.todaysReading(b, index, day(2026, 3, 6))
  check('day 5 is day 5 whether or not days 1 to 4 were read',
    d5.length === 1 && d5[0].slug === 'proverbs' && d5[0].ch === 6,
    d5.map((r) => `${r.slug}.${r.ch}`).join(' '))
  const last = P.todaysReading(b, index, day(2026, 3, 30))
  check('and the last day carries the two chapters the split gave it',
    last.length === 2 && last[0].ch === 30 && last[1].ch === 31,
    last.map((r) => r.ch).join(','))
  check('after the end there is nothing to read', P.todaysReading(b, index, day(2026, 4, 5)).length === 0)
  check('before the start there is nothing to read', P.todaysReading(b, index, day(2026, 2, 20)).length === 0)
}

console.log('\nProgress collapses a finished chapter to one key')
{
  const count = 6 // Proverbs 1 has 33; use a short one for the loop
  let p = {}
  for (let v = 1; v <= count - 1; v++) p = P.tickVerse(p, 'jude', 1, v, count)
  check('a part-read chapter holds one key per verse', Object.keys(p).length === count - 1, Object.keys(p).join(' '))
  check('and is not marked read', !P.chapterRead(p, 'jude', 1))
  check('but the verses in it are', P.isRead(p, 'jude', 1, 3))
  p = P.tickVerse(p, 'jude', 1, count, count)
  check('finishing it leaves exactly one key', Object.keys(p).length === 1 && p['jude.1'] === true, Object.keys(p).join(' '))
  check('every verse still reads as read', P.isRead(p, 'jude', 1, 1) && P.isRead(p, 'jude', 1, count))
  check('ticking again is a no-op', P.tickVerse(p, 'jude', 1, 2, count) === p)

  const t = P.tickChapter({}, 'james', 2, 26)
  check('a hand tick marks the chapter', P.chapterRead(t, 'james', 2))
  check('and untick removes it', !P.chapterRead(P.tickChapter(t, 'james', 2, 26), 'james', 2))
  const partial = P.tickVerse({}, 'james', 2, 4, 26)
  check('untick after a partial read clears the verse keys too',
    Object.keys(P.tickChapter(P.tickChapter(partial, 'james', 2, 26), 'james', 2, 26)).length === 0)

  const refs = [{ slug: 'jude', ch: 1 }, { slug: 'james', ch: 1 }]
  check('a day reports done over total', JSON.stringify(P.dayProgress(p, refs)) === '{"done":1,"total":2}',
    JSON.stringify(P.dayProgress(p, refs)))
}

console.log('\nBlocks keep a contiguous order')
{
  const bs = [0, 1, 2].map((i) => ({ ...block({}), id: `b${i}`, order: i }))
  const up = P.reorder(bs, 'b2', -1)
  check('moving up swaps with the neighbour', up.map((b) => b.id).join(',') === 'b0,b2,b1', up.map((b) => b.id).join(','))
  check('and rewrites order 0..n', up.map((b) => b.order).join(',') === '0,1,2')
  check('past the top is a no-op', P.reorder(bs, 'b0', -1) === bs)
  check('past the bottom is a no-op', P.reorder(bs, 'b2', 1) === bs)
  check('an unknown id is a no-op', P.reorder(bs, 'nope', 1) === bs)
}

console.log('\nA year of the whole Bible')
{
  // A plan schedules the union of every edition's chapters, not the KJV spine. The two
  // differ by one: the Masoretic Joel is four chapters where the KJV has three. Scoping
  // to the spine would mean a Hebrew reader is never scheduled to read Joel 4, and no
  // plan should be able to leave text unread. An English reader gets one day with an
  // absent-chapter marker instead, which the reader already knows how to draw.
  const spine = index.reduce((n, b) => n + b.spine.filter((c) => c > 0).length, 0)
  const union = index.reduce((n, b) => n + b.chapters.length, 0)
  check('the KJV canon is 1,189 chapters', spine === 1189, `${spine}`)
  check('and the corpus is one more, the Masoretic Joel 4', union === spine + 1, `${union}`)

  const b = block({ scope: { kind: 'range', from: 'genesis', to: 'revelation' }, days: 365, startedAt: day(2026, 1, 1) })
  const all = P.scopeChapters(b.scope, index)
  check('a whole-Bible scope is every one of them', all.length === union, `${all.length}`)
  check('Joel is scheduled to its fourth chapter',
    all.filter((r) => r.slug === 'joel').map((r) => r.ch).join(',') === '1,2,3,4')
  const sizes = Array.from({ length: 365 }, (_, i) => P.daySlice(all, 365, i).length)
  check('every day gets three or four', Math.min(...sizes) === 3 && Math.max(...sizes) === 4,
    `${Math.min(...sizes)}..${Math.max(...sizes)}`)
  check('and the year covers the corpus exactly', sizes.reduce((x, y) => x + y, 0) === union)
  check('day 1 opens at Genesis 1', P.todaysReading(b, index, day(2026, 1, 1))[0].slug === 'genesis')
  const end = P.todaysReading(b, index, day(2026, 12, 31))
  check('and the last day closes Revelation', end[end.length - 1].slug === 'revelation'
    && end[end.length - 1].ch === chaptersIn('revelation'),
    `${end[end.length - 1].slug} ${end[end.length - 1].ch}`)

  // The eight chapters the KJF export mis-filed used to land here as Ecclesiastes 13-20,
  // scheduling nine days of nothing for eleven of the twelve editions.
  const ecc = P.scopeChapters({ kind: 'books', slugs: ['ecclesiastes'] }, index)
  check('Ecclesiastes schedules twelve chapters, not twenty', ecc.length === 12, `${ecc.length}`)
}

rmSync(out, { force: true })
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
