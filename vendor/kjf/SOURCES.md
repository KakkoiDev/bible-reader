# KJF upstream sources — provenance audit

Retrieved 2026-07-26. Every URL below was verified reachable on that date.

**Not tracked in git.** `vendor/` is not in `.gitignore`, and this repository is
public — see the licensing note at the bottom before `git add`ing anything here.

## The short version

**There is no separate "KJF 2006" file to download.** "2006" is the year the
translation was *completed*, and it is part of the name of the copyrighted work —
the publisher's own notice reads *"Traduction KIng James Française 2006 et KJF
sont sous copyright."* It is not an edition label distinguishing one file from
another.

So the note in `data-src/kjf.md` — that the Song of Solomon "est repris de
l'édition KJF 2006" — does not point at a retrievable artifact. Whatever filled
that book in, it was not a file identifiable as "the 2006 edition".

## What was checked

### 1. Internet Archive — labelled 2006, but not a distinct edition

- Item: https://archive.org/details/KJF_Bible_King_James_fr
- Download: https://archive.org/download/KJF_Bible_King_James_fr/KJF.zip (3.0 MB)
- Metadata: `creator: Nadine Stratford`, **`date: 2006`**, uploaded 2023-10-18

Contains `KJF.osis` (5.9 MB), `KJF.txt`, and a Sword module (`mods.d/KJF.conf`,
`modules/texts/rawtext/KJF/{ot,nt}`).

This looks like the answer and is not. Its own config declares its upstream:

```
TextSource=https://github.com/gratis-bible/bible/raw/master/fr/kjf.xml
SwordVersionDate=2016-01-21
```

and the OSIS header carries `<date>` values of 2010-10-12 / 2010-10-10. The
`date: 2006` field is the uploader describing the translation, not the file.

**It has the identical defects to the 2022 export already in `data-src/`:**

| | |
|---|---|
| verses | 31,076 (KJV: 31,102) |
| books | **65**, not 66 |
| Song of Solomon | **absent entirely** |
| Revelation | ch. 5 missing; 1–4, 6–22 present |
| John 18:24, Ps 44:23, Lev 13:1, Num 13:9, Num 30:5 | all absent |

So this file fills none of the gaps. Saved here as `KJF.zip` and
`KJF-gratis-bible.osis` anyway, so the finding is reproducible without
re-downloading.

### 2. Official site — live on `.net`, dead on `.com`

Worth recording, because a previous investigation concluded "both official
domains fail to resolve" and gave up:

- **`kingjamesfrancaise.com` — dead.** This is the domain referenced by the
  Internet Archive item and by `KJF.txt`. It has been gone since ~2007; only
  Wayback snapshots remain.
- **`kingjamesfrancaise.net` — live, HTTP 200.** This is the current site, and
  it is where the downloads are.

Download index: http://www.kingjamesfrancaise.net/remository.html

It offers exactly three files, and **no 2006 edition**:

| File | |
|---|---|
| [`KJF_WHOLE_BIBLE_2022.pdf`](http://www.kingjamesfrancaise.net/remository/KJF_WHOLE_BIBLE_2022.pdf) | Whole Bible, 2022 edition. 11 MB, 1256 pages. Saved here. |
| [`KJF_NTPP_210107.pdf`](http://www.kingjamesfrancaise.net/remository/KJF_NTPP_210107.pdf) | New Testament with Psalms & Proverbs |
| [`V1_NTPP_KJF-NTPP_KJV-Nadine_Stratford.epub`](http://www.kingjamesfrancaise.net/remository/V1_NTPP_KJF-NTPP_KJV-Nadine_Stratford.epub) | NT parallel KJF/KJV, ePub |

The whole-Bible PDF is the only complete official artifact, and therefore the
only realistic source for the 41 missing verses and the Song of Solomon. Its
text is in subset-encoded fonts, so extraction needs a real PDF text layer tool
(`pdftotext`, `mutool`) — none is installed on this machine, and no extraction
was attempted.

### 3. Other places checked

- https://gratis.bible/fr/kjf/ — HTTP 200. Same gratis-bible text as (1), so the
  same gaps.
- Amazon.fr lists a print "Bible King James Française (KJF 2022)" — print only.
- Android apps (APKPure, Play Store) bundle the text; not a clean source.
- A 2022 facsimile scan exists on the Internet Archive
  (`la-sainte-bible-traduction-francaise-king-james-par-nadine-stratford-2022`) —
  images, not text.

## Licensing — read before extracting or committing

The publisher's notice on `remository.html` states the KJF is under copyright and
that revising, adjusting or modifying the translation is forbidden. The app's
existing attribution ("reproduite sans modification") is written to respect
exactly that, and any gap-filling from the PDF must keep the text unaltered.

Concretely: **this repository is public.** Committing
`KJF_WHOLE_BIBLE_2022.pdf` would redistribute an 11 MB copyrighted PDF from a
public GitHub repo, which is a different act from the app displaying the text
with attribution. Add `vendor/` to `.gitignore`, or keep these files local.
