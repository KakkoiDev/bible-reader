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

**This is also the only route to background audio.** Web Speech cannot be kept alive
in a backgrounded tab on any platform — iOS suspends it outright — so what ships
today is a screen wake lock during playback plus an offer to resume from the verse
it reached (`App.tsx`). Pre-generated files played through an `<audio>` element are
what the OS treats as real media, which is also the point at which `MediaMetadata`
and lock-screen controls stop being a hack: without a playing media element they
show nothing, and a silent-carrier workaround would be needed to fake it.

## 2. Search — *shipped*

Full-text search plus reference lookup in any edition's language. The index is
built lazily, per edition, over only the editions a reader has enabled
(`src/lib/search.ts`) — indexing all eleven at once would be ~340k verse records.

**Multi-word matching shipped too.** A verse matches when it contains every term in
any order; a quoted run is an exact phrase. Terms match from the start of a word, so
`believ` still finds `believeth` but `am` no longer matches f-i-rm-am-ent. CJK and
Hebrew/Arabic opt out of that anchoring, the first for having no word boundaries, the
second because they attach particles to the front of a word.

Still open:

- A **prebuilt** index shipped with the data, which would remove the first-search
  delay on large enabled sets.
- **Arabic and Hebrew full-text search is weak** against those vocalised editions,
  because readers type unvocalised. `collapse` strips the diacritics for book-name
  lookup, but `foldText` cannot: it has to be length-preserving so `Hit.ranges` can
  index the unfolded text for the snippet. Fixing it needs a folded→original offset
  map, the same shape of problem as the kana→kanji map in §1. Deliberately deferred.

## 3. Cross-references & study notes — *partly shipped*

**Shipped: a word-level concordance on the KJV.** Opening a verse lists its words
with the Greek or Hebrew behind each, from the tags eBible's KJV carries and the
openscriptures dictionaries (see README). KJV-only, because the tags are keyed to
the KJV's own word choices.

Still open, and genuinely separate from the above:

- **Verse-level cross-references** — "see also" links between passages. Needs an
  external dataset (e.g. Treasury of Scripture Knowledge, public domain); nothing in
  the concordance data implies them.
- **Concordance search**: the tags make "every verse using G26" answerable, which is
  the obvious next step now that the data is loaded. It needs a reverse index built
  per book, or a prebuilt one shipped alongside the tags.
- Tagging is **KJV-only**. Extending Strong's itself would mean a tagged source per
  edition, which mostly do not exist. The more promising direction is §11.

## 4. Export / sync notes & highlights — *partly shipped*

JSON export/import shipped earlier; a **TSV export for Anki** shipped with the
concordance (Settings → Notes & data → Anki). One card per note, tags carried over
in Anki's own tag column.

**There is deliberately no "sync to Anki" button.** No cross-platform way exists for
a web page to add a card directly: AnkiDroid's integration is an Android app-to-app
ContentProvider, and AnkiConnect is desktop-only over `http://localhost`, which an
https page cannot reach. Takoboto, which does have the Android integration, ships a
CSV export for exactly this reason. The file is the portable route, so the button
says what it does.

Still open: sync across devices, which needs a backend or a user-provided store
(a gist, a file in their own cloud).

## 5. More editions — *shipped (eleven)*

The pipeline is driven by a manifest (`scripts/sources.mjs`), so adding an edition
is one entry plus `npm run fetch && npm run data`. Eleven ship today.

Still worth adding:

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

### 口語訳 licence and corruption vetting

Added as `jako` (default off): the Colloquial Japanese Bible (口語訳, 1954/1955), from
getbible module `japkougo`, the plain-language contrast to the 文語訳 the original note
wanted. It is public domain in Japan since 2006 (the Japan Bible Society held it as a
corporate work, 50-year term), but its US copyright has not expired, and this app
deploys to US-hosted GitHub Pages. That is a real, documented exposure, the same
category as the Almeida note above; it ships default-off and the risk is recorded here
rather than hidden.

Vetted against the two readings a KJV reader asks about, from the built text:

- Matthew 5:32 keeps the fornication/adultery distinction: the divorce exception is
  不品行 (fuhinkou), distinct from 姦淫 (kan'in, adultery) in 5:27-28. Not flattened.
- 1 John 5:7 is the short reading (あかしをするものが、三つある), without the
  heavenly-witnesses clause. Expected of a critical-text version, and the same reading
  the 文語訳 has always shipped. This is a mixed-tradition corpus, not a uniform one.

Furigana is not in the source (no public-domain 口語訳 ships readings; the only ruby
edition is a paid Japan Bible Society e-book). It is generated by
`scripts/furigana-jako.mjs` with kuroshiro over kuromoji's IPADIC and written as the
same {{漢字|かな}} markup the 文語訳 uses. Readings are a pronunciation aid: reliable for
common vocabulary, but homographs and rare proper nouns will sometimes be wrong. The
hand-curated 文語訳 furigana stays the trustworthy one; a curated pass over jako, or a
better source, could replace the generated readings later.

## 6. Reading plans / daily verse

Scheduled reading plans, a "verse of the day" — leaning on the existing resume +
deep-link machinery.

**Not streaks, and not a percentage-read figure.** Both were considered and dropped:
coverage numbers and streaks invite a "you are behind" reading, and this reader is
not trying to pressure anyone. `lastRead` already does the useful, pressure-free
version by putting you back where you were.

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

## 10. Print / PDF

Parked after looking into it. Flow mode would be easy — it is already one linear
column, so `break-inside: avoid` and orphan/widow control would mostly do it. The
parallel view is the problem: `.cols.many` is `overflow-x: auto`, which print clips
rather than paginating, and the alignment depends on subgrid, whose behaviour across
a page break is essentially undefined in print engines.

A library exists (**paged.js**, which polyfills CSS paged media) but it reflows the
DOM into page boxes and fights CSS grid, so it would likely break the alignment that
makes a parallel printout worth having.

The route that would work needs no library: render a print-only `<table>` from the
same chapter data, one `<tr>` per verse and one `<td>` per edition, with `<thead>`
repeating the edition names on each page. Tables are the one layout primitive every
print engine fragments reliably, and verse-per-row is the alignment you want anyway.
Highlights would need `print-color-adjust: exact`, and more than three editions wants
landscape.

Note `playwright` is already a devDependency, so build-time PDFs via `page.pdf()` are
close to free if the need is printable sheets rather than an in-app button.

## 11. Modernising dictionary for archaic vocabulary — *shipped for the KJV*

The KJV half is built: 64 hand-written false friends plus 24 derived from Webster's
1913, shown as an "Older words" panel above the concordance. See the README for the
sourcing rules and the mistakes that produced them.

Still open:

- **The 文語訳 and the KJF have no glossary.** `WORD_PANEL` in Sheets.tsx is the switch;
  adding either needs only its data. Japanese is the harder one and still wants a small
  hand-authored table of classical auxiliaries (けり/たり/なり/ん) anchored to the
  existing `{{漢字|かな}}` chunks, since its problem is grammar rather than vocabulary.
- **The curated list is 64 words and could be several hundred.** It was kept to what
  could be stated confidently; the file's own header says why. Multi-word entries
  (`by and by`, `to wit`) are not supported yet, since matching is single-token.
- **Derived recall is low.** 24 words from 113,355 Webster entries, because the filters
  are deliberately strict. Words like `froward`, `peradventure` and `twain` had to be
  written by hand instead. A licensed modern frequency list would let the filters relax
  safely; the one obvious candidate states no licence, which is why it was not used.

### Original plan, for context

The concordance turned out to be a general mechanism: a per-edition, per-word panel
with a word list and a definition a tap away. `WORD_PANEL` in `src/components/Sheets.tsx`
is the switch, and the verse sheet already behaves correctly for editions that are not
in it (it falls back to comparing translations).

The reading problem it could solve is bigger than the concordance's. All three default
editions are deliberately archaic, and that is exactly what makes them hard:

- **KJV** — *wot*, *prevent*, *charity*, *conversation*, *let* (meaning hinder), plus
  thee/thou/ye and the -eth/-est verb forms. The false friends matter most: a word
  that still exists but has changed sense is one a reader will silently misread.
- **文語訳** — classical grammar and vocabulary (けり/たり/なり, ん as negation), which
  furigana already helps with for *reading* but not for *meaning*.
- **KJF** — the least affected, and worth checking before assuming it needs one.

What makes this tractable is that it does not need a full dictionary: it needs the
*divergences*. A word only earns an entry when its modern sense differs from its sense
in the text. That is a few hundred entries for the KJV, not tens of thousands, and it
is the same shape as the concordance data: `{ code → entry }` plus per-verse word
positions.

Open questions, roughly in the order they need answering:

1. **Sourcing.** Is there an openly licensed archaic-KJV glossary, or does the word
   list get derived (e.g. words in the KJV absent from a modern frequency list) and
   the senses written by hand? Deriving the list is cheap; writing senses is not, and
   this is a place where being wrong is worse than being absent.
2. **Which occurrences.** *Let* is only interesting where it means hinder. Tagging
   every occurrence would train readers to ignore the panel, so entries may need to
   be per-verse, not per-word.
3. **Japanese needs its own approach entirely.** The unit is not a word but a
   grammatical form, and the existing `{{漢字|かな}}` chunks are the natural anchor.
4. **Same two-level split** as the concordance, for the same reason: word list in the
   card file, prose in the `-def` file.

Worth noting the two panels answer different questions and could coexist on the KJV:
Strong's says what the Greek was, a modernising gloss says what the English means now.

**Pronunciation is already wired.** `speakOne` in `src/lib/tts.ts` speaks one short
string at a capped rate, and the concordance rows use it. An archaic-word panel gets
the same button for free, and should offer it on *both* sides of an entry: the archaic
word and its modern equivalent, which is the pairing that makes it stick. English is
also the one script where the voice is genuinely good and near-universally installed,
unlike the Greek and Hebrew caveats in the README.

For the 文語訳 the reading is already known from the furigana chunks, so its panel can
speak the kana rather than depending on a voice guessing at classical kanji, which is
the same trick `speechText` already uses for chapter playback.
