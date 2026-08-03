# Bible Reader — 11 parallel editions

An offline-capable Progressive Web App to read the Bible in parallel across eleven
editions, chosen to share a textual tradition (Masoretic + Textus Receptus) and,
where possible, an archaic register.

| Edition | Language | Coverage | Licence |
| --- | --- | --- | --- |
| **King James Version** (1611) | English | full | public domain |
| **文語訳聖書** (明治元訳・大正改訳), with **furigana** | 日本語 | full | public domain |
| **Bible King James Française** | Français | full | © Nadine L. Stratford, reproduced unmodified |
| **新標點和合本** (1919) | 繁體中文 | full | public domain |
| **新标点和合本** (1919) | 简体中文 | full | public domain |
| **Almeida, Atualizada** | Português | full | see note |
| **Reina-Valera** (1909) | Español | full | public domain |
| **Smith & Van Dyck** (1865) | العربية | full | public domain |
| **Ang Dating Biblia** (1905) | Tagalog | full | public domain |
| **Textus Receptus** | Ἑλληνική | **NT only** | public domain |
| **Westminster Leningrad Codex** | עברית | **OT only** | public domain |

The first three are visible by default; the other eight are opt-in per reader
(Settings → Languages & versions) and are downloaded only once switched on.

Every attribution is reproduced verbatim in the app under **Texts & licences**.

### Two caveats worth knowing

- **Greek and Hebrew each cover half the canon.** Greek is the New Testament source
  text, Hebrew the Old. The other half renders as the missing-verse placeholder.
- **Hebrew versification differs.** 137 of 929 Old Testament chapters have a
  different verse count, because the Hebrew and English traditions draw chapter
  boundaries differently (Numbers 16–17, Leviticus 5–6, Exodus 7–8 are the familiar
  cases). Rows are matched by verse *number*, so in those chapters the Hebrew column
  does not line up with the others.

## Reading UX

- **Wide screens:** every enabled edition side by side, with **verse alignment** on
  by default so each verse begins at the same height in all columns (CSS subgrid;
  toggleable in Settings).
- **Phone:** one edition at a time. Tap the tabs, or enable **swipe** to cycle them.
  Arrow keys ←/→ move between chapters, ↑/↓ between editions.
- **Justified text** is on by default, with hyphenation enabled alongside it so narrow
  columns don't open rivers of whitespace. Toggleable in Settings.
- **Flowing mode** drops verse numbers and renders a whole book as continuous
  paragraphs, with inline chapter markers so chapter navigation still lands visibly.
- **UI language** switches the chrome and displayed book names across all eleven
  languages, including right-to-left layout for Arabic and Hebrew.
- **Search** matches text in the enabled editions, and resolves references in *any*
  edition's language — `John 3:16`, `Mateo 15:3`, `マタイ15:3`, `馬太福音15:3`,
  `إنجيل يوحنا 3:16`, `תהלים 23` all work.
- **Older words** on the KJV: open a verse and any word whose meaning has moved since
  1611 is listed with its modern equivalent, so *charity → love* and *prevent → go
  before*. Tap for the note, or the arrow to hear either the old word or the new one.
  Only appears when a verse actually has one, which is most often not the case.
- **Concordance** on the KJV: open any verse and the panel lists its words with the
  Greek or Hebrew behind each one plus a transliteration; tap a word for its Strong's
  definition, or the speaker to hear the original pronounced (see the caveat below). KJV-only by design, because the tags are keyed to the KJV's own word
  choices, and the settings list badges it so you can see which edition has it.
- **The verse sheet adapts to the edition you tapped.** An edition that can explain
  its own words shows just itself plus that panel, since on a wide screen the others
  are already side by side. An edition with no such panel falls back to showing the
  verse in every visible edition, which is the next best help it can give.
- **Notes & highlights** with tags, sorting (book / created / updated / hand-arranged),
  a this-book filter, timestamps, JSON export/import, and a TSV export Anki imports
  natively.
- **Audio** reads a chapter aloud with word-level highlighting (EN/FR), optionally
  stopping at the chapter end rather than rolling into the next. It holds a screen
  wake lock while playing so an idle phone doesn't cut it off, and if you leave the
  app it offers to pick up from the verse it reached.
