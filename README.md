# Bible Reader — EN · 日本語 · FR

An offline-capable Progressive Web App to read the Bible in three parallel
editions:

- **English** — King James Version (1611)
- **日本語** — 文語訳聖書 (classical Japanese), rendered with **furigana**
- **Français** — Bible King James Française (KJF)

All three descend from the same textual tradition (Masoretic + Textus Receptus)
in a matching archaic register.

## Reading UX

- **Wide screens:** all three editions side by side.
- **Phone:** one language at a time. **Swipe left/right** cycles the ring
  **English → 日本語 → Français → English…** (or tap the tabs). Arrow keys
  ←/→ move between chapters.
- **Furigana** toggle for the Japanese text (readings come from the source
  edition, not machine-generated).
- Installable, works fully offline once a book has been opened.

## Develop

```bash
npm install
npm run data     # rebuild public/data/*.json from data-src/*.md
npm run dev      # dev server
npm run build    # data + typecheck + production build to dist/
npm run preview  # serve the production build
```

## Data

Source of truth is `data-src/{kjv,kjf,bungo}.md` (verse-numbered Markdown; the
Japanese uses the `{{漢字|かな}}` furigana marker). `scripts/build-data.mjs`
parses them into per-book JSON aligned by book/chapter/verse
(`public/data/<slug>.json` + `index.json`). `public/data` is generated and
git-ignored — run `npm run data` after editing the Markdown.

The app precaches only the app shell + book index; the 66 per-book JSON files
are cached on demand (CacheFirst) so first install stays light (~160 KB).

## Deploy

Static — deploy `dist/` to any host. For a subpath (e.g. GitHub Pages), set
`BASE_PATH=/your-subpath/ npm run build`.

## Verify

`node scripts/verify.mjs` drives the running preview build with Playwright
(desktop 3-column, mobile ring swipe, furigana toggle, chapter nav) and writes
screenshots to `/tmp/shots`.
