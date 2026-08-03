// Where every edition comes from, and how to read it.
//
// `id` doubles as the URL segment (#/john/3/<id>/16), the localStorage key for
// highlights, and the output directory (public/data/<id>/). The three original
// ids stay 'en' / 'ja' / 'fr' so existing links and saved annotations keep working.
//
// To swap an edition, change its `ref` here and re-run `npm run fetch && npm run data`.

/** Canonical book order + English names — the alignment spine for every edition. */
export const BOOK_ORDER = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
  'Revelation',
]

/** USFM 3-letter book codes → canonical English name (eBible file naming). */
export const USFM_BOOKS = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms',
  PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah',
  JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea',
  JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum',
  HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi',
  MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans',
  '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians', EPH: 'Ephesians',
  PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians',
  '2TH': '2 Thessalonians', '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus',
  PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter',
  '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
}

/** getbible.net numbers books 1–66 in canonical order. */
export const bookByNumber = (nr) => BOOK_ORDER[nr - 1]

/**
 * kind 'local'    — already in data-src as hand-curated Markdown; fetch skips it.
 * kind 'ebible'   — https://ebible.org/Scriptures/<ref>_usfm.zip
 * kind 'getbible' — https://api.getbible.net/v2/<ref>.json
 *
 * `coverage` is 'all' unless stated: which half of the canon the edition is expected
 * to carry. check-data compares each edition against the spine over that range, so a
 * book or chapter the source dropped is a failure rather than something nobody looks
 * for. It mirrors VersionMeta.coverage in src/lib/versions.ts.
 */
export const SOURCES = [
  { id: 'en', kind: 'local', file: 'kjv.md', clean: 'kjv' },
  { id: 'ja', kind: 'local', file: 'bungo.md' },
  { id: 'jako', kind: 'getbible', ref: 'japkougo' },
  { id: 'fr', kind: 'local', file: 'kjf.md' },
  { id: 'zht', kind: 'ebible', ref: 'cmn-cu89t' },
  { id: 'zhs', kind: 'ebible', ref: 'cmn-cu89s' },
  { id: 'pt', kind: 'getbible', ref: 'almeida' },
  { id: 'es', kind: 'ebible', ref: 'spaRV1909' },
  { id: 'ar', kind: 'ebible', ref: 'arb-vd' },
  { id: 'tl', kind: 'getbible', ref: 'tagalog' },
  { id: 'el', kind: 'ebible', ref: 'grctr', coverage: 'nt' },
  { id: 'he', kind: 'ebible', ref: 'hebwlc', coverage: 'ot' },
]

/** Genesis to Malachi, then Matthew to Revelation. */
export const OT_COUNT = 39

export const byId = (id) => SOURCES.find((s) => s.id === id)

/**
 * Localized book names for editions whose source files don't carry their own.
 * The KJF export uses English headings; eBible's WLC uses English headings too
 * (`\h Psalms`), so Hebrew names are supplied here. Every other edition names its
 * own books via USFM `\h` / getbible `book.name`.
 */
