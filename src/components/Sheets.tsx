import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexItem } from '../lib/types'
import { bookName } from '../lib/types'
import { BY_ID, VERSIONS, type Lang } from '../lib/versions'
import { VerseText, type HL } from '../lib/format'
import { search, parseReference, bookLookup, minQueryLen, type Hit } from '../lib/search'
import { verseWords, wordDef, cardReady, prefetchDefs, type StrongWord, type StrongDef } from '../lib/strongs'
import type { T } from '../lib/i18n'
import { coverageNote } from './Panels'

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
  const query = q.trim()
  const longEnough = query.length >= minQueryLen(query)
  const showNoResults = !loading && longEnough && hits.length === 0 && !jump
  // Nothing to show means no results container at all: an empty one still carried
  // the head's bottom margin, so the sheet had 29px under the field against 17
  // above it.
  const hasResults = !!jump || loading || hits.length > 0 || showNoResults
  // Matched terms can sit anywhere in the verse, so the snippet is a window over
  // the text with every match inside it marked, rather than one match plus fixed
  // context. The window is centred on the span covering the matches so a query
  // whose words land at both ends still shows why the verse matched.
  const WINDOW = 130
  const LEAD = 24
  const snippet = (h: Hit) => {
    let from = 0
    if (h.text.length > WINDOW) {
      // Terms can land at both ends of a long verse — Joshua 8:33 spreads four
      // matches over 411 characters — so centring on the span can put the window
      // in a gap and show none of them. Take the window covering the most matches
      // instead, earliest on a tie, with a little lead so it doesn't open mid-word.
      let best = { from: 0, n: -1 }
      for (const r of h.ranges) {
        const start = Math.min(Math.max(0, r.at - LEAD), h.text.length - WINDOW)
        let n = 0
        for (const x of h.ranges) if (x.at >= start && x.at + x.len <= start + WINDOW) n++
        if (n > best.n) best = { from: start, n }
      }
      from = best.from
    }
    const to = Math.min(h.text.length, from + WINDOW)
    const parts: { s: string; hit: boolean }[] = []
    let cur = from
    for (const r of h.ranges) {
      const s = Math.max(r.at, from)
      const e = Math.min(r.at + r.len, to)
      if (e <= s) continue // range lies outside the window
      if (s > cur) parts.push({ s: h.text.slice(cur, s), hit: false })
      parts.push({ s: h.text.slice(s, e), hit: true })
      cur = e
    }
    if (cur < to) parts.push({ s: h.text.slice(cur, to), hit: false })
    return { parts, lead: from > 0, tail: to < h.text.length }
  }
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
        {hasResults && (
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
          {showNoResults && <p className="empty">{t('no_results')}</p>}
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
                      {sn.lead && '…'}
                      {sn.parts.map((p, j) => (p.hit ? <mark key={j}>{p.s}</mark> : p.s))}
                      {sn.tail && '…'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        )}
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

/* ----------------------------- Word panels ---------------------------- */
/**
 * Which editions can explain their own words, and how.
 *
 * This is the switch the verse sheet reads: an edition listed here shows only its
 * own text plus its panel, and an edition that is not listed falls back to showing
 * the other translations instead.
 *
 * Only the KJV today, via its Strong's tags. A modernising dictionary for the
 * archaic vocabulary of the 文語訳 and the KJF would slot in here as a second kind
 * and get the same treatment for free.
 */
const WORD_PANEL: Partial<Record<Lang, 'concordance'>> = { en: 'concordance' }

/* ----------------------------- Concordance ---------------------------- */
/**
 * The verse's KJV words with the Greek or Hebrew behind each one.
 *
 * Loads as soon as the verse opens. That is affordable because the card only needs
 * the word, lemma and transliteration — a median 18 KB per book — while the Strong's
 * definitions are a second file fetched only when a word is actually tapped. The
 * whole row is the tap target, which is what makes this usable on a phone: a word in
 * body text is about 18px tall, far under a thumb.
 */
function Concordance({
  slug,
  ch,
  v,
  t,
  canSpeak,
  onSpeakWord,
}: {
  slug: string
  ch: number
  v: number
  t: T
  /** Whether this device has a voice for a script, so the button isn't a dead end. */
  canSpeak: (l: Lang) => boolean
  onSpeakWord: (text: string, lang: Lang) => void
}) {
  // 'loading' and 'failed' are distinct from an empty list on purpose: a book that
  // would not load must say so, not look like a verse with nothing tagged.
  const [words, setWords] = useState<StrongWord[] | 'loading' | 'failed'>('loading')
  const [open, setOpen] = useState<string | null>(null)
  const [def, setDef] = useState<{ code: string; entry: StrongDef | null } | null>(null)

  const load = (force = false) => {
    // Already in memory for this book (prefetched on open, or a previous verse):
    // render in the same paint rather than flashing a spinner for one frame.
    if (!cardReady(slug) || force) setWords('loading')
    setOpen(null)
    return verseWords(slug, ch, v, force).then((w) => {
      setWords(w ?? 'failed')
      // The panel is on screen now, so this reader will plausibly tap a word.
      if (w?.length) prefetchDefs(slug)
    })
  }

  useEffect(() => {
    let live = true
    if (!cardReady(slug)) setWords('loading')
    setOpen(null)
    verseWords(slug, ch, v).then((w) => {
      if (!live) return
      setWords(w ?? 'failed')
      if (w?.length) prefetchDefs(slug)
    })
    return () => {
      live = false
    }
  }, [slug, ch, v])

  const toggle = (code: string) => {
    if (open === code) {
      setOpen(null)
      return
    }
    setOpen(code)
    if (def?.code === code) return
    wordDef(slug, code).then((entry) => setDef({ code, entry }))
  }

  // Genuinely no tagged words (three verses in the whole KJV): no empty panel.
  if (Array.isArray(words) && words.length === 0) return null

  return (
    <div className="conc">
      <div className="conchead">
        <b>{t('concordance')}</b>
        <small>{BY_ID.en.edition}</small>
      </div>
      {words === 'loading' && (
        <p className="empty loadrow">
          <span className="spin" aria-hidden="true" />
          {t('loading')}
        </p>
      )}
      {words === 'failed' && (
        <p className="empty">
          {t('concordance_failed')}{' '}
          <button className="mini" onClick={() => load(true)}>
            {t('retry')}
          </button>
        </p>
      )}
      {Array.isArray(words) && (
        <ul className="conclist">
          {words.map((w, i) => {
            const isOpen = open === w.code
            const entry = def?.code === w.code ? def.entry : null
            // H codes are Hebrew, G codes Greek. That picks the voice, and it is the
            // code rather than the book because Ezra and Daniel carry both.
            const speakLang: Lang = w.code.startsWith('H') ? 'he' : 'el'
            return (
              <li key={i}>
                {/* The speak button is a sibling, not a child: the row is itself a
                    button, and nesting one inside another is invalid. */}
                <div className="crowline">
                  <button
                    className={`crowbtn ${isOpen ? 'on' : ''}`}
                    aria-expanded={isOpen}
                    onClick={() => toggle(w.code)}
                  >
                    <span className="cword">{w.word}</span>
                    {/* The lemma is Greek or Hebrew, so it carries its own direction:
                        a Hebrew lemma inside an English row must not reorder the line. */}
                    <bdi className="clemma" dir="auto">
                      {w.lemma}
                    </bdi>
                    {w.translit && <i className="ctranslit">{w.translit}</i>}
                    <small className="ccode">{w.code}</small>
                  </button>
                  {canSpeak(speakLang) && (
                    <button
                      className="cspeak"
                      title={`${t('pronounce')}: ${w.lemma}`}
                      aria-label={`${t('pronounce')}: ${w.lemma}`}
                      onClick={() => onSpeakWord(w.lemma, speakLang)}
                    >
                      ▶
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="cdef">
                    {!entry && (
                      <span className="empty loadrow">
                        <span className="spin" aria-hidden="true" />
                        {t('loading')}
                      </span>
                    )}
                    {entry && (
                      <>
                        {entry.def && <span>{entry.def}</span>}
                        {entry.kjv && (
                          <span className="ckjv">
                            {BY_ID.en.edition}: {entry.kjv}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
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
  onClearHighlight,
  canSpeak,
  onSpeakWord,
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
  onClearHighlight: (lang: Lang) => void
  canSpeak: (l: Lang) => boolean
  onSpeakWord: (text: string, lang: Lang) => void
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
        {/* An edition with a word panel of its own shows only itself: the panel is
            the reason you opened the verse, and on a wide screen the other editions
            are already side by side in the reader. An edition without one falls back
            to comparing across editions, which is the next best help it can give. */}
        <div className="compare">
          {(WORD_PANEL[data.lang] ? [data.lang] : columns).map((l) => {
            const m = BY_ID[l]
            const text = data.text[l]
            const hl = highlights[l]
            const note = coverageNote(t, l)
            return (
              // id lets selectionContext() resolve a selection made in here, so text
              // is highlighted by selecting the words you want — same gesture as in
              // the reader — rather than colouring the whole verse.
              <div key={l} id={`sv-${l}-${data.ch}-${data.v}`} className="crow" lang={m.htmlLang} dir={m.dir}>
                <div className="clang">
                  <span>
                    {m.label} · {m.edition}
                    {!text && note && <small className="cnote">{note}</small>}
                  </span>
                  {text && hl && hl.length > 0 && (
                    <button className="abtn tiny" title={t('remove_highlight')} onClick={() => onClearHighlight(l)}>
                      ⌫
                    </button>
                  )}
                </div>
                <div className="ctext">
                  <VerseText text={text ?? ''} lang={l} showFurigana={showFurigana} highlights={hl} />
                </div>
              </div>
            )
          })}
        </div>
        {WORD_PANEL[data.lang] === 'concordance' && (
          <Concordance
            slug={data.slug}
            ch={data.ch}
            v={data.v}
            t={t}
            canSpeak={canSpeak}
            onSpeakWord={onSpeakWord}
          />
        )}
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

/* ----------------------------- Invite builder --------------------------- */
/** Compose a link that carries a chosen set of editions, in a chosen order.
 *  The first edition is the one the passage opens in, so there is no separate
 *  control for that — one less decision to make. */
export function InviteBuilder({
  open,
  t,
  initial,
  refLabel,
  onCopy,
  onClose,
}: {
  open: boolean
  t: T
  /** Seed the picker with what the sender is currently reading. */
  initial: Lang[]
  refLabel: string
  onCopy: (columns: Lang[]) => void
  onClose: () => void
}) {
  const [cols, setCols] = useState<Lang[]>(initial)
  useEffect(() => {
    if (open) setCols(initial.length ? initial : [VERSIONS[0].id])
  }, [open, initial])
  if (!open) return null

  const move = (l: Lang, d: number) => {
    const i = cols.indexOf(l)
    const j = i + d
    if (j < 0 || j >= cols.length) return
    const c = [...cols]
    ;[c[i], c[j]] = [c[j], c[i]]
    setCols(c)
  }
  const label = (id: Lang) => {
    const m = BY_ID[id]
    const note = coverageNote(t, id)
    return (
      <span className="collabel">
        <bdi lang={m.htmlLang} dir={m.dir}>{m.label}</bdi> <small>{m.edition}</small>
        {note && <small className="cnote">{note}</small>}
      </span>
    )
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet invite" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{t('invite_build_title')}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <p className="empty">{t('invite_build_body')}</p>
        <div className="collist">
          {cols.map((l, i) => (
            <div className="colrow" key={l}>
              {i === 0 ? <span className="opens">{refLabel}</span> : null}
              {label(l)}
              <div className="colctl">
                <button className="mini" disabled={i === 0} onClick={() => move(l, -1)} aria-label={t('move_up')}>↑</button>
                <button className="mini" disabled={i === cols.length - 1} onClick={() => move(l, 1)} aria-label={t('move_down')}>↓</button>
                <button className="mini" disabled={cols.length <= 1} onClick={() => setCols(cols.filter((x) => x !== l))}>
                  {t('hide')}
                </button>
              </div>
            </div>
          ))}
          {VERSIONS.filter((v) => !cols.includes(v.id)).map((v) => (
            <div className="colrow off" key={v.id}>
              {label(v.id)}
              <button className="mini" onClick={() => setCols([...cols, v.id])}>{t('show')}</button>
            </div>
          ))}
        </div>
        <div className="noteact">
          <span className="spacer" />
          <button className="primary" onClick={() => onCopy(cols)}>{t('copy_invite')}</button>
        </div>
      </div>
    </div>
  )
}
