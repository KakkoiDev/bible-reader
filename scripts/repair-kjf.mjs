// Repair the two KJF defects that can be fixed without guesswork.
//
// The KJF OSIS export this project was built from is damaged in several ways (see
// docs/KJF-DEFECTS.md). Only two of them have an unambiguous fix, and only those are
// applied here:
//
//   1. Revelation 5 is absent outright - no heading, no verses. Recovered from the
//      publisher's own KJF_WHOLE_BIBLE_2022.pdf, verified to split into exactly the
//      14 verses the chapter has, with the handful of extraction artefacts repaired.
//
//   2. John 18:24 and 1 Corinthians 7:6 were merged into the preceding verse, which
//      still carries the swallowed verse's number inline: verse 23 ends "...me
//      frappes-tu?, 24 Or Anne l'avait envoye...". Splitting at that marker needs no
//      outside text at all, so it is exact.
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

if (!changes.length) {
  console.log('kjf.md already repaired; nothing to do.')
} else {
  writeFileSync(FILE, lines.join('\n'))
  for (const c of changes) console.log(`  ${c}`)
  console.log('\ndata-src/kjf.md repaired. Run `npm run data` to rebuild.')
}
