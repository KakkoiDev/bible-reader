import { Fragment, type ReactNode } from 'react'
import { BY_ID, type Lang } from './versions'

// A verse rendered as tokens carrying their base-text position, so persistent
// highlights can be applied as real DOM spans (which — unlike the CSS Custom
// Highlight API — paint correctly over <ruby> in every browser, incl. Safari).
type Token =
  | { kind: 'text'; text: string; pos: number; len: number }
  | { kind: 'italic'; text: string; pos: number; len: number }
  | { kind: 'ruby'; base: string; reading: string; pos: number; len: number }

export interface HL {
  start: number
  end: number
  color: string
}

const RUBY = /\{\{([^|}]*)\|([^}]+)\}\}/g
const KJV_ITALIC = /\{([^}]+)\}/g

function tokenize(text: string, lang: Lang): Token[] {
  const out: Token[] = []
  const markup = BY_ID[lang].markup
  if (markup === 'ruby') {
    let i = 0
    let pos = 0
    let m: RegExpExecArray | null
    RUBY.lastIndex = 0
    while ((m = RUBY.exec(text))) {
      if (m.index > i) {
        const s = text.slice(i, m.index)
        out.push({ kind: 'text', text: s, pos, len: s.length })
        pos += s.length
      }
      out.push({ kind: 'ruby', base: m[1], reading: m[2], pos, len: m[1].length })
      pos += m[1].length
      i = m.index + m[0].length
    }
    if (i < text.length) out.push({ kind: 'text', text: text.slice(i), pos, len: text.length - i })
  } else if (markup === 'kjv') {
    let i = 0
    let pos = 0
    let m: RegExpExecArray | null
    KJV_ITALIC.lastIndex = 0
    while ((m = KJV_ITALIC.exec(text))) {
      if (m.index > i) {
        const s = text.slice(i, m.index)
        out.push({ kind: 'text', text: s, pos, len: s.length })
        pos += s.length
      }
      out.push({ kind: 'italic', text: m[1], pos, len: m[1].length })
      pos += m[1].length
      i = m.index + m[0].length
    }
    if (i < text.length) out.push({ kind: 'text', text: text.slice(i), pos, len: text.length - i })
  } else {
    out.push({ kind: 'text', text, pos: 0, len: text.length })
  }
  return out
}

function colorMap(total: number, highlights: HL[]): (string | null)[] {
  const map = new Array<string | null>(total).fill(null)
  for (const h of highlights) for (let i = Math.max(0, h.start); i < Math.min(total, h.end); i++) map[i] = h.color
  return map
}

const hlSpan = (color: string, key: number, child: ReactNode) => (
  <span key={key} className={`hl hl-${color}`}>
    {child}
  </span>
)

// Split a run of text into same-color pieces, wrapping highlighted ones.
function paintText(text: string, base: number, colors: (string | null)[] | null, italic: boolean, keyBase: number): ReactNode[] {
  const wrap = (s: string, k: number): ReactNode => (italic ? <i key={k} className="supplied">{s}</i> : s)
  if (!colors) return [italic ? wrap(text, keyBase) : text]
  const out: ReactNode[] = []
  let run = ''
  let runColor: string | null = null
  let k = keyBase
  const flush = () => {
    if (!run) return
    const node = wrap(run, k++)
    out.push(runColor ? hlSpan(runColor, k++, node) : <Fragment key={k++}>{node}</Fragment>)
    run = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = colors[base + i] ?? null
    if (c !== runColor) {
      flush()
      runColor = c
    }
    run += text[i]
  }
  flush()
  return out
}

export function VerseText({
  text,
  lang,
  showFurigana,
  highlights,
  showHighlights = true,
}: {
  text: string
  lang: Lang
  showFurigana: boolean
  highlights?: HL[]
  /** The verse sheet turns this off so saved colour highlights don't muddy what Copy
   *  will grab; the reader leaves it on. */
  showHighlights?: boolean
}): ReactNode {
  if (!text) return <span className="missing">·</span>
  const tokens = tokenize(text, lang)
  const total = tokens.reduce((a, t) => a + t.len, 0)
  const colors = showHighlights && highlights && highlights.length ? colorMap(total, highlights) : null
  const nodes: ReactNode[] = []
  let key = 0
  for (const t of tokens) {
    if (t.kind === 'ruby') {
      let color: string | null = null
      if (colors) for (let i = t.pos; i < t.pos + t.len; i++) if (colors[i]) { color = colors[i]; break }
      const base = color ? hlSpan(color, key++, t.base) : t.base
      nodes.push(
        showFurigana ? (
          <ruby key={key++}>
            {base}
            <rt>{t.reading}</rt>
          </ruby>
        ) : (
          <Fragment key={key++}>{base}</Fragment>
        ),
      )
    } else {
      const pieces = paintText(t.text, t.pos, colors, t.kind === 'italic', key)
      key += 1000
      nodes.push(<Fragment key={key++}>{pieces}</Fragment>)
    }
  }
  return <>{nodes}</>
}
