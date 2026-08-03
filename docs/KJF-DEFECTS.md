# Defects in the KJF OSIS export

Findings from building a parallel-Bible reader on the **Bible King James Française**
(Nadine L. Stratford). Written so it can be sent to the publisher as-is.

Compared against the King James Version, which the KJF translates, and against the
publisher's own **KJF_WHOLE_BIBLE_2022.pdf**, which is correct in every case below.
So these are defects in the **OSIS/XML export**, not in the translation.

Checked 2026-07-26. The Revelation 4-5 boundary and the two merged verses are fixed in
this repository (`scripts/repair-kjf.mjs`); the rest are reported but left untouched,
because resolving them means choosing a verse division and that is the publisher's call.

## Summary

| | |
|---|---|
| Verses with no counterpart in the export | **41** (of 31,102) |
| Of those, an entire chapter | Revelation 5, 14 verses |
| Books filed under the wrong name | Song of Solomon, as Ecclesiastes 13-20 |
| Distinct defect classes | 4 |

## 1. Revelation 4 and 5 mangled at the chapter boundary - 14 verses

There is no `### Revelation 5` heading. What the export labels `### Revelation 4` is
in fact Revelation 4 and 5 **interleaved** under one heading, with duplicate verse
numbers: `1,1,2,2,...,11,11,12,13,14` - 25 verse lines. The build keys verses by number
(last wins), so this collapsed to a 14-verse scramble for Revelation 4; and because a
chapter's length is taken as the maximum across all editions, that phantom 14 then
forced three empty placeholder rows onto Revelation 4 in *every* edition, not just the
KJF. Both chapters are otherwise textually complete inside the block.

The 2022 PDF has both chapters correct, on pages 1241-1242.

*Fixed in this repository, in two steps. First the clean Revelation 5 is reinserted
from the PDF. Then Revelation 4 is de-interleaved back to its 11 verses; this second
step needs no outside text, because all eleven true verses are already present in the
block and are only selected (each by a unique phrase, cross-checked against the KJV)
and renumbered, with the interleaved Revelation 5 dropped.*

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

## 6. Duplicate verse numbers, one verse's text lost - 10 chapters

Surfaced by `scripts/check-data.mjs`. In these chapters the export gives two verses the
same number, so the build (which keys verses by number, last wins) keeps only one and
silently drops the other's text. It is the same root cause as sections 3 and 5, seen
from the other side: instead of a gap, a number repeats.

**Six are fixed** (`scripts/repair-kjf.mjs` step 4), because a single verse's text was
merely mislabelled and its true number, cross-checked against the KJV, was the missing
one. The fix moves that verse to its number and asserts the chapter is then a clean
1..N; no outside text is used.

```
Numbers 13 (v9)   1 Chronicles 23 (v26)   Psalms 44 (v23)
Isaiah 9 (v17)    Jonah 2 (v3)            2 Thessalonians 2 (v16)
```

(This supersedes section 5's claim that Numbers 13:9 and Jonah 2:3 were unrecoverable:
the text was present all along, only mis-numbered, so no PDF reading was needed.)

**Four are left as-is**, because fixing them means choosing a verse division and that is
the publisher's call: Psalm 30 numbers the Hebrew superscription as a second verse 1,
and Psalms 60, 69 and 92 carry a multi-verse numbering shift (several verses each one
number too high after a dropped number) rather than a single displaceable verse. These
stay allowlisted in `check-data.mjs`; the check still hard-fails on any *new* duplicate.

## 7. The Song of Solomon is filed as Ecclesiastes 13-20 - 8 chapters

The export has no `Song` book. Ecclesiastes runs to a chapter 20, and chapters 13-20 are
the Song of Solomon. The export knows it: each of the eight carries its own
`<title>Song of Solomon n#</title>`, and the verse counts are the KJV's
17, 17, 11, 16, 16, 13, 13, 14 exactly.

```
<chapter osisID='Eccl.13'><title>Song of Solomon 1#</title>
  <verse osisID='Eccl.13.1'>Le Cantique des Cantiques, qui est de Salomon.</verse>
```

`grep -c "osisID='Song\."` on `gratis-bible/bible/fr/kjf.xml` returns 0, so the
mis-filing is upstream rather than a distribution artifact.

The consequence reached every reader, not only French ones. A chapter's length is taken
as the maximum across editions, so eight phantom Ecclesiastes chapters appeared in the
navigator's chapter grid for all twelve editions, empty in eleven of them.

*Fixed in this repository (`scripts/repair-kjf.mjs` step 5). The move renames headings
and drops the eight now-redundant chapter titles. No wording is touched.*

### And the text that was standing in for it was not the KJF

Until this fix, `data-src/kjf.md` carried a `## Song of Solomon` section credited by a
header note to a "KJF 2006 edition". No such artifact exists (README, "The KJF:
provenance"). The text is **Ostervald 1996**, verbatim:

| | |
|---|---|
| What was published as KJF 1:2 | Qu'il me baise des baisers de sa bouche! Car tes amours sont plus agréables que le vin. |
| Ostervald 1996, `Song.1.2` | Qu'il me baise des baisers de sa bouche! Car tes amours sont plus agréables que le vin. |
| The KJF's actual text, `Eccl.13.2` | Qu'il m'embrasse de baisers de sa bouche car ton amour est meilleur que le vin. |

So one translation was being served under another's name and copyright line. Replacing
it with the export's own eight chapters corrects both.

## How this was determined

- Export in use: `data-src/kjf.md`, built from the KJF OSIS 2022 export.
- Cross-checked against `https://github.com/gratis-bible/bible/raw/master/fr/kjf.xml`
  (via the Internet Archive item `KJF_Bible_King_James_fr`), which has **the same
  defects**, the Song of Solomon included, so these are upstream of any one distribution.
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
