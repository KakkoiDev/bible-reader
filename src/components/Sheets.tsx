import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexItem, Lang } from '../lib/types'
import { LANG_META } from '../lib/types'
import { VerseText } from '../lib/format'
import { buildIndex, runSearch, parseReference, minQueryLen, type Hit } from '../lib/search'

/* ------------------------------- Search ------------------------------- */
export function SearchSheet({
  open,
  index,
  onNavigate,
  onClose,
}: {
  open: boolean
  index: IndexItem[]
  onNavigate: (slug: string, ch: number, v?: number, lang?: Lang) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const enBySlug = useMemo(() => new Map(index.map((b) => [b.slug, b.en])), [index])
  const gen = useRef(0)

  useEffect(() => {
    if (!open) {
      setQ('')
      setHits([])
    }
  }, [open])
  useEffect(() => {
    if (q.trim().length < minQueryLen(q.trim())) {
      setHits([])
      setLoading(false)
      return
    }
    const id = ++gen.current
    setLoading(true)
    const t = setTimeout(async () => {
      const entries = await buildIndex()
      if (id !== gen.current) return
      setHits(runSearch(entries, q))
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  if (!open) return null
  const jump = parseReference(q, index)
  const snippet = (h: Hit) => ({
    pre: (h.at > 30 ? '…' : '') + h.text.slice(Math.max(0, h.at - 30), h.at),
    mid: h.text.slice(h.at, h.at + h.len),
    post: h.text.slice(h.at + h.len, h.at + h.len + 60),
  })
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet search" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <input
            className="searchin"
            autoFocus
            placeholder="Search text or reference (e.g. John 3:16)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="results">
          {jump && (
            <button className="dref go" onClick={() => onNavigate(jump.slug, jump.ch, jump.v)}>
              <span className="dlabel">
                → Go to {enBySlug.get(jump.slug)} {jump.ch}
                {jump.v ? `:${jump.v}` : ''}
              </span>
            </button>
          )}
          {loading && <p className="empty">Searching…</p>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && !jump && <p className="empty">No results.</p>}
          <ul className="dlist">
            {hits.map((h, i) => {
              const sn = snippet(h)
              return (
                <li key={i}>
                  <button className="dref" onClick={() => onNavigate(h.slug, h.ch, h.v, h.lang)}>
                    <span className="dlabel">
                      {enBySlug.get(h.slug)} {h.ch}:{h.v} <small className="badge">{LANG_META[h.lang].edition}</small>
                    </span>
                    <span className="dnote" lang={LANG_META[h.lang].htmlLang}>
                      {sn.pre}
                      <mark>{sn.mid}</mark>
                      {sn.post}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Navigator ----------------------------- */
export function Navigator({
  open,
  index,
  current,
  onNavigate,
  onClose,
}: {
  open: boolean
  index: IndexItem[]
  current: string
  onNavigate: (slug: string, ch: number) => void
  onClose: () => void
}) {
  const [book, setBook] = useState(current)
  useEffect(() => {
    if (open) setBook(current)
  }, [open, current])
  if (!open) return null
  const sel = book ? index.find((b) => b.slug === book) : undefined
  const grid = (books: IndexItem[]) => (
    <div className="bookgrid">
      {books.map((b) => (
        <button key={b.slug} className={`bkbtn ${b.slug === current ? 'on' : ''}`} onClick={() => setBook(b.slug)}>
          {b.en}
        </button>
      ))}
    </div>
  )
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet nav" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{sel ? sel.en : 'Choose a book'}</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {sel ? (
          <>
            <button className="mini back" onClick={() => setBook('')}>← All books</button>
            <div className="chgrid">
              {Array.from({ length: sel.chapters }, (_, i) => i + 1).map((c) => (
                <button key={c} className="chbtn" onClick={() => onNavigate(sel.slug, c)}>
                  {c}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bgtitle">Old Testament</div>
            {grid(index.slice(0, 39))}
            <div className="bgtitle">New Testament</div>
            {grid(index.slice(39))}
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------- Verse sheet ---------------------------- */
export interface VerseSheetData {
  label: string
  lang: Lang
  en: string
  fr: string
  ja: string
}
export function VerseSheet({
  data,
  showFurigana,
  onCopyText,
  onCopyLink,
  onPlay,
  onNote,
  onClose,
}: {
  data: VerseSheetData | null
  showFurigana: boolean
  onCopyText: () => void
  onCopyLink: () => void
  onPlay: () => void
  onNote: () => void
  onClose: () => void
}) {
  if (!data) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet verse-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{data.label}</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="compare">
          {(['en', 'ja', 'fr'] as Lang[]).map((l) => (
            <div key={l} className="crow" lang={LANG_META[l].htmlLang}>
              <div className="clang">
                {LANG_META[l].label} · {LANG_META[l].edition}
              </div>
              <div className="ctext">
                <VerseText text={data[l]} lang={l} showFurigana={showFurigana} />
              </div>
            </div>
          ))}
        </div>
        <div className="noteact">
          <button className="mini" onClick={onPlay}>▶ Play</button>
          <button className="mini" onClick={onCopyText}>Copy text</button>
          <button className="mini" onClick={onCopyLink}>Copy link</button>
          <span className="spacer" />
          <button className="primary" onClick={onNote}>Note</button>
        </div>
      </div>
    </div>
  )
}
