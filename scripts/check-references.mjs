/**
 * Replays the app's reference resolver over every book name in every language.
 *
 *   node scripts/check-references.mjs [repoPath]     (default: cwd)
 *
 * Needs only public/data/index.json — no browser, no server. Run `npm run build`
 * first if that file does not exist yet.
 *
 * `collapse` and the resolution order below mirror src/lib/search.ts. If that file
 * changes, change this too or the check silently stops testing the real thing. The
 * one part that is *not* copied is the ALIAS table: it is read out of search.ts, so
 * adding a short form there is tested here without touching this file.
 *
 * At 65e49e8 this printed 831/831 full names correct and four short-form failures,
 * all of them John: ヨハネ resolved to Revelation, 約翰 / 约翰 / Johano to nothing.
 * Four ALIAS entries fixed those; the probe list below is what holds them fixed.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.argv[2] || process.cwd();
const index = JSON.parse(fs.readFileSync(path.join(REPO, 'public/data/index.json'), 'utf8'));

/** The shipped ALIAS table, lifted out of the TypeScript rather than duplicated —
 *  a second copy here is exactly how a fix passes its own test and ships broken. */
function readAliases() {
  const src = fs.readFileSync(path.join(REPO, 'src/lib/search.ts'), 'utf8');
  const at = src.indexOf('const ALIAS');
  const open = src.indexOf('{', at);
  if (at < 0 || open < 0) throw new Error('ALIAS table not found in src/lib/search.ts');
  let depth = 0, end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  const body = src
    .slice(open, end + 1)
    .replace(/\/\/[^\n]*/g, '') // line comments; the table holds no string with //
    .replace(/,(\s*})/g, '$1');
  return new Function(`return (${body})`)();
}
const ALIAS = readAliases();

const collapse = (x) => x
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[ً-ْٰـ]/g, '')
  .replace(/[֑-ׇ]/g, '')
  .replace(/[آأإاٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/ς/g, 'σ')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

const lookup = new Map();
const put = (key, slug) => { const k = collapse(key); if (k && !lookup.has(k)) lookup.set(k, slug); };
for (const b of index) for (const name of Object.values(b.names)) if (name) put(name, b.slug);
// Aliases resolve via the English name, exactly as bookLookup() does, and the
// trailing digit that keeps `ac2` distinct from `ac` is stripped before registering.
{
  const bySlug = new Map(index.map((b) => [collapse(b.names.en), b.slug]));
  for (const [alias, en] of Object.entries(ALIAS)) {
    const slug = bySlug.get(collapse(en));
    if (slug) put(alias.replace(/\d$/, ''), slug);
  }
}

function resolveBook(raw) {
  const bookKey = collapse(raw);
  if (!bookKey) return null;
  let slug = lookup.get(bookKey);
  if (!slug) {
    const byPrefix = new Set();
    for (const [k, s2] of lookup) if (k.startsWith(bookKey)) byPrefix.add(s2);
    if (byPrefix.size === 1) slug = [...byPrefix][0];
  }
  if (!slug && bookKey.length >= 3) {
    let best = null, tied = false;
    for (const [k, s2] of lookup) {
      if (!k.includes(bookKey)) continue;
      if (!best || k.length < best.len) { best = { slug: s2, len: k.length }; tied = false; }
      else if (k.length === best.len && s2 !== best.slug) tied = true;
    }
    if (best && !tied) slug = best.slug;
  }
  return slug || null;
}

// 1. every full official name must resolve to its own book
let fail = 0, total = 0;
const langs = new Set();
for (const b of index) for (const k of Object.keys(b.names)) langs.add(k);
for (const b of index) {
  for (const [lang, name] of Object.entries(b.names)) {
    if (!name) continue;
    total++;
    const got = resolveBook(name);
    if (got !== b.slug) { fail++; console.log(`FULL-NAME MISS  ${lang.padEnd(5)} "${name}" → ${got} (want ${b.slug})`); }
  }
}
console.log(`\nFull official names: ${total - fail}/${total} resolve correctly.\n`);

// 2. the short forms a reader actually types
const probes = [
  ['ja', 'ヨハネ', 'john'], ['ja', 'マタイ', 'matthew'], ['ja', 'マルコ', 'mark'],
  ['ja', 'ルカ', 'luke'], ['ja', '創世記', 'genesis'], ['ja', '詩篇', 'psalms'],
  ['ja', 'ローマ', 'romans'], ['ja', '黙示録', 'revelation'], ['ja', 'ペテロ', '1-peter?'],
  ['zht', '約翰', 'john'], ['zht', '馬太', 'matthew'], ['zht', '啟示', 'revelation'],
  ['zhs', '约翰', 'john'], ['zhs', '马太', 'matthew'],
  ['ar', 'يوحنا', 'john'], ['ar', 'متى', 'matthew'],
  ['el', 'ΙΩΑΝΝΗΝ', 'john'], ['el', 'ΜΑΤΘΑΙΟΝ', 'matthew'],
  ['es', 'Juan', 'john'], ['fr', 'Jean', 'john'], ['pt', 'João', 'john'],
  ['en', 'John', 'john'], ['en', 'Rev', 'revelation'], ['en', 'Ps', 'psalms'],
  ['en', 'Gen', 'genesis'], ['en', 'Song', 'song-of-solomon?'],
  ['la', 'IOHANNEM', 'john'], ['eo', 'Johano', 'john'],
];
console.log('Short forms a reader would type:');
// A `want` ending in `?` is a form nobody has decided on — ペテロ is genuinely
// ambiguous between 1 and 2 Peter — so it is reported and not counted against.
for (const [lang, probe, want] of probes) {
  const got = resolveBook(probe);
  const optional = want.endsWith('?');
  const ok = got === want;
  if (!optional && !ok) fail++;
  const bad = optional ? '' : ok ? '  ok' : '  ✗ WRONG';
  console.log(`  ${lang.padEnd(5)} "${probe}"`.padEnd(26) + `→ ${String(got).padEnd(22)} want ${want}${bad}`);
}

// 3. why ヨハネ needed an alias: which ja names contain it, and their folded lengths.
// The substring fallback takes the *shortest* containing name, so without the alias
// the Apocalypse wins over the Gospel. Printed every run: it is the reason the alias
// exists, and the day a source renames a book is the day that reason changes.
console.log('\nWhy ヨハネ needs an alias — the substring fallback takes the shortest:');
for (const b of index) {
  const n = b.names.ja;
  if (n && collapse(n).includes(collapse('ヨハネ'))) console.log(`  ${collapse(n).length} chars  ${n.padEnd(12)} ${b.slug}`);
}

console.log('');
if (fail) {
  console.log(`${fail} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed');
