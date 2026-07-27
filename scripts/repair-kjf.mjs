// Repair the KJF defects that can be fixed without guesswork.
//
// The KJF OSIS export this project was built from is damaged in several ways (see
// docs/KJF-DEFECTS.md). Only these have an unambiguous fix, and only those are
// applied here:
//
//   1. Revelation 5 has no heading of its own. Reinserted from the publisher's own
//      KJF_WHOLE_BIBLE_2022.pdf, verified to split into exactly the 14 verses the
//      chapter has, with the handful of extraction artefacts repaired.
//
//   2. John 18:24 and 1 Corinthians 7:6 were merged into the preceding verse, which
//      still carries the swallowed verse's number inline: verse 23 ends "...me
//      frappes-tu?, 24 Or Anne l'avait envoye...". Splitting at that marker needs no
//      outside text at all, so it is exact.
//
//   3. Revelation 4 and 5 were interleaved under the single "### Revelation 4" heading
//      with duplicate numbers (1,1,...,11,11,12,13,14). De-interleaved back to the 11
//      true Revelation 4 verses; needs no outside text, since all eleven are already
//      present in the block and are only selected and renumbered.
//
// Everything else the export gets wrong is a numbering slip that would need the PDF's
// wording to resolve, and the PDF's text layer is too noisy to substitute wholesale.
// Those are documented rather than guessed at.
//
// Idempotent: re-running on an already-repaired file changes nothing.
// Run: node scripts/repair-kjf.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(__dirname, '../data-src/kjf.md')

// Revelation 5, from the publisher's 2022 whole-Bible PDF. Extraction inserts stray
// spaces inside words; the four it introduced here are repaired ("vingt -quatre",
// "d'entr e eux", "entendis -je", "as sis"). The wording is otherwise untouched.
const REVELATION_5 = [
  "Et je vis dans la main droite de celui qui était assis sur le trône un livre écrit à l’intérieur et au dos, scellé de sept sceaux.",
  "Et je vis un ange vigoureux proclamant d’une voix retentissante: Qui est digne d’ouvrir le livre, et d’en délier les sceaux?",
  "Et aucun homme, ni dans le ciel, ni sur la terre, ni sous la terre, ne fut capable d’ouvrir le livre, ni de le regarder.",
  "Et je pleurai beaucoup, parce qu’aucun homme ne fut trouvé digne d’ouvrir et de lire le livre, ni de le regarder.",
  "Et l’un des anciens me dit: Ne pleure pas: voici, le Lion de la tribu de Juda, la Racine de David, a prévalu pour ouvrir le livre, et pour en délier les sept sceaux.",
  "Et je regardai, et, voici, au milieu du trône et des quatre bêtes, et au milieu des anciens, se tenait un Agneau comme s’il venait d’être tué, ayant sept cornes et sept yeux, qui sont les sept Esprits de Dieu envoyés sur toute la terre.",
  "Et il vint et prit le livre de la main droite de celui qui était assis sur le trône.",
  "Et lorsqu’il eut pris le livre, les quatre bêtes et les vingt-quatre anciens tombèrent devant l’Agneau, ayant chacun d’entre eux des harpes, et des fioles d’or pleines de senteurs, lesquelles sont les prières des saints.",
  "Et ils chantèrent un cantique nouveau, disant: Tu es digne de prendre le livre, et d’en ouvrir les sceaux: car tu as été tué, et tu nous as rachetés à Dieu par ton sang, hors de chaque parenté, et langue, et peuple, et nation;",
  "Et nous as faits rois et prêtres à notre Dieu: et nous régnerons sur la terre.",
  "Et je regardai, et j’entendis la voix de beaucoup d’anges tout autour du trône et des bêtes et des anciens: et leur nombre était dix mille fois dix mille, et des milliers de milliers;",
  "Disant d’une voix retentissante: Digne est l’Agneau qui a été tué pour recevoir pouvoir, et richesse, et sagesse, et vigueur, et honneur, et gloire, et bénédiction.",
  "Et chaque créature qui est dans le ciel, sur la terre, et au-dessous de la terre, et celles qui sont dans la mer, et toutes celles qui sont en elles, les entendis-je disant: Bénédiction, et honneur, et gloire, et pouvoir, soient à celui qui est assis sur le trône, et à l’Agneau pour toujours et à jamais.",
  "Et les quatre bêtes dirent: Amen. Et les vingt-quatre anciens tombèrent et adorèrent celui qui vit pour toujours et à jamais.",
]

/** Verses whose text was merged into their predecessor, which still holds the marker. */
const MERGED = [
  { book: 'John', chapter: 18, verse: 24 },
  { book: '1 Corinthians', chapter: 7, verse: 6 },
]

