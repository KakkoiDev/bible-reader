// Read an OSIS file into the shape the reader already stores per book.
//
// OSIS is what the SWORD project and most public-domain module archives publish, and
// it is the one format a reader is likely to be able to find for a text this app does
// not ship — a Vulgate with its deuterocanon, a Septuagint, a KJV with the Apocrypha.
//
// Everything here runs in the browser on a file the reader chose. It is therefore
// written to fail politely on anything unexpected rather than to be a complete OSIS
// implementation: what it needs is the verse text and where each verse belongs, and
// the rest of the schema is skipped.

export interface ParsedBook {
  /** Canonical English name, as `canon.json` spells it. */
  en: string
  chapters: { n: number; verses: { v: number; t: string }[] }[]
}

export interface ParsedOsis {
  books: ParsedBook[]
  /** `<work><title>`, offered as the edition name. */
  title?: string
  /** `<language>`, offered as the BCP47 tag. */
  language?: string
  /** `<rights>`, offered as the attribution line. */
  rights?: string
  verses: number
  /** Book ids in the file that this app has no place for, reported rather than
   *  dropped in silence — a reader who imports a text and finds three books missing
   *  deserves to be told which. */
  skipped: string[]
}

export class OsisError extends Error {}

/** `Tob.1.1`, `Tob.1.1-Tob.1.3`, `Tob.1.1!a` → `['Tob', 1, 1]`. A range is taken at
 *  its start: the whole run is stored against its first verse, which is where a
 *  reader looking it up will go. */
function parseOsisId(raw: string): { book: string; ch: number; v: number } | null {
  const first = raw.split(/\s|-/)[0]
  const parts = first.split('!')[0].split('.')
  if (parts.length < 3) return null
  const ch = parseInt(parts[1], 10)
  const v = parseInt(parts[2], 10)
  if (!Number.isFinite(ch) || !Number.isFinite(v)) return null
  return { book: parts[0], ch, v }
}

/** Collapse the whitespace XML indentation leaves behind, so a verse is one line. */
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * OSIS marks verses two ways and real files use both.
 *
 * *Container*: `<verse osisID="Tob.1.1">text</verse>` — the text is the element's.
 *
 * *Milestone*: `<verse sID="Tob.1.1"/>text<verse eID="Tob.1.1"/>` — the verse is an
 * empty marker and the text is its following siblings, which can be nested inside
 * paragraphs the marker is not a parent of. This is what the SWORD exporter emits,
 * so it is not an edge case.
 *
 * Milestones are read by walking the document in order and attributing every text
 * node to whichever verse was last opened, which handles the nesting without having
 * to understand the structure between them.
 */
function readVerses(doc: Document): Map<string, string> {
  const out = new Map<string, string>()
  const container = [...doc.getElementsByTagName('verse')].filter(
    (el) => el.getAttribute('osisID') && !el.getAttribute('sID') && el.textContent?.trim(),
  )
  if (container.length) {
    for (const el of container) {
      const id = el.getAttribute('osisID')!
      const text = tidy(el.textContent ?? '')
      if (text) out.set(id, (out.get(id) ? out.get(id) + ' ' : '') + text)
    }
    return out
  }

  let current: string | null = null
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element
      if (el.tagName.toLowerCase() !== 'verse') continue
      const sID = el.getAttribute('sID') || el.getAttribute('osisID')
      const eID = el.getAttribute('eID')
      if (eID) current = null
      else if (sID) current = sID
      continue
    }
    if (!current) continue
    const text = tidy(n.nodeValue ?? '')
    if (text) out.set(current, out.get(current) ? `${out.get(current)} ${text}` : text)
  }
  return out
}

/**
 * Strip what is about the text rather than the text.
 *
 * A note, a cross-reference or a section heading sits inside the verse element in
 * most OSIS files, so leaving them in would splice an editor's apparatus into the
 * middle of a sentence. `<w>` and `<seg>` are kept: they wrap words and their
 * content *is* the verse.
 */
const DROP = ['note', 'title', 'reference', 'figure', 'index', 'milestone']
function prune(doc: Document) {
  for (const tag of DROP) {
    const found = [...doc.getElementsByTagName(tag)]
    for (const el of found) el.parentNode?.removeChild(el)
  }
}

const textOf = (doc: Document, tag: string): string | undefined => {
  const el = doc.getElementsByTagName(tag)[0]
  const t = el?.textContent?.trim()
  return t || undefined
}

/**
 * @param osisToEn  OSIS book id → canonical English name, from `canon.json`. Passed
 *   in rather than held here so the table has one home: `scripts/sources.mjs` writes
 *   it into the data, and a book added there needs no change in this file.
 */
export function parseOsis(xml: string, osisToEn: Map<string, string>): ParsedOsis {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new OsisError('not-xml')
  if (!doc.getElementsByTagName('osisText').length && !doc.getElementsByTagName('osis').length)
    throw new OsisError('not-osis')

  // Read the header before pruning: `<title>` is both the work's title in the header
  // and a section heading in the text, and the pruning below takes out the headings.
  const meta = {
    title: textOf(doc, 'title'),
    language: doc.getElementsByTagName('language')[0]?.textContent?.trim() || undefined,
    rights: textOf(doc, 'rights'),
  }

  prune(doc)
  const raw = readVerses(doc)
  if (!raw.size) throw new OsisError('no-verses')

  // Group by canonical book, then chapter. `OSIS_BOOKS` is matched case-insensitively
  // because files differ on `1Sam` / `1sam` / `1SAM`.
  const lower = new Map([...osisToEn].map(([k, v]) => [k.toLowerCase(), v]))
  const byBook = new Map<string, Map<number, Map<number, string>>>()
  const skipped = new Set<string>()
  let verses = 0
  for (const [id, text] of raw) {
    const ref = parseOsisId(id)
    if (!ref) continue
    const en = lower.get(ref.book.toLowerCase())
    if (!en) {
      skipped.add(ref.book)
      continue
    }
    if (!byBook.has(en)) byBook.set(en, new Map())
    const chapters = byBook.get(en)!
    if (!chapters.has(ref.ch)) chapters.set(ref.ch, new Map())
    const vs = chapters.get(ref.ch)!
    // Two ids landing on one verse (a range and a part) are joined, not overwritten.
    vs.set(ref.v, vs.has(ref.v) ? `${vs.get(ref.v)} ${text}` : text)
    verses++
  }
  if (!byBook.size) throw new OsisError('no-known-books')

  const books: ParsedBook[] = []
  for (const [en, chapters] of byBook) {
    const out: ParsedBook['chapters'] = []
    for (const n of [...chapters.keys()].sort((a, z) => a - z)) {
      const vs = chapters.get(n)!
      out.push({
        n,
        verses: [...vs.keys()].sort((a, z) => a - z).map((v) => ({ v, t: vs.get(v)! })),
      })
    }
    books.push({ en, chapters: out })
  }

  return { books, ...meta, verses, skipped: [...skipped] }
}
