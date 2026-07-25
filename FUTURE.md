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

## 2. Search

Full-text search across the three editions (verse + reference lookup, e.g.
"John 3:16" or a phrase). Could be a prebuilt index shipped with the data.

## 3. Cross-references & study notes

Tap a verse to see cross-references / a commentary layer. Would need a
cross-reference dataset (e.g. Treasury of Scripture Knowledge, public domain).

## 4. Export / sync notes & highlights

Currently annotations live in `localStorage` (per device/browser). Add export to
JSON/Markdown, and optionally sync across devices (would need a backend or a
user-provided store like a gist / file).

## 5. More editions

The data pipeline is edition-agnostic (`scripts/build-data.mjs`). Adding a
modern Japanese (口語訳) or another French/English edition is mostly sourcing +
a column. Useful for comparing the archaic text against a plain-language one.

## 6. Reading plans / daily verse

Scheduled reading plans, a "verse of the day", streaks — leaning on the existing
resume + deep-link machinery.