let lines = readFileSync(FILE, 'utf8').split('\n')
const changes = []

// ---- 1. insert the missing Revelation 5 ----
if (!lines.some((l) => l.trim() === '### Revelation 5')) {
  const at = lines.findIndex((l) => l.trim() === '### Revelation 6')
  if (at < 0) throw new Error('cannot find "### Revelation 6" to insert before')
  const block = ['### Revelation 5', ...REVELATION_5.map((t, i) => `**${i + 1}** ${t}  `), '']
  lines = [...lines.slice(0, at), ...block, ...lines.slice(at)]
  changes.push(`inserted Revelation 5 (${REVELATION_5.length} verses)`)
}

// ---- 2. split the merged verses ----
for (const { book, chapter, verse } of MERGED) {
  const head = lines.findIndex((l) => l.trim() === `### ${book} ${chapter}`)
  if (head < 0) throw new Error(`cannot find "### ${book} ${chapter}"`)
  // bound the search to this chapter: the next "### " heading ends it, and verse
  // numbers repeat in every following chapter
  const end = lines.findIndex((l, i) => i > head && l.startsWith('### '))
  const stop = end < 0 ? lines.length : end
  const inChapter = (pred) => lines.findIndex((l, i) => i > head && i < stop && pred(l))
  const hostIdx = inChapter((l) => l.startsWith(`**${verse - 1}** `))
  if (hostIdx < 0) throw new Error(`cannot find verse ${verse - 1} of ${book} ${chapter}`)
  if (inChapter((l) => l.startsWith(`**${verse}** `)) >= 0) continue

  const host = lines[hostIdx]
  // the swallowed verse begins at its own number, left inline by the export
  const m = new RegExp(`^(\\*\\*${verse - 1}\\*\\*\\s+.*?)[,;]?\\s*${verse}\\s+(\\S.*)$`).exec(host.trimEnd())
  if (!m) throw new Error(`no inline "${verse}" marker inside ${book} ${chapter}:${verse - 1}`)
  lines[hostIdx] = `${m[1].trimEnd()}  `
  lines.splice(hostIdx + 1, 0, `**${verse}** ${m[2].trim()}  `)
  changes.push(`split ${book} ${chapter}:${verse - 1} to recover ${verse}`)
}

// ---- 3. de-interleave Revelation 4 ----
// The export folded Revelation 4 and 5 into one "### Revelation 4" block with
// duplicate numbers (1,1,2,2,...,11,11,12,13,14 - 25 lines). build-data keys verses
// by number (last wins), so the built chapter became a 14-verse scramble, and because
// the canonical verse count is the max across editions, that phantom 14 forced three
// empty placeholder rows onto Revelation 4 in *every* edition. All 11 true verses are
// present in the block, so this selects them - by a unique phrase, so no text is
// retyped - renumbers 1-11, and drops the interleaved Revelation 5, which already
// exists correctly below from step 1.
{
  const h4 = lines.findIndex((l) => l.trim() === '### Revelation 4')
  if (h4 < 0) throw new Error('cannot find "### Revelation 4"')
  const h5 = lines.findIndex((l, i) => i > h4 && l.startsWith('### '))
  // Revelation 5 must already be its own chapter (step 1) so it bounds the block.
  if (h5 < 0 || lines[h5].trim() !== '### Revelation 5')
    throw new Error('expected "### Revelation 5" after Revelation 4 (step 1 must run first)')

  const bodyIdx = []
  for (let i = h4 + 1; i < h5; i++) if (/^\*\*\d+\*\*/.test(lines[i].trim())) bodyIdx.push(i)
  const nums = bodyIdx.map((i) => Number(lines[i].trim().match(/^\*\*(\d+)\*\*/)[1]))
  const corrupt =
    new Set(nums).size !== nums.length || // a number appears twice
    bodyIdx.some((i) => /^\*\*\d+\*\*\s+Et je vis dans la main droite/.test(lines[i].trim())) // Rev 5:1 folded in

  if (corrupt) {
    // Fail loudly if the export's shape drifted from what was characterised.
    if (bodyIdx.length !== 25 || Math.max(...nums) !== 14)
      throw new Error(`unexpected Revelation 4 shape: ${bodyIdx.length} lines, max ${Math.max(...nums)}`)
    // A unique phrase from each of the 11 true Revelation 4 verses, in order, each
    // cross-checked against the KJV. The verse text is taken from the file, not retyped.
    const REVELATION_4 = [
      'Après cela je regardai',
      'Et immédiatement',
      'paraissait semblable à une pierre de jaspe',
      'il y avait vingt-quatre sièges',
      'Et du trône provenaient des éclairs',
      'il y avait une mer de verre',
      'Et la première bête était semblable à un lion',
      'Et les quatre bêtes avaient chacune six ailes',
      'Et quand ces bêtes rendent gloire',
      'Les vingt-quatre anciens tombent devant',
      'Tu es digne, Ô Seigneur, de recevoir gloire',
    ]
    const verses = REVELATION_4.map((sig) => {
      const hit = bodyIdx.filter((i) => lines[i].includes(sig))
      if (hit.length !== 1) throw new Error(`Revelation 4 phrase "${sig}" matched ${hit.length} lines`)
      return lines[hit[0]].trim().replace(/^\*\*\d+\*\*\s+/, '').trimEnd()
    })
    const block = ['### Revelation 4', ...verses.map((t, i) => `**${i + 1}** ${t}  `), '']
    lines = [...lines.slice(0, h4), ...block, ...lines.slice(h5)]
    changes.push('de-interleaved Revelation 4 (11 verses), removed interleaved Revelation 5')
  }
}

