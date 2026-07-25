import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexItem } from '../lib/types'
import { bookName } from '../lib/types'
import { BY_ID, type Lang } from '../lib/versions'
import { VerseText, type HL } from '../lib/format'
import { COLORS, type HColor } from '../lib/annotations'
import { search, parseReference, bookLookup, minQueryLen, type Hit } from '../lib/search'
import type { T } from '../lib/i18n'
import { coverageNote } from './Panels'
import type { Invite } from '../lib/invite'

/* ------------------------------- Search ------------------------------- */
export function SearchSheet({
  open,
  index,
  columns,
  ui,
  t,
  onNavigate,
  onClose,
}: {
  open: boolean
  index: IndexItem[]
  /** Editions to search — the visible ones, so the index stays proportional. */
  columns: Lang[]
  ui: Lang
  t: T
  onNavigate: (slug: string, ch: number, v?: number, lang?: Lang) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const bySlug = useMemo(() => new Map(index.map((b) => [b.slug, bookName(b, ui)])), [index, ui])
  // Book names in every edition's language, so a reference resolves whatever the
  // reader types — 馬太福音15:3 and Mateo 15:3 both land on Matthew 15:3.
  const lookup = useMemo(() => bookLookup(index), [index])
  const gen = useRef(0)

  useEffect(() => {
    if (!open) {
      setQ('')
      setHits([])
    }
  }, [open])
  useEffect(() => {
    const query = q.trim()
    if (query.length < minQueryLen(query)) {
      setHits([])
      setLoading(false)
      return
    }
    const id = ++gen.current
    setLoading(true)
    const timer = setTimeout(async () => {
      const found = await search(columns, query)
      if (id !== gen.current) return
      setHits(found)
      setLoading(false)
    }, 200)
    return () => clearTimeout(timer)
  }, [q, columns])

  if (!open) return null
  const jump = parseReference(q, index, lookup)
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
            placeholder={t('search_placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <div className="results">
          {jump && (
            <button className="dref go" onClick={() => onNavigate(jump.slug, jump.ch, jump.v)}>
              <span className="dlabel">
                → {t('go_to')} {bySlug.get(jump.slug)} {jump.ch}
                {jump.v ? `:${jump.v}` : ''}
              </span>
            </button>
          )}
          {loading && <p className="empty">{t('searching')}</p>}
          {!loading && q.trim().length >= minQueryLen(q.trim()) && hits.length === 0 && !jump && (
            <p className="empty">{t('no_results')}</p>
          )}
          <ul className="dlist">
            {hits.map((h, i) => {
              const sn = snippet(h)
              const m = BY_ID[h.lang]
              return (
                <li key={i}>
                  <button className="dref" onClick={() => onNavigate(h.slug, h.ch, h.v, h.lang)}>
                    <span className="dlabel">
                      {bySlug.get(h.slug)} {h.ch}:{h.v} <small className="badge">{m.edition}</small>
                    </span>
                    <span className="dnote" lang={m.htmlLang} dir={m.dir}>
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
  ui,
  t,
  onNavigate,
  onClose,
}: {
  open: boolean
  index: IndexItem[]
  current: string
  ui: Lang
  t: T
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
          {bookName(b, ui)}
        </button>
      ))}
    </div>
  )
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet nav" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{sel ? bookName(sel, ui) : t('choose_book')}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        {sel ? (
          <>
            <button className="mini back" onClick={() => setBook('')}>{t('all_books')}</button>
            <div className="chgrid">
              {sel.chapters.map((_, i) => (
                <button key={i} className="chbtn" onClick={() => onNavigate(sel.slug, i + 1)}>
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bgtitle">{t('old_testament')}</div>
            {grid(index.slice(0, 39))}
            <div className="bgtitle">{t('new_testament')}</div>
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
  slug: string
  ch: number
  v: number
  /** Text per edition for this verse — only the editions the reader has visible. */
  text: Partial<Record<Lang, string>>
}

export function VerseSheet({
  data,
  columns,
  showFurigana,
  highlights,
  t,
  onCopyText,
  onCopyLink,
  onCopyInvite,
  onPlay,
  onNote,
  onHighlight,
  onClearHighlight,
  onClose,
}: {
  data: VerseSheetData | null
  /** Visible editions, in the reader's own order. */
  columns: Lang[]
  showFurigana: boolean
  /** Saved highlights for this verse, keyed by edition. */
  highlights: Partial<Record<Lang, HL[]>>
  t: T
  onCopyText: () => void
  onCopyLink: () => void
  onCopyInvite: () => void
  onPlay: () => void
  onNote: () => void
  onHighlight: (lang: Lang, color: HColor) => void
  onClearHighlight: (lang: Lang) => void
  onClose: () => void
}) {
  if (!data) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet verse-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{data.label}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <div className="compare">
          {columns.map((l) => {
            const m = BY_ID[l]
            const text = data.text[l]
            const hl = highlights[l]
            const note = coverageNote(t, l)
            return (
              <div key={l} className="crow" lang={m.htmlLang} dir={m.dir}>
                <div className="clang">
                  <span>
                    {m.label} · {m.edition}
                    {!text && note && <small className="cnote">{note}</small>}
                  </span>
                  {text && (
                    <span className="hlctl">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          className={`swatch mini-sw sw-${c}`}
                          title={t('highlight')}
                          aria-label={`${t('highlight')} — ${c}`}
                          onClick={() => onHighlight(l, c)}
                        />
                      ))}
                      {hl && hl.length > 0 && (
                        <button className="abtn tiny" title={t('remove_highlight')} onClick={() => onClearHighlight(l)}>
                          ⌫
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <div className="ctext">
                  <VerseText text={text ?? ''} lang={l} showFurigana={showFurigana} highlights={hl} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="noteact wrap">
          <button className="mini" onClick={onPlay}>▶ {t('play')}</button>
          <button className="mini" onClick={onCopyText}>{t('copy_text')}</button>
          <button className="mini" onClick={onCopyLink}>{t('copy_link')}</button>
          <button className="mini" onClick={onCopyInvite}>{t('copy_invite')}</button>
          <span className="spacer" />
          <button className="primary" onClick={onNote}>{t('note')}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Invite sheet --------------------------- */
/** Accepting an invite rewrites which editions the reader sees, so it always asks
 *  first — a link should never silently reconfigure someone's app. */
export function InviteSheet({
  invite,
  refLabel,
  t,
  onAccept,
  onDecline,
}: {
  invite: Invite | null
  refLabel: string
  t: T
  onAccept: () => void
  onDecline: () => void
}) {
  if (!invite) return null
  const names = invite.columns.map((l) => BY_ID[l].label).join(' · ')
  return (
    <div className="sheet-backdrop" onClick={onDecline}>
      <div className="sheet invite" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{t('invite_title')}</b>
        </div>
        <p className="empty">{t('invite_body', { ref: refLabel, versions: names })}</p>
        <ul className="invlist">
          {invite.columns.map((l) => (
            <li key={l} lang={BY_ID[l].htmlLang} dir={BY_ID[l].dir}>
              {BY_ID[l].label} <small>{BY_ID[l].edition}</small>
            </li>
          ))}
        </ul>
        <div className="noteact">
          <button className="ghost" onClick={onDecline}>{t('invite_decline')}</button>
          <span className="spacer" />
          <button className="primary" onClick={onAccept}>{t('invite_accept')}</button>
        </div>
      </div>
    </div>
  )
}
