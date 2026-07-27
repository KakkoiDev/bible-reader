import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexItem } from '../lib/types'
import { bookName } from '../lib/types'
import { BY_ID, VERSIONS, type Lang } from '../lib/versions'
import { VerseText } from '../lib/format'
import { search, parseReference, bookLookup, minQueryLen, type Hit } from '../lib/search'
import { verseWords, wordDef, cardReady, prefetchDefs, type StrongWord, type StrongDef } from '../lib/strongs'
import { verseGloss, type GlossWord, type GlossKind } from '../lib/glossary'
import type { T, StringKey } from '../lib/i18n'
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
 * own text plus its panels, and an edition that is not listed falls back to showing
 * the other translations instead.
 *
 * The KJV has both, in this order deliberately: the glossary is reading help and
 * belongs first, the concordance is study. A modernising glossary for the 文語訳 and
 * the KJF would slot in here and need no other change.
 */
const WORD_PANEL: Partial<Record<Lang, readonly ('glossary' | 'concordance')[]>> = {
  en: ['glossary', 'concordance'],
}

/* ------------------------------ Glossary ------------------------------ */
/**
 * The verse's words whose meaning has moved since 1611.
 *
 * Rendered above the concordance because it answers the more urgent question. A false
 * friend gets its modern equivalent on the row, since that is the whole point: seeing
 * `charity → love` is what stops the misreading. Both the old word and the new one can
 * be spoken, which is the pairing that makes it stick.
 *
 * Absent entirely when a verse has nothing worth glossing, which is most verses.
 */
const KIND_LABEL: Partial<Record<GlossKind, StringKey>> = {
  arch: 'glossary_archaic',
  grammar: 'glossary_grammar',
  name: 'glossary_name',
}

// Presentational: the verse sheet owns the loaded words and which entry is open, so a
// grey marker tapped in the verse text can drive this panel (open the row, scroll to it).
function Glossary({
  words,
  open,
  onOpenChange,
  t,
  canSpeak,
  onSpeakWord,
}: {
  words: GlossWord[]
  open: string | null
  onOpenChange: (key: string | null) => void
  t: T
  canSpeak: (l: Lang) => boolean
  onSpeakWord: (text: string, lang: Lang) => void
}) {
  if (!words.length) return null
  return (
    <div className="conc gloss">
      <div className="conchead">
        <b>{t('glossary')}</b>
        <small>{t('glossary_sub')}</small>
      </div>
      <ul className="conclist">
        {words.map((w) => {
          const isOpen = open === w.key
          const badge = KIND_LABEL[w.kind]
          return (
            <li key={w.key} id={`gloss-${w.key}`}>
              <div className="crowline">
                <button
                  className={`crowbtn ${isOpen ? 'on' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => onOpenChange(isOpen ? null : w.key)}
                >
                  <span className="cword">{w.word}</span>
                  {w.modern && <span className="gmod">{w.modern}</span>}
                  {badge && <small className="ccode">{t(badge)}</small>}
                </button>
                {canSpeak('en') && (
                  <button
                    className="cspeak"
                    title={`${t('pronounce')}: ${w.word}`}
                    aria-label={`${t('pronounce')}: ${w.word}`}
                    onClick={() => onSpeakWord(w.word, 'en')}
                  >
                    ▶
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="cdef">
                  <span>{w.note}</span>
                  {w.modern && canSpeak('en') && (
                    <button className="mini gsay" onClick={() => onSpeakWord(w.modern!, 'en')}>
                      ▶ {w.modern}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

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
    <div className="conc strongs">
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
  showFurigana,
  t,
  onCopyText,
  onCopyLink,
  onCopyInvite,
  onPlay,
  onNote,
  canSpeak,
  onSpeakWord,
  onClose,
}: {
  data: VerseSheetData | null
  showFurigana: boolean
  t: T
  onCopyText: () => void
  onCopyLink: () => void
  onCopyInvite: () => void
  onPlay: () => void
  onNote: () => void
  canSpeak: (l: Lang) => boolean
  onSpeakWord: (text: string, lang: Lang) => void
  onClose: () => void
}) {
  // The sheet owns the glossary load and which entry is open, so a grey marker tapped
  // in the verse text can open (and scroll to) the matching row in the panel below.
  const [glossWords, setGlossWords] = useState<GlossWord[]>([])
  const [openGloss, setOpenGloss] = useState<string | null>(null)
  useEffect(() => {
    setOpenGloss(null)
    if (!data || data.lang !== 'en') {
      setGlossWords([])
      return
    }
    let live = true
    verseGloss(data.slug, data.ch, data.v).then((w) => {
      if (live) setGlossWords(w ?? [])
    })
    return () => {
      live = false
    }
  }, [data?.slug, data?.ch, data?.v, data?.lang])
  const glossMap = useMemo(
    () => new Map(glossWords.map((w) => [w.word.toLowerCase(), w.key])),
    [glossWords],
  )
  if (!data) return null
  const l = data.lang
  const m = BY_ID[l]
  const text = data.text[l]
  const note = coverageNote(t, l)
  // Open a glossary entry from a marker tapped in the verse, and bring the row into view.
  const openGlossEntry = (key: string) => {
    setOpenGloss(key)
    requestAnimationFrame(() =>
      document.getElementById(`gloss-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet verse-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{data.label}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        {/* Only the edition you opened is shown, with its saved colour highlights
            suppressed, so there is no doubt which single verse Copy will take. */}
        <div className="compare">
          {/* id lets selectionContext() resolve a selection made in here: a reader can
              still highlight by selecting words, it just shows back in the reader. */}
          <div id={`sv-${l}-${data.ch}-${data.v}`} className="crow" lang={m.htmlLang} dir={m.dir}>
            <div className="clang">
              <span>
                {m.label} · {m.edition}
                {!text && note && <small className="cnote">{note}</small>}
              </span>
            </div>
            <div className="ctext">
              <VerseText
                text={text ?? ''}
                lang={l}
                showFurigana={showFurigana}
                showHighlights={false}
                gloss={l === 'en' ? glossMap : undefined}
                onGlossClick={l === 'en' ? openGlossEntry : undefined}
              />
            </div>
            {/* Speak this one verse in place. Distinct from the bottom Play, which reads
                on from here and closes the sheet. */}
            {text && canSpeak(l) && (
              <button
                className="cspeak vspeak"
                title={`${t('pronounce')}: ${m.label}`}
                aria-label={t('pronounce')}
                onClick={() => onSpeakWord(text, l)}
              >
                ▶
              </button>
            )}
          </div>
        </div>
        {WORD_PANEL[data.lang]?.includes('glossary') && (
          <Glossary
            words={glossWords}
            open={openGloss}
            onOpenChange={setOpenGloss}
            t={t}
            canSpeak={canSpeak}
            onSpeakWord={onSpeakWord}
          />
        )}
        {WORD_PANEL[data.lang]?.includes('concordance') && (
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