// ---- 4. de-duplicate single-verse displacements ----
// One verse's text was left under a duplicate number while its own number went missing
// (docs/KJF-DEFECTS.md section 6). Each fix names the displaced verse by a unique phrase,
// moves it to its true number (cross-checked against the KJV), and asserts the chapter is
// then a clean 1..N. Only single-verse displacements are handled here: the multi-verse
// numbering shifts (Psalms 60, 69, 92) and the superscription (Psalm 30) need the
// publisher's verse divisions and stay documented rather than guessed at.
const DISPLACED = [
  { book: 'Numbers', chapter: 13, sig: 'Palti, le fils de Raphu', to: 9 },
  { book: '1 Chronicles', chapter: 23, sig: 'plus à porter le tabernacle', to: 26 },
  { book: 'Psalms', chapter: 44, sig: 'Réveille-toi, pourquoi dors-tu', to: 23 },
  { book: 'Isaiah', chapter: 9, sig: 'aucune joie en leurs jeunes gens', to: 17, strip: '7 ' },
  { book: 'Jonah', chapter: 2, sig: 'au milieu des mers', to: 3 },
  { book: '2 Thessalonians', chapter: 2, sig: 'Maintenant que notre Seigneur', to: 16 },
]
for (const fix of DISPLACED) {
  const head = lines.findIndex((l) => l.trim() === `### ${fix.book} ${fix.chapter}`)
  if (head < 0) throw new Error(`cannot find "### ${fix.book} ${fix.chapter}"`)
  const end = lines.findIndex((l, i) => i > head && l.startsWith('### '))
  const stop = end < 0 ? lines.length : end
  const idx = []
  for (let i = head + 1; i < stop; i++) if (/^\*\*\d+\*\*/.test(lines[i].trim())) idx.push(i)
  const nums = idx.map((i) => Number(lines[i].trim().match(/^\*\*(\d+)\*\*/)[1]))
  const clean = new Set(nums).size === nums.length && nums.every((n, k) => n === k + 1)
  if (clean) continue // already repaired
  if (idx[idx.length - 1] - idx[0] + 1 !== idx.length)
    throw new Error(`${fix.book} ${fix.chapter}: non-verse lines inside the chapter`)
  const hit = idx.filter((i) => lines[i].includes(fix.sig))
  if (hit.length !== 1) throw new Error(`${fix.book} ${fix.chapter}: phrase "${fix.sig}" matched ${hit.length} lines`)
  const verses = idx.map((i) => {
    const m = lines[i].trim().match(/^\*\*(\d+)\*\*\s+(.*)$/)
    let n = Number(m[1])
    let t = m[2]
    if (i === hit[0]) {
      n = fix.to
      if (fix.strip) {
        if (!t.startsWith(fix.strip)) throw new Error(`${fix.book} ${fix.chapter}: expected stray "${fix.strip.trim()}"`)
        t = t.slice(fix.strip.length)
      }
    }
    return { n, t: t.replace(/\s+$/, '') }
  })
  verses.sort((a, b) => a.n - b.n)
  verses.forEach((v, k) => {
    if (v.n !== k + 1) throw new Error(`${fix.book} ${fix.chapter}: not a clean 1..N after fix (${v.n} at ${k + 1})`)
  })
  const block = verses.map((v) => `**${v.n}** ${v.t}  `)
  lines = [...lines.slice(0, idx[0]), ...block, ...lines.slice(idx[idx.length - 1] + 1)]
  changes.push(`de-duplicated ${fix.book} ${fix.chapter} (recovered verse ${fix.to})`)
}

if (!changes.length) {
  console.log('kjf.md already repaired; nothing to do.')
} else {
  writeFileSync(FILE, lines.join('\n'))
  for (const c of changes) console.log(`  ${c}`)
  console.log('\ndata-src/kjf.md repaired. Run `npm run data` to rebuild.')
}
