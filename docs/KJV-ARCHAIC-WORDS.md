# Archaic KJV words: apologetics lists as leads for the glossary

King-James-only and KJV-defence writers keep lists of KJV words a modern reader
misreads. Those lists are a useful **hunting ground** for gaps in this app's Older-words
glossary. They are not an authority: the same writers sometimes overstate a word ("this
always means X"), so every candidate here is a lead to be verified against the actual
KJV usage and a dictionary before it enters the data. Being wrong is worse than absent.

This note cross-references those lists against what the glossary already carries and
produces a vetted candidate list for the comprehensive-glossary build.

## Sources (the lists)

- [carm.org, "Let: the changing use of words"](https://carm.org/king-james-onlyism/the-kjv-and-the-changing-use-of-words-let/)
- [GotQuestions, "English words that have changed meaning since the KJV"](https://www.gotquestions.org/KJV-words.html)
- [Compelling Truth, "KJV words that changed meaning"](https://www.compellingtruth.org/KJV-words.html)
- [Christian Publishing House, "What English words have changed meaning since the KJV"](https://christianpublishinghouse.co/2025/12/20/what-english-words-have-changed-meaning-since-the-kjv-was-translated/)
- [Way of Life, "Isn't the King James Bible too antiquated?"](https://www.wayoflife.org/database/isnt_the_king_james_bible_too_antiquated.html)

## Already covered

The classic list items are, for the most part, already in `data-src/glossary-en.json`
(63 curated false friends): charity, prevent, conversation, suffer, meat, corn, quick,
want, comfort, communicate, carriage, let (with its verse whitelist), and about fifty
more. The derived set in `data-src/webster-archaic.json` (24 words) covers the
obviously-unknown ones (astonied, purtenance, meteyard, and so on). So the lists mostly
confirm existing coverage rather than expand it.

## Candidate gaps (verified to occur in the KJV; sense still to confirm per entry)

Occurrence counts are from `data-src/kjv.md`. Each needs the same discipline the
existing file states: confirm the archaic sense holds, and where the word ALSO carries
its modern sense elsewhere in the KJV, add a `refs` whitelist (as `let`, `ear`, `deal`
already do) instead of glossing every occurrence.

### Content-word false friends (kind `false`), proposed for the curated file

| word | occurs | proposed modern | note / caution |
|---|---|---|---|
| coasts | 50 | borders, region | KJV "coasts" is territory/borders, never seaside. Frequent but consistently archaic, so no whitelist needed. Verify a few (Matthew 2:16 "coasts of Bethlehem"). |
| cunning | 38 | skilful | Usually skilled craftsmanship ("cunning work", "cunning workman"). Some contexts are craft/guile, so likely needs a `refs` whitelist for the skilful sense, or a note covering both. |
| careful | 8 | anxious | "Be careful for nothing" (Philippians 4:6) means do not be anxious. Modern "careful" (cautious) also occurs, so this needs a whitelist or a two-sense note. |
| adjure | 7 | put under oath | To bind by oath ("I adjure thee by God"). Uniform sense, safe. |
| wrest | 5 (+1 wrested) | twist, distort | To twist or pervert ("wrest the scriptures", 2 Peter 3:16; "wrest judgment"). Uniform, safe. |
| bewray | 1 (+3 bewrayeth) | reveal, betray | "Thy speech bewrayeth thee" (Matthew 26:73). Obsolete, so it belongs to the derived set as much as the curated one. |
| lewd | 3 | base, vile | KJV "lewd" is wicked or base generally ("lewd fellows of the baser sort", Acts 17:5), not specifically sexual. No whitelist needed, note the shift. |
| outlandish | 1 | foreign | "Outlandish women" (Nehemiah 13:26) means foreign women. Rare, a clear false friend. |
| ensue | 1 | pursue | "Seek peace, and ensue it" (1 Peter 3:11) means pursue it. Rare. |
| champaign | 2 | open plain | A flat open country (Deuteronomy 11:30). Obscure, arch rather than false friend. |
| concision | 2 | mutilation | Philippians 3:2, a pun on circumcision. Doctrinally loaded, add only with a careful note. |

### Obviously-unknown words (kind `arch`), for the derived path

Words a reader knows they do not know, better sourced through the Webster derivation than
hand-written: e.g. **collops** (Job 15:27, "collops of fat"). These should come from
extending `scripts/fetch-glossary.mjs` rather than the curated file, so they carry the
same provenance as the existing 24.

### Grammar / function words (kind `grammar`), a separate finite set

The lists also complain about pronouns and verb endings the glossary deliberately does
not yet cover: **thee, thou, thy, thine, ye**; **hast, hath, art, wast, wert, wilt,
shalt, doth, dost, doeth, doest**; and the **-eth / -est** endings. These are function
words, not content words, and they fire on most verses, so they need the shared-note,
opt-in treatment described in the comprehensive-glossary plan, not a curated entry each.

### Proper names (kind `name`), a separate source

Name meanings (Adam, Bethel, Peniel, and so on) are the other thing readers ask about.
They come from Hitchcock's Bible Names Dictionary (public domain), handled as their own
build path with an explicit provenance label, because those meanings are traditional and
sometimes contested.

## Provenance discipline

- The lists above are used as **leads**. No candidate enters the data on a list's say-so.
- Each content word is verified against its actual KJV occurrences (counts here are real)
  and a dictionary sense before it is added, and gets a `refs` whitelist wherever the
  word also carries its modern sense in the KJV.
- Grammar notes are the app's own short factual statements; name meanings are labelled as
  traditional (Hitchcock 1869) and are suppressible where wrong.

This candidate list is the input to the comprehensive-glossary build.
