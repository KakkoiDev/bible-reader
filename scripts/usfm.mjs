// Minimal USFM reader — just enough of the spec to pull verse text out of the
// eBible.org exports, which are consistently formatted.
//
// Handled deliberately:
//   \h / \toc2      the edition's own name for the book (localized book names)
//   \c N  \v N      structure. A verse runs until the next \v or \c, so the
//                   paragraph markers eBible sprinkles mid-verse (\p, \q1, \m…)
//                   don't truncate it.
//   \w text|…\w*    Strong's-tagged words — unwrapped to the bare word.
//   \add text\add*  translator-supplied words — mapped to the {…} convention the
//                   reader already renders as italics for the KJV.
//   \f …\f*         footnotes, \x …\x* cross-references — dropped entirely.
//   \s1 / \ms / \d  section headings and psalm descriptors — not verse text, dropped.

/** Markers whose whole line is structural, never verse content. */
const DROP_LINE = /^\\(id|ide|h|toc\d?|mt\d?|ms\d?|mr|s\d?|sr|r|sp|d|b|cl|cp|rem|iot|io\d?|ip|imt\d?|is\d?|periph|usfm)\b/

/** Paragraph-ish markers that may prefix a continuation of the current verse. */
const INLINE_MARKER = /^\\(p|m|pi\d?|pc|pr|pm\w*|q\d?|qc|qr|qm\d?|qa|nb|li\d?|lf|lh|lim\d?|tr|th\d?|thr\d?|tc\d?|tcr\d?|cls|ph\d?|pmo)\b\s*/

/** Strip character-level markup, leaving readable text. */
export function cleanInline(s) {
  return (
    s
      // footnotes and cross-refs, including any nested markup
      .replace(/\\f\s*[+\-?]?\s.*?\\f\*/g, '')
      .replace(/\\fe\s*[+\-?]?\s.*?\\fe\*/g, '')
      .replace(/\\x\s*[+\-?]?\s.*?\\x\*/g, '')
      // \w word|strong="G0976"\w*  and  \+w …\+w*   → word
      .replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*?)?\\\+?w\*/g, '$1')
      // translator-supplied words → the KJV brace convention (rendered italic)
      .replace(/\\\+?add\s*([^\\]*?)\s*\\\+?add\*/g, (_, t) => (t.trim() ? `{${t.trim()}}` : ''))
      // words of Jesus, transliteration, names, quotes, emphasis: keep the text
      .replace(/\\\+?(wj|tl|nd|sc|bk|qt|em|bd|it|bdit|no|ord|pn|png|addpn|k|sig|sls|dc|lit|va|vp|rq|jmp)\s*/g, '')
      .replace(/\\\+?(wj|tl|nd|sc|bk|qt|em|bd|it|bdit|no|ord|pn|png|addpn|k|sig|sls|dc|lit|va|vp|rq|jmp)\*/g, '')
      // milestones \zx-s | … \* and figure blocks
      .replace(/\\fig\s.*?\\fig\*/g, '')
      .replace(/\\[a-z\d-]+\s*\|[^\\]*\\\*/g, '')
      .replace(/\\[a-z\d-]+\*/g, '')
      // any surviving marker: drop the marker, keep following text
      .replace(/\\[a-z\d-]+\s?/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/**
 * Parse one USFM book file.
 * @returns {{ name: string, chapters: Map<number, Map<number, string>> }}
 */
export function parseUsfm(text) {
  const chapters = new Map()
  let name = ''
  let tocName = ''
  let ch = null
  let v = null
  let buf = []

  const flush = () => {
    if (ch == null || v == null) return
    const t = cleanInline(buf.join(' '))
    if (t) {
      if (!chapters.has(ch)) chapters.set(ch, new Map())
      const prev = chapters.get(ch).get(v)
      chapters.get(ch).set(v, prev ? `${prev} ${t}` : t)
    }
    buf = []
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const hm = /^\\h\d?\s+(.*)$/.exec(line)
    if (hm) {
      name = hm[1].trim()
      continue
    }
    const tm = /^\\toc2\s+(.*)$/.exec(line)
    if (tm) {
      tocName = tm[1].trim()
      continue
    }
    if (DROP_LINE.test(line)) continue

    const cm = /^\\c\s+(\d+)/.exec(line)
    if (cm) {
      flush()
      ch = parseInt(cm[1], 10)
      v = null
      if (!chapters.has(ch)) chapters.set(ch, new Map())
      continue
    }

    // A line can hold several verses: "\v 1 text \v 2 text"
    let rest = line.replace(INLINE_MARKER, '')
    if (!rest) continue
    if (!/^\\v\s/.test(rest) && !/\\v\s/.test(rest)) {
      if (v != null) buf.push(rest) // continuation of the verse in progress
      continue
    }
    // split on \v boundaries, keeping any leading continuation text
    const parts = rest.split(/\\v\s+/)
    if (parts[0].trim() && v != null) buf.push(parts[0].trim())
    for (const part of parts.slice(1)) {
      const vm = /^(\d+)(?:[-–](\d+))?\s*(.*)$/s.exec(part)
      if (!vm) continue
      flush()
      v = parseInt(vm[1], 10)
      buf = vm[3] ? [vm[3]] : []
    }
  }
  flush()
  return { name: name || tocName, chapters }
}

/** Book code from an eBible USFM filename, e.g. "46-MATgrctr.usfm" → "MAT". */
export function bookCodeFromFilename(f, ref) {
  const m = new RegExp(`^\\d+-([A-Z\\d]{3})${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.usfm$`, 'i').exec(f)
  if (m) return m[1].toUpperCase()
  const g = /^\d+-([A-Z\d]{3})/.exec(f)
  return g ? g[1].toUpperCase() : null
}
