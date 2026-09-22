# Bible Reader — design system

The full document lives in `design-system/design-system.html` (open it in a
browser; no build step). This file is the short version for code review.

## Principles

1. **The text is the only permanent element.** Every other pixel justifies
   itself or disappears on scroll.
2. **44pt or it doesn't ship.** The 34pt header buttons are the one exception,
   and only because the whole bar is the target.
3. **Cheap actions stay on the page.** If it completes in one tap, it never
   opens a sheet.
4. **A control states its contents** — "Concordance · Greek · 6 tagged words",
   not a caret.
5. **What you see is what you send.** Share previews are literal, edition order
   included.
6. **Nothing moves under a finger.** Selection tints; it never reflows.

## Containers

| Container | Use for | Rules |
|---|---|---|
| Inline bar | Acting on the verse in front of you | Never scrolls, never covers |
| Bottom sheet | Reference, or a short decision | Max 92% height, drag to dismiss, pinned header + footer, only the middle scrolls |
| Full page | You have left the passage | Search, Saved, Settings, Editions |
| Floating pill | One recurring action | Over a fade, hidden while scrolling |

Never: tab bars, FAB clusters, blocking toasts, modals over modals.

## Header

Three states, one element — there is never a second bar.

- **Full** (56pt): reference + edition chip + search + menu. At rest, top of chapter.
- **Condensed** (34pt): eyebrow reference + two 34px buttons. While reading.
- **Listening** (36pt): condensed, plus time remaining, pause, stop and a 2px
  progress hairline.

## Verse interaction

Tap a verse → inline bar (highlight · note · bookmark · share · listen · Study),
six equal cells with a label under each glyph. Only **Study** opens the sheet. The
bar is full at six controls on a 390pt screen; a seventh needs a redesign, not a
squeeze. Highlight and note are adjacent because they are the two everyday actions,
and they carry the two glyphs most easily confused — see *Departures*.

**Listen** reads that verse and stops, because a control named for a verse should
mean a verse. Reading *on* from it is a different size of thing, and it is an
**offer, not a control**: once a single verse has finished, a seven-second *Read on*
starts at the verse after the one just read. A row in the Study sheet was built for
this first and removed — putting it two taps behind a sheet meant it could only be
found by someone already looking for it, and the reader who wants it is the one
already listening, not the one studying. When a control is worth less than the space
it would take, an offer at the right moment is the cheaper answer than a worse home.

## Type

Scripture is serif, interface is system sans; never mixed in one run.
Per-script faces are preserved (mincho, Songti, naskh) — a translation should
look like its own tradition. Reading default: 18–19px / 1.85–1.9, 16pt margins,
≈45 characters a line.

## Colour

See `tokens.css`. Two notes that are easy to get wrong:

- `--muted` is **#666c7d** (5.24:1). The older #8a8f9c measured 3.05:1 and
  fails AA at caption sizes.
- Highlights are tints *behind a run of text* — never boxes, never borders, and
  grey is never a highlight colour (it means "already read" during playback).

## Departures made while implementing this

Recorded here so the document and the code do not tell different stories.

- **`settings` is redrawn, not harvested.** The document draws it as a circle of
  radius 3.2 with eight radial ticks, which is a sun. Spokes projecting from a
  smooth circle read as a ship's wheel, so the teeth are bumps on the body
  outline: root 7, tip 9.4, hub 3. **Six teeth, not eight** - it is drawn at
  20px, and eight run together at that size. Every other icon in the set is the
  document's own artwork.
- **A 39th icon, `stop`.** The icon set ships `play` and `pause`, but the
  Listening header above is described as carrying pause, time remaining *and*
  stop. This reader stops rather than pauses (playback resets to the start of
  the verse), so `pause` would have named something the button does not do.
  Drawn to match `pause`: same 14-tall body, same 1px rounded corner.
- **Pills and chips stay at 32-36, not 44.** Principle 2 says 44 with one
  exception, but the atom sheet itself draws every chip and status pill at
  32-36 in the same panel. The artwork is the more specific instruction, so
  `.chip` is 36 and the playback pill is 36. The controls that grew to 44 are
  the buttons, fields, icon buttons, swatches, grid cells and list rows.
- **A segmented cell is 38.** That is the 44 track minus its own 3px padding,
  which is the geometry drawn above. The track is the target.
- **The verse number is a label, not a control.** It could not grow to a 44pt
  target — verse rows sit about 34px apart, so a 44-tall hit area would overlap
  the numbers above and below — and as a 24x29 copy-link button beside a row that
  opens the action bar it put two different outcomes across a 24px boundary,
  thirty-one times a chapter. It also put every verse of Psalm 119 in the tab
  order, multiplied by every visible edition, ahead of the chapter-end row. The
  row is the target now and copy link is a labelled entry in the bar's share view,
  which is where the day's reading has always drawn its numbers.
