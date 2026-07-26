# Defects in the KJF OSIS export

Findings from building a parallel-Bible reader on the **Bible King James Française**
(Nadine L. Stratford). Written so it can be sent to the publisher as-is.

Compared against the King James Version, which the KJF translates, and against the
publisher's own **KJF_WHOLE_BIBLE_2022.pdf**, which is correct in every case below.
So these are defects in the **OSIS/XML export**, not in the translation.

Checked 2026-07-26. Two of the eleven items are fixed in this repository
(`scripts/repair-kjf.mjs`); the rest are reported but left untouched, because
resolving them means choosing a verse division and that is the publisher's call.

## Summary

| | |
|---|---|
| Verses with no counterpart in the export | **41** (of 31,102) |
| Of those, an entire chapter | Revelation 5, 14 verses |
| Books absent from the export entirely | Song of Solomon (in the gratis-bible copy) |
| Distinct defect classes | 3 |

## 1. Revelation 5 is missing entirely — 14 verses

The export goes from Revelation 4:11 straight to 6:1. There is no chapter 5 element
at all, not an empty one. Chapters 4 and 6 are complete.

The 2022 PDF has the chapter in full, on page 1242.

*Fixed in this repository, from the PDF.*

## 2. Verses merged into their predecessor, marker left inline — 2 verses

The text is present but has been folded into the preceding verse, and the swallowed
verse's **number is still there in the middle of the text**:

> **John 18:23** … mais [si j'ai] bien [parlé] pourquoi me frappes-tu?**, 24** Or Anne
> l'avait envoyé lié à Caïphe le grand prêtre.

> **1 Corinthians 7:5** … afin que Satan ne vous tente par votre manque de maîtrise.
> **6** Mais je dis ceci par concession, et non pas par commandement.

This looks like a verse-boundary marker that failed to open a new element, leaving its
number as literal text. It is worth grepping the whole export for the pattern
`[.?!,;]\s*\d+\s+[A-ZÉÀ]` — there may be more of these than the two the KJV comparison
surfaced, in places where the KJV happens to agree with the merged division.

*Fixed in this repository, by splitting at the inline marker. No outside text needed.*

## 3. Verse numbering runs one ahead after a dropped number — 36 verses

The commonest defect. Somewhere in a chapter the export skips a number, and every
verse after it carries the number of the one before, so the chapter ends one number
too high. The clearest case:

**Psalm 113** has nine verses. The export emits verses 1–8, then a verse numbered
**10**, with no 9:

| | Export | Correct (and what the 2022 PDF prints) |
|---|---|---|
| 8 | Pour le faire asseoir avec les princes… | verse 8 |
| 9 | *absent* | Il fait [que] la femme stérile tienne une maison… |
| 10 | Il fait [que] la femme stérile tienne une maison… | *does not exist* |

The text is all there; only the numbering is wrong. Affected chapters:

```
Leviticus 13        Numbers 30          1 Chronicles 23     Isaiah 9
Ezekiel 20          2 Thessalonians 2   3 John 1
Psalms 21, 44, 45, 60, 63, 69, 84, 92, 113, 140, 142
```

Not fixed here. Correcting it means renumbering, and in some chapters (Psalm 44) a
verse is *also* genuinely absent, so the two defects overlap and the right division is
the publisher's to state.

## 4. Not defects — verse divisions where the KJF legitimately differs

Recorded so they are not mistaken for the above. In each, the KJF prints one fewer
verse than the KJV and the text is complete; the PDF agrees with the export.

| | KJV | KJF |
|---|---|---|
| 1 Samuel 20 | 43 verses | 42 |
| 1 Kings 22 | 54 verses | 53 |
| Revelation 12 | 18 verses | 17 |

Revelation 12:18 in particular ("And I stood upon the sand of the sea") is placed at
13:1 in many editions, so this is an editorial choice, not an omission.

## 5. Unresolved — 3 verses

Numbers 13:9, Psalm 57:10 and Jonah 2:3 are absent from the export, and could not be
recovered mechanically from the PDF: those chapters are dense with numerals in the
text itself (tribal lists, enumerations), which defeats splitting a page by verse
number. They need a human reading of the printed page.

## How this was determined

- Export in use: `data-src/kjf.md`, built from the KJF OSIS 2022 export.
- Cross-checked against `https://github.com/gratis-bible/bible/raw/master/fr/kjf.xml`
  (via the Internet Archive item `KJF_Bible_King_James_fr`), which has **the same
  defects** plus no Song of Solomon — so this is upstream of any one distribution.
- Ground truth: `KJF_WHOLE_BIBLE_2022.pdf` from
  `http://www.kingjamesfrancaise.net/remository.html`, text layer read with `pypdf`.
- Full provenance trail: `vendor/kjf/SOURCES.md` (not committed; the PDF is
  copyrighted and this repository is public).

## Note on copyright

The publisher's notice forbids revising or modifying the translation. Nothing here
alters wording. The two fixes applied restore a verse division and re-split a merged
verse; the Revelation 5 text is reproduced from the publisher's own PDF unchanged, save
for repairing four spaces that PDF text extraction inserted inside words
(`vingt -quatre`, `d'entr e eux`, `entendis -je`, `as sis`).
