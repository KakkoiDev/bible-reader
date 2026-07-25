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
- **Flowing mode** drops verse numbers and renders a whole book as continuous
  paragraphs, with inline chapter markers so chapter navigation still lands visibly.
- **UI language** switches the chrome and displayed book names across all eleven
  languages, including right-to-left layout for Arabic and Hebrew.
- **Search** matches text in the enabled editions, and resolves references in *any*
  edition's language — `John 3:16`, `Mateo 15:3`, `マタイ15:3`, `馬太福音15:3`,
  `إنجيل يوحنا 3:16`, `תהלים 23` all work.
- **Notes & highlights** with tags, sorting (book / created / updated / hand-arranged),
  a this-book filter, timestamps, and JSON export/import.
- **Audio** reads a chapter aloud with word-level highlighting (EN/FR), optionally
  stopping at the chapter end rather than rolling into the next.
- **Links:** a verse link opens that verse; if it names an edition the recipient has
  hidden, it opens in their first visible one and says so. An **invite link** also
  carries the sender's edition set, and always asks before changing anything.

## Develop

```bash
npm install
npm run fetch     # download + normalise the 8 remote editions into data-src/
npm run data      # rebuild public/data/** from data-src/*.md
npm run dev       # dev server
npm run build     # data + typecheck + production build to dist/
npm run preview   # serve the production build
```

`npm run fetch` accepts ids to refresh just some editions: `npm run fetch -- ar el`.

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

One file per edition per book is what lets the app download only the editions a
reader has enabled. `public/data` is generated and git-ignored — run `npm run data`
after editing the Markdown.

The service worker precaches the app shell, the index, and the three default
editions (~18 MB of 55 MB total). The other eight are cached on first read and stay
available offline from then on.

## Deploy

Static — deploy `dist/` to any host. For a subpath (e.g. GitHub Pages), set
`BASE_PATH=/your-subpath/ npm run build`.

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
