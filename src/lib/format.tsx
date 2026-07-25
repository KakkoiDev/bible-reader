import { Fragment, type ReactNode } from 'react'
import type { Lang } from './types'

// Japanese furigana marker from the corpus:  {{漢字|かな}}  ->  <ruby>漢字<rt>かな</rt></ruby>
const RUBY = /\{\{([^|}]+)\|([^}]+)\}\}/g
// KJV italics: words supplied by translators are wrapped in braces:  {is}  ->  <i>is</i>
const KJV_ITALIC = /\{([^}]+)\}/g

function withRuby(text: string, showFurigana: boolean): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  RUBY.lastIndex = 0
  let i = 0
  while ((m = RUBY.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      showFurigana ? (
        <ruby key={i++}>
          {m[1]}
          <rt>{m[2]}</rt>
        </ruby>
      ) : (
        <Fragment key={i++}>{m[1]}</Fragment>
      ),
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function withKjvItalics(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  KJV_ITALIC.lastIndex = 0
  let i = 0
  while ((m = KJV_ITALIC.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <i key={i++} className="supplied">
        {m[1]}
      </i>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function VerseText({
  text,
  lang,
  showFurigana,
}: {
  text: string
  lang: Lang
  showFurigana: boolean
}): ReactNode {
  if (!text) return <span className="missing">—</span>
  if (lang === 'ja') return <>{withRuby(text, showFurigana)}</>
  if (lang === 'en') return <>{withKjvItalics(text)}</>
  return <>{text}</>
}