- **Links:** a verse link opens that verse; if it names an edition the recipient has
  hidden, it opens in their first visible one and says so. An **invite link** also
  carries the sender's edition set, and always asks before changing anything.

## Text sources, for audit

Every edition, where it came from, and how to re-fetch it. `scripts/sources.mjs` is
the machine-readable version; this table is the audit trail. Retrieved 2026-07-26.

| id | Source | Exact reference | Licence as stated by the source |
| --- | --- | --- | --- |
| `en` | hand-curated, in repo | `data-src/kjv.md` | public domain |
| `ja` | hand-curated, in repo | `data-src/bungo.md` | public domain |
| `jako` | getbible.net v2 | `https://api.getbible.net/v2/japkougo.json` | public domain in Japan (2006); US status uncertain, see FUTURE.md |
| `fr` | hand-curated, in repo | `data-src/kjf.md`, from the KJF OSIS 2022 export, partly repaired — see below | © Nadine L. Stratford |
| `zht` | eBible.org | `https://ebible.org/Scriptures/cmn-cu89t_usfm.zip` | public domain |
| `zhs` | eBible.org | `https://ebible.org/Scriptures/cmn-cu89s_usfm.zip` | public domain |
| `pt` | getbible.net v2 | `https://api.getbible.net/v2/almeida.json` | module claims GPL — see FUTURE.md |
| `es` | eBible.org | `https://ebible.org/Scriptures/spaRV1909_usfm.zip` | public domain |
| `ar` | eBible.org | `https://ebible.org/Scriptures/arb-vd_usfm.zip` | public domain |
| `tl` | getbible.net v2 | `https://api.getbible.net/v2/tagalog.json` | public domain |
| `el` | eBible.org | `https://ebible.org/Scriptures/grctr_usfm.zip` | public domain |
| `he` | eBible.org | `https://ebible.org/Scriptures/hebwlc_usfm.zip` | public domain |

Catalogues used to choose the above:
`https://ebible.org/Scriptures/translations.csv` and
`https://api.getbible.net/v2/translations.json`.

### Glossary data

Four sources, merged at build time, because there are different problems.

| Kind | Source | Count | Licence |
| --- | --- | --- | --- |
| False friends | hand-written, in repo (`data-src/glossary-en.json`) | 75 words | ours |
| Archaic words | Webster's Unabridged (1913), Gutenberg 29765 | 24 words | public domain |
| Grammar | hand-written, in repo (`data-src/kjv-grammar.json`) | 3 form-classes | ours |
| Proper names | Hitchcock's Bible Names Dictionary (1869), via CCEL | ~2,600 names | public domain |

**Grammar and names are separated on purpose.** Grammar forms (thou, hath, saith) recur on
most verses, so they are not marked inline and sit in a collapsed group. Name meanings are
Hitchcock's traditional 19th-century etymology, often fanciful, so each is labelled
"traditional (Hitchcock 1869)" and `data-src/names-overrides.json` can correct or drop any
entry. A capitalized word is glossed as a name only when its lower-cased form never appears
as a common word in the KJV, so God, Lord and sentence-initial words are excluded.

**Why the split.** A false friend is a word still in ordinary use whose KJV sense has
shifted: *charity*, *prevent*, *suffer*, *conversation*. No frequency filter can find
them, because they are all common words, and no dictionary can pick which sense a
translation meant. Those are written by hand. The other kind is a word a reader knows
they do not know, and Webster's 1913 marks obsolescence explicitly, so those are
derived.

**Webster's 1913, not GCIDE.** GCIDE is the same dictionary with GPL-licensed editorial
work layered on. The 1913 text itself is public domain, so it is taken straight from
Gutenberg, which keeps the data licences here clean.

**What deriving got wrong, and the tests that came out of it.** Webster's marks obsolete
*senses*, not obsolete words, so the first attempt produced `bottom → "An abyss"`,
`palm → "To handle"` and `suppose → "To put by fraud in the place of another"`: true of
1611, wrong for nearly every verse those words appear in. Three rules fixed it:

1. **Every sense obsolete, across every homograph block.** That is the difference
   between "this word is obsolete" and "this word once meant something else". The
   second kind is a false friend and belongs in the curated file.