- **The verse action bar is six equal labelled cells, and never wraps.** The
  document draws it as a flex row of five icons and one labelled button under the
  tapped verse, and says the row is full at six controls on a 390pt screen. Sized
  that way it measured 355 against the 354 the reader's 18px margins leave, so at
  exactly 390 it wrapped and stranded Study on a line of its own — and five of the
  six controls said nothing, with `highlight` and `note` reading as the same mark
  three cells apart. The cells are `flex: 1 1 0` now, each with its label under its
  glyph at 9px, and the row cannot wrap: its height is then the same in a 300px
  column as on a phone, so opening the bar always moves the text below it by the
  same amount. An edition with no voice keeps its Listen cell, disabled, rather
  than closing the gap and moving the other five.
- **Highlight and share swap the row in place.** The document says share holds
  three things and highlight applies a colour, but draws neither sub-row. Both
  replace the row's contents with a back control and their own actions, so
  neither opens a sheet: only Study does.
- **`.gloss-mark` is left as text.** A glossed word is a word in the measure;
  the atom sheet lists it under text atoms, not controls.
- **A missing verse is two tags, and an unused row is not drawn.** The document
  has no atom for a verse number with no text behind it; the reader used to put
  a bare `·` there. It is now `.vgap`, 12px UI type on a dotted rule, reading
  *not in this edition* when the KJV carries the verse and *numbered
  differently here*, in italic, when the number belongs to another tradition's
  counting. The two are told apart by `index.json`'s new `spine[]`, the KJV's
  own verse ceiling, against the existing `chapters[]`, which is the ceiling
  across every edition. A row no displayed edition has text for is dropped
  before render, so the Hebrew's extra Psalms rows only appear while the Hebrew
  column is on screen.
- **The chapter-end row also closes a flow-mode book, and All books borrows
  `study`.** The document draws the row under a chapter of John, so the rule
  reads "End of John 3" and Continue reads "John 4". Flow mode renders a whole
  book, so the same row sits under all sixteen chapters of Mark and both labels
  follow the scroll position: at the foot of the page the rule reads "End of
  Mark 16" and Continue reads "Luke 1". That is the only place in the reader
  where the next book is named. The document's All books glyph is the two-page
  spread already in the icon set as `study`, so it is reused rather than drawn
  a second time.
- **A run of omitted chapters is one marker in the flow.** The document has no
  atom for it, because it does not know the corpus has holes. `.fgap` is
  interface type between two hairlines, in the interface language rather than
  the edition's, and consecutive omissions collapse: the 口語訳's Psalms
  130-139 is one line, not ten. Reading a book the edition does not carry at
  all shows the coverage note instead, the same one the column view uses.
- **The calendar is the 40th icon, and it is not an emoji.** The reading plan was
  asked for as "a calendar emoji next to bookmarks". This document's first rule
  about icons is that no emoji enters the page, so it is drawn in the set's
  idiom: 1.7 stroke, two binding ticks, one filled day. It sits third in the
  header tools, between Saved and Settings.
- **The planner and the patchwork reader have no atoms in this document.** Both
  are new surfaces, so what shipped is an interpretation and the next pass should
  treat it as a first draft, not as the design. A plan block is a `--sunken` card
  at `--r-card` carrying a name, what it covers, today's reference, a progress
  line and two actions; today's reading is at the top of the card because it is
  the only part most readers ever need. The patchwork reader is the reader's own
  two modes over a synthetic chapter list, flowing paragraphs or numbered verses
  as the setting says, with a `--fs-eyebrow` uppercase muted book heading at each
  seam and a pill tick under each chapter. In verse mode the chapter badge takes
  the line above the numbers, since there is no running paragraph to open, and the
  numbers are inert labels rather than the reader's link buttons. Everything the request called
  advanced is inside a closed `<details>`, so the common path is four taps and
  answers no question it can answer itself.

- **`highlight` and `note` are redrawn, the 41st and the second pair pulled apart.**
  The set's `highlight` is a nib on a baseline and its `note` is a pencil: two
  diagonal quadrilaterals with a point, indistinguishable at 19px, and they are the
  two actions a reader reaches for every day. `highlight` is now a chisel marker —
  a slanted barrel with the nib cut off it — over the solid bar it leaves, and
  `note` is a page with a folded corner and two written lines. The page is also the
  truer glyph for the marker beside an annotated verse, which means *there is
  something written here* rather than *write something*.
