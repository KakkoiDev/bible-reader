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

Tap a verse → inline bar (highlight · share · bookmark · note · listen · Study).
Only **Study** opens the sheet. The bar is full at six controls on a 390pt
screen; a seventh needs a redesign, not a squeeze.

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
- **The verse number and the inline play button stay at ~30.** They sit four
  pixels apart in the text flow, so growing both to 44 makes them collide. The
  answer this document gives is that per-verse play does not exist inline at
  all; that is a later pass.
- **`.gloss-mark` is left as text.** A glossed word is a word in the measure;
  the atom sheet lists it under text atoms, not controls.

## Data this design assumes

| Field | Status |
|---|---|
| `Ann.bookmarked?: boolean` | **New.** `isEmpty()` must count it or bookmarks vanish on reload |
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