2. **Skip words the KJV only capitalises.** Otherwise Webster's obsolete common nouns
   collide with names: Jordan became "a pot used by alchemists", Luke "moderately
   warm", Gog "ardent desire to go".
3. **Read the output.** 52 candidates survived the filters and still included `kettle`,
   `whale` and `inhabited` glossed as "uninhabited". `REVIEWED_OUT` in the script lists
   what was rejected and why.

**Frequency is a design constraint, not just a size one.** `saith` qualified on every
rule and was 1,261 occurrences, 46% of the whole glossary, to say "3d pers. sing. pres.
of Say". A panel that fires on half the Bible to tell a reader nothing is a panel they
learn to ignore, so it is excluded. An entry may also carry `refs`, a whitelist of
verses, for a word whose archaic sense is the exception: `let` means hinder in three
verses and allow in hundreds.

Matching is exact on a lower-cased word, with no stemming, because guessing that
`charities` is `charity` risks glossing a word the entry was not written about.

### Concordance data

Two more sources, fetched by `scripts/fetch-strongs.mjs` into `data-src/strongs.json`
and `data-src/lexicon.json`. Retrieved 2026-07-26.

| What | Source | Exact reference | Licence as stated by the source |
| --- | --- | --- | --- |
| KJV Strong's tags | eBible.org | `https://ebible.org/Scriptures/eng-kjv2006_usfm.zip` | public domain |
| Greek dictionary | openscriptures/strongs | `greek/strongs-greek-dictionary.js` | public domain |
| Hebrew dictionary | openscriptures/strongs | `hebrew/strongs-hebrew-dictionary.js` | public domain |

348,884 tagged words across 31,099 verses (227,196 Hebrew in the OT, 122,112 Greek in
the NT) and 14,197 dictionary entries.

The build splits this along the line the UI reads it at, which is what makes the panel
open instantly:

| File | Holds | Fetched |
| --- | --- | --- |
| `concordance/<slug>.json` | tags + lemma + transliteration | warmed when the book opens |
| `concordance/<slug>-def.json` | Strong's definitions | warmed when the panel first renders |

A single shared 2.1 MB dictionary used to load before the panel could render anything,
610 KB over the wire to show twelve words. Inlining just the two short fields each book
needs brings the first request to a median 18 KB. Duplicating lemmas across books costs
more on disk in total, which is the right trade when nothing is precached and no reader
ever downloads all 66. `-def` rather than `.def` in the filename so it still matches
the service worker's runtime-cache pattern and stays available offline.

### Hearing the original words

Each concordance row has a speaker button that speaks the lemma, at a capped rate,
because a lone Greek word at 1.25× is not learnable. Two honest limits:

- **The voices are modern.** The registry maps Greek to `el-GR` and Hebrew to
  `he-IL`, so a Greek lemma is read in *modern* Greek, not reconstructed Koine:
  ἀγάπη comes out closer to "aghapi" than "agapē". For Hebrew this matters less,
  since modern Israeli pronunciation is broadly what Biblical Hebrew is read with
  anyway. For Greek it is a real divergence, and no browser ships a Koine voice.
- **Most devices have neither voice installed.** The button is hidden when the device
  reports no voice for that script, the same rule the settings list uses, so it is
  never a control that does nothing.

### Changing the shape of a data file means changing its path

Learned the hard way. The runtime cache is **CacheFirst**, so whatever a reader
fetched once is what they keep being served. These files first shipped under
`data/strongs/` with a different shape, and readers who had already opened the panel
were then served the old shape indefinitely: the parse found no chapters, and because
"no words" was rendered the same as "nothing tagged", the panel silently disappeared
altogether.

Three rules came out of it, and they apply to any file under `public/data`:

1. **New shape, new path.** Hence `concordance/`. Never reuse a URL for different
   content under a CacheFirst policy.
2. **Version the payload and check it on read** (`SHAPE` in `src/lib/strongs.ts`), so
   the next mismatch is a visible error rather than an empty panel.
3. **Never render a failed load as an empty result.** `verseWords` returns `null` for
   "could not load" and `[]` for "this verse has no tags", and only the first shows a
   message. Its retry deletes the cache entry before refetching, because a CacheFirst
   entry cannot otherwise be got past from the page.

Three things worth knowing:

- **The tagged KJV does not replace ours.** `data-src/kjv.md` stays the displayed text,
  because its supplied-word marking is richer: 29,394 braces against eBible's 20,887
  `\add` spans. Only the tags are borrowed, and the panel lists words rather than
  annotating the rendered text, so the two texts never have to be aligned
  character-for-character.
- **`scripts/usfm.mjs` still strips `\w` tags** when building the reader's editions.
  That is deliberate: verse text should not carry markup no edition but the KJV has.
  The concordance script parses the same files separately.
- **The two dictionaries disagree on one field name.** Greek calls the transliteration
  `translit`, Hebrew calls it `xlit`. Reading only one silently drops 8,674 of them.

Nothing here is precached, and the precache is unchanged at 18,306 KiB. Both files are
fetched per book and then kept by the same runtime cache that holds the opt-in
editions. The book's cards are warmed on an idle callback once the chapter is up (and
skipped entirely when the KJV is hidden), so the first verse tap has nothing to wait
for.

### The KJF: provenance, and defects in the export

**Resolved: there is no separate "KJF 2006" file.** 2006 is the year the translation
was completed and forms part of the copyrighted work's name, not an edition label. The
note in `data-src/kjf.md` about the Song of Solomon being "repris de l'édition KJF
2006" does not point at a retrievable artifact.

- The Internet Archive item `KJF_Bible_King_James_fr` is labelled `date: 2006`, but its
  own SWORD config declares its upstream as
  `https://github.com/gratis-bible/bible/raw/master/fr/kjf.xml`, and it carries **the
  same defects** as the 2022 export plus no Song of Solomon at all.
- `http://www.kingjamesfrancaise.net/remository.html` is live and is the current
  official download index. (An earlier note here claimed the domain did not resolve;
  that was wrong, it had been probed over `https://` when it is served over `http://www.`.)
  It offers three files, none of them a 2006 edition. The only complete official
  artifact is `KJF_WHOLE_BIBLE_2022.pdf`.
- Full trail: `vendor/kjf/SOURCES.md`. `vendor/` is git-ignored: that PDF is
  copyrighted and this repository is public, so committing it would be redistribution
  rather than display with attribution.

The export is damaged in three distinct ways, characterised against the publisher's
PDF in **[`docs/KJF-DEFECTS.md`](docs/KJF-DEFECTS.md)** — written so it can be sent to
the publisher as-is. In summary, of the 41 verses the KJV carries and the export lacks:

| | |
| --- | --- |
| **Fixed here** (`scripts/repair-kjf.mjs`) | **16**: Revelation 5 entire (14 verses, recovered from the PDF), plus John 18:24 and 1 Corinthians 7:6, which were merged into the preceding verse with their number left inline as literal text. Revelation 4 is also de-interleaved: the export had folded chapters 4 and 5 under one heading with duplicate numbers, inflating Revelation 4 to 14 rows in every edition (no verses added, since the 11 true verses were present, only mislabelled) |
| Numbering runs one ahead after a dropped number | 19 — the text is present under the wrong number. Not fixed: it needs the PDF's wording, and that text layer inserts spaces inside words, so a wholesale substitution would trade a numbering defect for a text-quality one |
| Not defects at all | 3 — 1 Samuel 20, 1 Kings 22 and Revelation 12, where the KJF legitimately prints one fewer verse and the PDF agrees with the export |
| Unresolved | 3 — Numbers 13:9, Psalm 57:10, Jonah 2:3, in chapters too dense with numerals for a page to be split by verse number mechanically |

`scripts/repair-kjf.mjs` is idempotent and runs against `data-src/kjf.md`; re-run
`npm run data` after it.

## Frontend conventions

- **The design system is `design-system/`.** `DESIGN.md` is the short spec,
  `design-system/design-system.html` the full illustrated document (open it in a
  browser, no build step), and `tokens.css` the token set. `src/styles.css`
  `@import`s that token file, so it is a build input and not just documentation:
  changing a colour, radius, shadow or type size means changing it there. Two rules
  it is easy to break are **no emoji anywhere in the product** (`src/components/Icon.tsx`
  holds the whole icon set) and **44x44 minimum touch targets**.