- **Every sheet is a dialog, named by its own `<h2>`.** The document draws the
  sheet anatomy but says nothing about its semantics, and none of the five had any:
  no `role`, no `aria-modal`, no heading, and six Tab presses from an open sheet
  walked out onto the header icons and the edition tabs behind the backdrop. The
  shell in `src/components/Sheet.tsx` now sets `role="dialog"`, `aria-modal`, and
  `aria-labelledby` at a real `<h2>` title, holds Tab inside itself, moves focus in
  on open unless something inside has already claimed it, and hands focus back to
  the opener on the way out. The search sheet, whose head is a field, is named by a
  visually-hidden heading instead.
- **Two sheet detents, not five ad-hoc heights.** The five sheets measured 13%, 31%,
  58%, 83% and 92% of the viewport. They are sized to their content between a 45%
  floor and the document's 92% ceiling, which mainly stops the search sheet growing
  to most of the screen on the first keystroke and shrinking back on the last
  backspace, moving the field under the thumb each time. Confirm is exempt: a
  two-line question does not need half a screen.
- **A settings section heading is a real `<h2>`, and it sticks.** Settings scrolls
  about 1,970px past forty controls inside a 667px window, and the group labels were
  styled `div`s — nothing for a screen reader to move between, and nothing on screen
  saying which section you were in once the label had passed. `.sheet-body` is the
  sheet's only scroller, so `position: sticky; top: 0` pins each heading as you pass
  it. The planner's two form labels are `<h3>` and stay put: they sit inside a card
  that scrolls with the sheet.
- **A skip link, and it is a button.** A chapter is hundreds of lines of text and,
  in the parallel view, that many again per edition. The link is off-screen until
  focused and jumps to the chapter-end row. It is a `<button>` rather than an
  `<a href="#chapend">` because the app routes on `location.hash`, so a fragment
  link would navigate the reader somewhere else on its way.
- **The reader widens to 1320 for three columns.** The document assumes one measure;
  three tracks inside the 1200px reader can only ever be 39 characters, against the
  comfortable 45. The ladder asks for three columns at 1260 and up, and `.reader`
  widens to match. One and two columns stay at 1200, and the single column is capped
  at 66ch and centred with the chapter title and chapter-end row aligned to it.
- **More editions than columns page, they do not scroll.** Fourteen editions made a
  3698px track inside a 1164px window: scrollable, with no scrollbar, no edge fade
  and no counter, and the sixth column sliced mid-glyph at 28 characters. Tracks now
  have a 300px floor that the ladder guarantees always fits, and the editions past
  the window are reached with a counter and two paddles beside the chapter title.
  The phone's tab strip, which does scroll, carries the same counter underneath.

- **A third section in the canon, and a picker that expects one.** The document draws
  the book picker as two halves. Books declare their section now, so an edition that
  carries a deuterocanon gets a third group between the Testaments, a fourth search
  scope, and a reading-plan preset that asks for sections rather than a Genesis-to-
  Revelation range that would have swallowed it. The two-halves drawing is the common
  case, not the model.
- **Adding a version is a sheet, and its middle step is the point.** The document has
  no atom for importing anything. The sheet is three steps — choose, *read back what
  was found*, name it — and the middle one is not a progress indicator: it lists the
  books, chapters and verses actually parsed and names anything it could not place,
  because a reader adding a text they downloaded has no other way to tell a complete
  file from a truncated one. The attribution is a required paragraph rather than an
  optional field, since every shipped edition carries one and the licences sheet lists
  them all. An imported edition is badged `on this device` in the same slot the KJV
  uses for `concordance`: it is a fact about where the text lives, which is why it
  works offline and why clearing site data removes it.
- **The focus ring needs room, and the room is the scroller's padding.** The document
  specifies a 2px ring at 3px offset and says nothing about where it is drawn. Being
  outside the control, it is clipped by any ancestor that scrolls — so `.sheet-body`
  carries 6px of top padding for the 5px the ring needs, and a focused control is
  lifted above a sticky section heading that would otherwise paint over it. A control
  placed first in a sheet is the common case, not an edge one.

## Data this design assumes

| Field | Status |
|---|---|
| `Ann.bookmarked?: boolean` | **Implemented.** `isEmpty()` counts it, and the Saved drawer has a Bookmarks filter |
| `HRange` | Unchanged — highlights stay ranges, hence the *These words / Whole verse* toggle |
| Edition order | Must be persisted; it drives reading order, stacking and sharing |
| Share payload | Defaults to the primary edition only; the invite link carries the full list |

## Beyond the phone

- Study sheet → 380px right-hand dock; the column shifts, never gets covered.
- Go to → popover under the reference; chapter grid and book list side by side.
- Verse actions → on hover at the right margin, outside the measure.

## Accessibility

- Focus: 2px accent ring, 3px offset, no glow.
- Keyboard: `J`/`K` verse, `←`/`→` chapter, `/` search, `Esc` closes the top layer only.
- Direction follows the *edition*, not the interface language.
- `prefers-reduced-motion` makes every transition instant; nothing is lost.