export const NATIVE_NAMES = {
  fr: {
    Genesis: 'Genèse', Exodus: 'Exode', Leviticus: 'Lévitique', Numbers: 'Nombres',
    Deuteronomy: 'Deutéronome', Joshua: 'Josué', Judges: 'Juges', Ruth: 'Ruth',
    '1 Samuel': '1 Samuel', '2 Samuel': '2 Samuel', '1 Kings': '1 Rois', '2 Kings': '2 Rois',
    '1 Chronicles': '1 Chroniques', '2 Chronicles': '2 Chroniques', Ezra: 'Esdras',
    Nehemiah: 'Néhémie', Esther: 'Esther', Job: 'Job', Psalms: 'Psaumes',
    Proverbs: 'Proverbes', Ecclesiastes: 'Ecclésiaste',
    'Song of Solomon': 'Cantique des Cantiques', Isaiah: 'Ésaïe', Jeremiah: 'Jérémie',
    Lamentations: 'Lamentations', Ezekiel: 'Ézéchiel', Daniel: 'Daniel', Hosea: 'Osée',
    Joel: 'Joël', Amos: 'Amos', Obadiah: 'Abdias', Jonah: 'Jonas', Micah: 'Michée',
    Nahum: 'Nahum', Habakkuk: 'Habacuc', Zephaniah: 'Sophonie', Haggai: 'Aggée',
    Zechariah: 'Zacharie', Malachi: 'Malachie', Matthew: 'Matthieu', Mark: 'Marc',
    Luke: 'Luc', John: 'Jean', Acts: 'Actes', Romans: 'Romains',
    '1 Corinthians': '1 Corinthiens', '2 Corinthians': '2 Corinthiens',
    Galatians: 'Galates', Ephesians: 'Éphésiens', Philippians: 'Philippiens',
    Colossians: 'Colossiens', '1 Thessalonians': '1 Thessaloniciens',
    '2 Thessalonians': '2 Thessaloniciens', '1 Timothy': '1 Timothée',
    '2 Timothy': '2 Timothée', Titus: 'Tite', Philemon: 'Philémon', Hebrews: 'Hébreux',
    James: 'Jacques', '1 Peter': '1 Pierre', '2 Peter': '2 Pierre', '1 John': '1 Jean',
    '2 John': '2 Jean', '3 John': '3 Jean', Jude: 'Jude', Revelation: 'Apocalypse',
  },
  he: {
    Genesis: 'בְּרֵאשִׁית', Exodus: 'שְׁמוֹת', Leviticus: 'וַיִּקְרָא', Numbers: 'בְּמִדְבַּר',
    Deuteronomy: 'דְּבָרִים', Joshua: 'יְהוֹשֻׁעַ', Judges: 'שׁוֹפְטִים', Ruth: 'רוּת',
    '1 Samuel': 'שְׁמוּאֵל א', '2 Samuel': 'שְׁמוּאֵל ב', '1 Kings': 'מְלָכִים א',
    '2 Kings': 'מְלָכִים ב', '1 Chronicles': 'דִּבְרֵי הַיָּמִים א',
    '2 Chronicles': 'דִּבְרֵי הַיָּמִים ב', Ezra: 'עֶזְרָא', Nehemiah: 'נְחֶמְיָה',
    Esther: 'אֶסְתֵּר', Job: 'אִיּוֹב', Psalms: 'תְּהִלִּים', Proverbs: 'מִשְׁלֵי',
    Ecclesiastes: 'קֹהֶלֶת', 'Song of Solomon': 'שִׁיר הַשִּׁירִים', Isaiah: 'יְשַׁעְיָהוּ',
    Jeremiah: 'יִרְמְיָהוּ', Lamentations: 'אֵיכָה', Ezekiel: 'יְחֶזְקֵאל', Daniel: 'דָּנִיֵּאל',
    Hosea: 'הוֹשֵׁעַ', Joel: 'יוֹאֵל', Amos: 'עָמוֹס', Obadiah: 'עֹבַדְיָה', Jonah: 'יוֹנָה',
    Micah: 'מִיכָה', Nahum: 'נַחוּם', Habakkuk: 'חֲבַקּוּק', Zephaniah: 'צְפַנְיָה',
    Haggai: 'חַגַּי', Zechariah: 'זְכַרְיָה', Malachi: 'מַלְאָכִי',
  },
  jako: {
    Genesis: '創世記', Exodus: '出エジプト記', Leviticus: 'レビ記', Numbers: '民数記',
    Deuteronomy: '申命記', Joshua: 'ヨシュア記', Judges: '士師記', Ruth: 'ルツ記',
    '1 Samuel': 'サムエル記上', '2 Samuel': 'サムエル記下', '1 Kings': '列王記上', '2 Kings': '列王記下',
    '1 Chronicles': '歴代誌上', '2 Chronicles': '歴代誌下', Ezra: 'エズラ記', Nehemiah: 'ネヘミヤ記',
    Esther: 'エステル記', Job: 'ヨブ記', Psalms: '詩篇', Proverbs: '箴言', Ecclesiastes: '伝道の書',
    'Song of Solomon': '雅歌', Isaiah: 'イザヤ書', Jeremiah: 'エレミヤ書', Lamentations: '哀歌',
    Ezekiel: 'エゼキエル書', Daniel: 'ダニエル書', Hosea: 'ホセア書', Joel: 'ヨエル書', Amos: 'アモス書',
    Obadiah: 'オバデヤ書', Jonah: 'ヨナ書', Micah: 'ミカ書', Nahum: 'ナホム書', Habakkuk: 'ハバクク書',
    Zephaniah: 'ゼパニヤ書', Haggai: 'ハガイ書', Zechariah: 'ゼカリヤ書', Malachi: 'マラキ書',
    Matthew: 'マタイによる福音書', Mark: 'マルコによる福音書', Luke: 'ルカによる福音書', John: 'ヨハネによる福音書',
    Acts: '使徒行伝', Romans: 'ローマ人への手紙', '1 Corinthians': 'コリント人への第一の手紙',
    '2 Corinthians': 'コリント人への第二の手紙', Galatians: 'ガラテヤ人への手紙', Ephesians: 'エペソ人への手紙',
    Philippians: 'ピリピ人への手紙', Colossians: 'コロサイ人への手紙', '1 Thessalonians': 'テサロニケ人への第一の手紙',
    '2 Thessalonians': 'テサロニケ人への第二の手紙', '1 Timothy': 'テモテへの第一の手紙', '2 Timothy': 'テモテへの第二の手紙',
    Titus: 'テトスへの手紙', Philemon: 'ピレモンへの手紙', Hebrews: 'ヘブル人への手紙', James: 'ヤコブの手紙',
    '1 Peter': 'ペテロの第一の手紙', '2 Peter': 'ペテロの第二の手紙', '1 John': 'ヨハネの第一の手紙',
    '2 John': 'ヨハネの第二の手紙', '3 John': 'ヨハネの第三の手紙', Jude: 'ユダの手紙', Revelation: 'ヨハネの黙示録',
  },
}