- **No em-dash (`—`) in user-visible copy.** Use a period, a colon, or a middot
  (`·`). This covers the `src/lib/i18n.ts` string tables in all eleven languages,
  the `attribution` text in `src/lib/versions.ts`, JSX literals, `title` and
  `aria-label` attributes, and `index.html`. It does not apply to code comments or
  to the punctuation-folding map in `src/lib/search.ts`, where `—` is a character
  being normalised rather than copy. `scripts/verify10.mjs` asserts that no em-dash
  reaches the rendered DOM, so a regression fails the suite.
- **Per-script typography.** Each writing system gets its own text face and leading
  (see the "Per-script typography" block in `src/styles.css`). Adding an edition in
  a new script means adding a stack for it, not letting it fall back to the Latin
  serif.
- **Logical CSS properties.** Use `margin-inline-*`, `border-inline-*`,
  `inset-inline-*` and `text-align: start` rather than their physical equivalents:
  Arabic and Hebrew render right-to-left and the whole UI mirrors with them.

## Develop

```bash
npm install
npm run fetch     # download + normalise the 8 remote editions into data-src/
npm run strongs   # download the KJV concordance + dictionaries into data-src/
npm run glossary  # derive the archaic-word list from Webster's 1913 into data-src/
npm run data      # rebuild public/data/** from data-src/*.md
npm run dev       # dev server
npm run build     # data + typecheck + production build to dist/
npm run preview   # serve the production build
```

`npm run fetch` accepts ids to refresh just some editions: `npm run fetch -- ar el`.
`npm run strongs` is separate because it has its own two upstreams and only needs
re-running if the concordance sources change.

## Data

Source of truth is `data-src/<id>.md` — verse-numbered Markdown, one file per
edition (the Japanese uses the `{{漢字|かな}}` furigana marker, and supplied words
use `{braces}` in the KJV and Reina-Valera). `scripts/sources.mjs` is the manifest
that says where each edition comes from; changing an edition is a one-line edit
there plus `npm run fetch && npm run data`.

`scripts/build-data.mjs` emits:

- `public/data/index.json` — per book: slug, per-chapter verse counts, and the book's
  name in every edition's language (~21 KB)
- `public/data/<id>/<slug>.json` — one edition of one book
- `public/data/concordance/<slug>.json` — the KJV's tags, lemmas and transliterations
  for one book (median 18 KB gzipped)
- `public/data/concordance/<slug>-def.json` — the Strong's definitions for that book
- `public/data/glossary/<slug>.json` — older-word entries for one book (~0.1 MB for all
  66 together, so it is warmed alongside the concordance)

One file per edition per book is what lets the app download only the editions a
reader has enabled. `public/data` is generated and git-ignored — run `npm run data`
after editing the Markdown.

The service worker precaches the app shell, the index, and the three default
editions (~18 MB of 55 MB total). The other eight are cached on first read and stay
available offline from then on.

## Deploy

**Live: <https://kakkoidev.github.io/bible-reader/>**

### How it works

Deployment is automatic. **Pushing to `main` deploys.** There is no separate
release step, no `gh-pages` branch, and nothing to run by hand.

`.github/workflows/deploy.yml` does the whole thing:

1. `actions/checkout` — checks out the repo
2. `actions/setup-node` (Node 20) + `npm ci`
3. `npm run build` — which is `npm run data && tsc --noEmit && vite build`
4. `actions/upload-pages-artifact` with `dist/`
5. `actions/deploy-pages` — publishes to GitHub Pages

You can also trigger it by hand from the Actions tab (the workflow declares
`workflow_dispatch`), which is the way to redeploy without a code change.

Two details that matter:

- **`BASE_PATH` is set by the workflow**, to `/${{ github.event.repository.name }}/`
  — i.e. `/bible-reader/`. Project Pages sites are served from a subpath, and Vite
  needs `base` to match or every asset 404s. You never set this manually for CI.
- **CI runs `npm run build`, not `npm run fetch`.** The build only reads
  `data-src/*.md`, so **the source Markdown must be committed**. This is why those
  files are in git despite being ~50 MB: it keeps the build reproducible and offline,
  and means a deploy never depends on eBible.org or getbible.net being up.

### Checking a deploy

```bash
gh run list --limit 3                 # find the run
gh run watch <run-id> --exit-status   # follow it (build ~30s, deploy ~10s)
```

