# Future improvements

Ideas parked for later, with enough context to pick up cold.

## 1. Reliable Japanese word-level audio highlighting (pre-generated audio + timestamps)

**Status:** Japanese currently highlights **per verse** during audio. English and
French highlight **per word**.

**Why JA is only per-verse.** Word highlighting relies on the browser's
`SpeechSynthesisUtterance` `boundary` events ("I'm now at character X"). Two
problems make this unreliable for Japanese:

1. **Sparse/absent boundaries.** Most JA voices shipped with browsers/OSes emit
   `boundary` events rarely or not at all, so there's nothing to follow — words
   get skipped. This is the voice's behavior; our code can't force events.
2. **Kana vs. kanji index mismatch.** We feed the voice the *kana readings*
   (from furigana) so classical 文語 is pronounced correctly, while the screen
   shows *kanji*. A `boundary` charIndex points into the kana string, not the
   displayed kanji. We built (and removed) a map to translate kana→kanji offsets
   — it works, but it's useless without problem 1's events.

**The real fix.** Stop depending on live `boundary` events. **Pre-generate** the
audio offline with a tool that also emits **word timings**, then during playback
drive the highlight from a stopwatch (`audio.currentTime`) instead of the voice.
Works identically on every device.

- **Generator:** `edge-tts` (Microsoft Edge neural voices; same tool jpanki uses)
  emits `WordBoundary` metadata (offset + duration per word) alongside the MP3.
  Because *we* control the input text (kana), we can align those word offsets to
  our `{{kanji|kana}}` chunks at build time and store a per-verse timing list:
  `[{ tStartMs, chunkBaseStart, chunkBaseEnd }]`.
- **Storage/format:** one MP3 + one JSON timing file per verse (or per chapter).
  Bible-scale is large (~31k verses × languages), so this needs **off-Pages
  hosting** (Cloudflare R2 / S3), not the GitHub Pages repo. Start with **one
  book** (or one language) to prove the pipeline before scaling.
- **Playback:** `<audio>` element + a `timeupdate`/rAF loop that finds the active
  timing entry and calls the existing `setWordHighlight(el, start, end)` (offsets
  are already in displayed-base coordinates, furigana-independent).
- **Bonus:** consistent neural voice quality and gender across all devices (the
  current runtime male/female pick is best-effort name-matching and device-dependent).

Relevant existing code: `src/lib/tts.ts` (would gain a "pre-generated" mode),
`src/lib/highlight.ts` (`setWordHighlight` reused as-is).

## 2. Search — *shipped*

Full-text search plus reference lookup in any edition's language. The index is
built lazily, per edition, over only the editions a reader has enabled
(`src/lib/search.ts`) — indexing all eleven at once would be ~340k verse records.

Still open: a **prebuilt** index shipped with the data, which would remove the
first-search delay on large enabled sets.

## 3. Cross-references & study notes

Tap a verse to see cross-references / a commentary layer. Would need a
cross-reference dataset (e.g. Treasury of Scripture Knowledge, public domain).

## 4. Export / sync notes & highlights

Currently annotations live in `localStorage` (per device/browser). Add export to
JSON/Markdown, and optionally sync across devices (would need a backend or a
user-provided store like a gist / file).

## 5. More editions — *shipped (eleven)*

The pipeline is driven by a manifest (`scripts/sources.mjs`), so adding an edition
is one entry plus `npm run fetch && npm run data`. Eleven ship today.

Still worth adding:

- **口語訳** (modern Japanese) to read against the 文語訳 — the plain-language
  contrast the original note wanted.
- **文理和合譯本**, the Classical Chinese Union Version. It is the truest register
  match to the KJV and 文語訳 (the 和合本 we ship is the vernacular 1919 text), and
  it is public domain — getbible id `chiunl`.
- A **Septuagint** to give the Greek column an Old Testament (`grclxx` on eBible is
  public domain), which would also make the Greek edition full-canon.

### Portuguese licence follow-up

The Almeida Atualizada module we use claims GPL for a 1959 text normally held under
Sociedade Bíblica do Brasil copyright. This was raised and accepted at the time, but
it is the one edition whose licence is not clean. Swapping it is a one-line change in
`scripts/sources.mjs` — candidates are `livretr` (Bíblia Livre – Textus Receptus,
CC BY 3.0 BR, and TR-based like the KJV) or eBible's `porbrbsl` (public domain).

## 6. Reading plans / daily verse

Scheduled reading plans, a "verse of the day", streaks — leaning on the existing
resume + deep-link machinery.

## 7. Native review of the UI translations

`src/lib/i18n.ts` carries ~95 chrome strings in eleven languages. English, French
and Japanese are first-class. The other eight — 繁體/简体中文, Português, Español,
العربية, Tagalog, Ελληνικά, עברית — are serviceable but were not written by native
speakers, and should get a review pass before this is promoted anywhere public.
Missing keys fall back to English per key, so a partial correction is safe to land.

## 8. Verse-level alignment for Hebrew

Rows are matched by verse number, which is wrong for the 137 Old Testament chapters
where the Hebrew and English chapter divisions differ (see README). A reference
mapping table (Hebrew ↔ KJV versification) would let the Hebrew column line up with
the rest instead of drifting. The data to build one is in the WLC itself; the work is
the mapping, not the plumbing.

## 9. Retire or rewrite the old verify scripts

`scripts/verify2.mjs`–`verify9.mjs` are diagnostic one-offs from earlier sessions.
They target port 4180 and several assert against removed UI (a header `.furi`
checkbox) or a superseded architecture (`CSS.highlights.get('hl-yellow')`, from
before persistent highlights became DOM spans). Their still-valid coverage —
export/import round trip, continuous playback, verse-sheet behaviour — is worth
folding into `verify10.mjs` and deleting the rest.
