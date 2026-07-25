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

## Frontend conventions

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