Then confirm the live site is really serving the new build — a green run only means
the artifact uploaded:

```bash
U=https://kakkoidev.github.io/bible-reader/
curl -s -o /dev/null -w '%{http_code}\n' $U
curl -s -o /dev/null -w '%{http_code}\n' ${U}data/index.json
curl -s -o /dev/null -w '%{http_code}\n' ${U}data/ar/matthew.json   # an opt-in edition
```

### Before you push

The subpath build is the one that ships, and it is *not* what `npm run build`
produces locally. Test it the way CI will:

```bash
BASE_PATH=/bible-reader/ npm run build
grep -o 'href="[^"]*favicon[^"]*"' dist/index.html   # expect /bible-reader/favicon.svg
```

Worth a glance at the build output too — `precache N entries (M KiB)` should stay
around **215 entries / ~18 MB**. If it jumps toward 55 MB, `workbox.globPatterns` in
`vite.config.ts` has started sweeping in the opt-in editions, which would force every
translation onto each install. Individual files must also stay under
`maximumFileSizeToCacheInBytes` (6 MB) or they are silently dropped from the precache.

### Deploying to something other than GitHub Pages

The output is plain static files. `dist/` can go to any host. Serve it from the
domain root and no `BASE_PATH` is needed; from a subpath, build with
`BASE_PATH=/your-subpath/ npm run build`.

One requirement: **missing files must return 404, not a fallback page.** The app
requests `data/<edition>/<book>.json` and treats a failure as "this edition has no
text here" (which is how Greek shows no Old Testament). A host that answers unknown
paths with `index.html` at status 200 will get HTML where JSON was expected — the app
degrades correctly, but the service worker would cache that HTML under a JSON URL.
GitHub Pages returns a proper 404, so this is fine as configured; `vite preview` does
*not*, which is a local-only quirk.

### How readers receive an update

The service worker serves the app shell from its precache, so a page that is already
open does not get a new build just because one was deployed. `src/main.tsx` listens
for `controllerchange` and reloads once when a newly deployed worker takes control, so
a reader **reloads once and the update lands a couple of seconds later**, on its own.

Without that listener it took *three* reloads to see a deploy, which is worth knowing
if the listener is ever removed or the registration is reworked. Reloading mid-read is
safe because the reader records its position continuously (`lastRead`) and restores it
on boot.

To verify the update path after changing anything about the service worker: build,
serve, load the page, rebuild with a visible change, then reload once and confirm the
change appears without a second manual reload.

### Known warning

The run logs a deprecation notice: `actions/checkout@v4`, `actions/setup-node@v4` and
`actions/upload-artifact@v4` target Node 20, which GitHub is retiring, so the runner
forces them onto Node 24. Deploys still succeed. Clearing it means bumping those
actions to `@v5` and `node-version` to `22`, which is worth doing before GitHub drops
the compatibility shim.

### Adding an edition later

1. Add an entry to `SOURCES` in `scripts/sources.mjs`.
2. `npm run fetch -- <id>` then `npm run data`, and skim the summary.
3. Add its `VersionMeta` to `src/lib/versions.ts` (`defaultOn: false` keeps installs
   small) and, optionally, a UI string table in `src/lib/i18n.ts`.
4. Commit `data-src/<id>.md` along with the code, or CI cannot build it.
5. Push. If the edition should be on by default, also add it to `globPatterns` in
   `vite.config.ts` so it is precached.

## Verify

Start the preview build, then run the Playwright suites:

```bash
npx vite preview --port 4178 --strictPort
node scripts/verify.mjs     # baseline: 3 columns, ring, swipe, furigana, chapter nav
node scripts/verify10.mjs   # 83 checks over the multi-edition/i18n/notes work
```

`verify10.mjs` covers header overflow at 360 px, localized titles, flow-mode chapter
navigation, verse alignment, RTL, partial-coverage editions, multilingual reference
parsing, hidden-edition link fallback, invite links, the verse sheet, selection
highlighting, notes, and the splash screen. Screenshots land in `/tmp/shots`.

`scripts/verify2.mjs`–`verify9.mjs` are one-off diagnostic scripts from earlier
sessions that target port 4180; some assert against UI that no longer exists.
