# The "modern versions are corrupted" claim, against this app's own data

This note documents the King-James-only / Chick Publications argument that modern Bible
versions delete Scripture, states the mainstream textual-criticism reply, and then does
the thing neither side usually does: checks both against the eleven editions this app
actually ships, verse by verse, from the committed source text.

It takes no side on the theology. It reports what the claims are, who makes them, what
the counter-argument is, and what our own bytes say. Where a claim cannot be settled
from the data, it says so. The repository's rule holds here too: being wrong is worse
than being absent.

## 1. What the KJV-only / Chick position claims

Chick Publications is a long-running King-James-only publisher. Its Bible-version
material argues, in plain terms, that:

- Publishers have removed words and whole verses from modern Bibles. See
  [Chick.com, "Are Words Missing in the KJV?"](https://www.chick.com/battle-cry/article?id=Are-Words-Missing-in-the-KJV)
  and its [bible-versions article listing](https://www.chick.com/information/article-listing?subject=bible+versions).
- The modern critical Greek text descends from Westcott and Hort, who preferred Codex
  Vaticanus and Sinaiticus, and whose work is framed as rationalist and untrustworthy.
  See [Chick.com, "Westcott and Hort - part 1"](https://www.chick.com/information/article?id=Westcott-and-Hort-part-1)
  and ["From Faith to Doubt: Westcott, Hort, and the Bible Version Crisis"](https://www.chick.com/battle-cry/article?id=From-Faith-to-Doubt-Westcott-Hort-and-the-Bible-Version-Crisis_01).
- The Textus Receptus / Byzantine tradition behind the KJV is the preserved text, and
  the KJV is therefore the only English Bible that can be trusted.

The two exhibits this position leans on hardest, and the two this app can check, are the
list of roughly sixteen New Testament verses absent from modern critical editions, and
the Johannine Comma (1 John 5:7-8).

## 2. The mainstream reply

Textual critics generally hold that these verses are **later scribal additions**, not
deletions: the earliest and most geographically spread manuscripts do not contain them,
and they appear in later medieval copies. On this account a modern version is declining
to add material, not removing Scripture.

- [Wikipedia, "List of New Testament verses not included in modern English translations"](https://en.wikipedia.org/wiki/List_of_New_Testament_verses_not_included_in_modern_English_translations)
  collects the list with the manuscript evidence.
- Bruce Metzger's textual commentary rates the omission of Matthew 17:21 at {A}
  certainty and calls it a scribal harmonization; Matthew 18:11 is judged borrowed by
  copyists from Luke 19:10.
- [The Wartburg Project FAQ](https://wartburgproject.org/faqs/2024/07/why-are-recent-translations-missing-some-new-testament-verses)
  states the confessional-Protestant version of the same explanation.

This note does not adjudicate between sections 1 and 2. It records that the disagreement
is about the **direction** of the change (was something added later, or removed later)
and about which manuscripts carry the original wording.

## 3. What this app's own editions show

The app ships eleven editions from mixed traditions. Checked against the committed
`data-src/*.md` (verse present in that edition's source, not merely a build placeholder):

### 3a. The disputed New Testament verses

| verse | en KJV | fr KJF | ja 文語訳 | zht 和合本 | zhs 和合本 | es RV1909 | pt Almeida | ar Van Dyck | tl ADB | el TR |
|---|---|---|---|---|---|---|---|---|---|---|
| Matthew 17:21 | present | present | present | present | present | present | present | present | present | present |
| Matthew 18:11 | present | present | present | omitted | omitted | present | present | present | present | present |
| Matthew 23:14 | present | present | present | omitted | omitted | present | present | present | present | present |
| Mark 7:16 | present | present | present | omitted | omitted | present | present | present | present | present |
| Mark 15:28 | present | present | present | omitted | omitted | present | present | present | present | present |
| Luke 17:36 | present | present | present | omitted | omitted | present | present | present | present | present |
| Luke 23:17 | present | present | present | omitted | omitted | present | present | present | present | present |
| John 5:4 | present | present | present | omitted | omitted | present | present | present | present | present |
| Acts 8:37 | present | present | present | omitted | omitted | present | present | present | present | present |
| Acts 15:34 | present | present | present | omitted | omitted | present | present | present | present | present |
| Acts 28:29 | present | present | present | omitted | omitted | present | present | present | present | present |
| Romans 16:24 | present | present | present | present | present | present | present | present | present | present |

(Mark 9:44, 11:26 and Romans 16:24 are present in every edition here, including the
Chinese.)

### 3b. The Johannine Comma (1 John 5:7, the heavenly-witnesses clause)

Verified from the committed text of each edition's 1 John 5:7:

| carries the Comma | omits it (short reading) |
|---|---|
| en KJV, fr KJF, es RV1909, pt Almeida, ar Van Dyck, el TR | ja 文語訳, zht 和合本, zhs 和合本, tl ADB |

(he WLC is Old Testament only, so it has no 1 John.)

## 4. Why the simple binary does not survive contact with this data

The KJV-only frame is "old and pure versus new and corrupted." The app's own corpus
does not line up that way:

- The one edition that actually drops a block of the disputed verses is the Chinese
  **和合本 (Union Version, 1919)**. Every other edition, including the classical Japanese
  **文語訳** and the 1905 Tagalog **Ang Dating Biblia**, keeps all of them. So "modern
  version" is not the predictor; the Chinese Union Version's revised-text base is.
- The 文語訳 keeps every disputed verse above yet **omits the Johannine Comma**. It is
  neither uniformly "full" nor uniformly "critical." Its New Testament (大正改訳, 1917)
  simply followed the revised Greek on 1 John 5:7 while retaining the longer passages.
- The 1905 Tagalog and 1917 Japanese editions **predate** the "modern versions" the
  argument targets, yet pattern with them on the Comma. Age does not track the split.
- The Comma splits the editions six-to-four regardless of era, so "has the Comma" is a
  test of manuscript family (Textus Receptus versus revised), not of trustworthiness.

The honest description of this app is therefore: **a mixed-tradition parallel set**, six
Textus-Receptus-family editions beside five revised or critical-leaning ones, useful
precisely because a reader can see these differences side by side rather than be told a
single tradition is the only clean one.

## 5. A note for the Japanese edition being added

The colloquial **口語訳 (1954/1955)** added elsewhere in this work is critical-text based,
so it is expected to omit the Johannine Comma, exactly as the 文語訳 already does. That is
not evidence of a new corruption; it is the same reading the app has shipped in Japanese
since its first release. See the edition's provenance notes in `README.md`.

## Provenance

- KJV-only claims are attributed to KJV-only sources (chick.com).
- The scholarly reply is attributed to reference and confessional sources (Wikipedia's
  manuscript summary, Metzger's ratings, the Wartburg Project).
- The two data tables were generated from this repository's committed `data-src/*.md`
  and can be regenerated by checking each edition's source for the listed references.
