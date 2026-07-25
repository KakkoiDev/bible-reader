import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookData, IndexItem, Lang } from './lib/types'
import { LANG_META, RING } from './lib/types'
import { VerseText } from './lib/format'

const BASE = import.meta.env.BASE_URL
const SWIPE_MIN = 45 // px horizontal threshold for a language swipe

interface Pos {
  slug: string
  chapter: number
  lang: Lang
  furigana: boolean
}

function loadPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem('pos') || '')
    if (p && p.slug) return { furigana: true, lang: 'en', chapter: 1, ...p }
  } catch { /* ignore */ }
  return { slug: 'genesis', chapter: 1, lang: 'en', furigana: true }
}

export default function App() {
  const [index, setIndex] = useState<IndexItem[]>([])
  const [pos, setPos] = useState<Pos>(loadPos)
  const [data, setData] = useState<BookData | null>(null)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches)
  const [loading, setLoading] = useState(false)

  const setPosPart = useCallback((p: Partial<Pos>) => setPos((prev) => ({ ...prev, ...p })), [])

  // responsive: three columns on wide screens, single ring language on mobile
  useEffect(() => {
    const mq = matchMedia('(min-width: 900px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // load book index once
  useEffect(() => {
    fetch(`${BASE}data/index.json`)
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex([]))
  }, [])

  // load current book whenever the slug changes
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${BASE}data/${pos.slug}.json`)
      .then((r) => r.json())
      .then((d: BookData) => {
        if (!alive) return
        setData(d)
        setPos((prev) => ({ ...prev, chapter: Math.min(prev.chapter, d.chapters.length) }))
      })
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [pos.slug])

  // persist position
  useEffect(() => {
    localStorage.setItem('pos', JSON.stringify(pos))
  }, [pos])

  const bookIdx = useMemo(() => index.findIndex((b) => b.slug === pos.slug), [index, pos.slug])
  const chapter = useMemo(
    () => data?.chapters.find((c) => c.n === pos.chapter) ?? data?.chapters[0],
    [data, pos.chapter],
  )

  // chapter navigation, rolling over book boundaries
  const goChapter = useCallback(
    (delta: number) => {
      if (!data) return
      const chapters = data.chapters
      const at = chapters.findIndex((c) => c.n === pos.chapter)
      const next = at + delta
      if (next >= 0 && next < chapters.length) {
        setPosPart({ chapter: chapters[next].n })
        window.scrollTo({ top: 0 })
      } else if (next < 0 && bookIdx > 0) {
        setPos((p) => ({ ...p, slug: index[bookIdx - 1].slug, chapter: 999 }))
        window.scrollTo({ top: 0 })
      } else if (next >= chapters.length && bookIdx < index.length - 1) {
        setPos((p) => ({ ...p, slug: index[bookIdx + 1].slug, chapter: 1 }))
        window.scrollTo({ top: 0 })
      }
    },
    [data, pos.chapter, bookIdx, index, setPosPart],
  )

  const cycleLang = useCallback(
    (dir: 1 | -1) => {
      const i = RING.indexOf(pos.lang)
      const n = (i + dir + RING.length) % RING.length
      setPosPart({ lang: RING[n] })
    },
    [pos.lang, setPosPart],
  )

  // keyboard: ←/→ change chapter; up/down arrows change language ring
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goChapter(1)
      else if (e.key === 'ArrowLeft') goChapter(-1)
      else if (!wide && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
        cycleLang(e.key === 'ArrowUp' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goChapter, cycleLang, wide])

  // touch swipe: horizontal cycles the language ring (mobile only)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current || wide) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      cycleLang(dx < 0 ? 1 : -1) // swipe left → next in ring, right → previous
    }
    touch.current = null
  }

  const langsToShow: Lang[] = wide ? RING : [pos.lang]

  return (
    <div className="app">
      <header className="bar">
        <div className="pickers">
          <select
            className="sel book"
            value={pos.slug}
            onChange={(e) => setPos((p) => ({ ...p, slug: e.target.value, chapter: 1 }))}
          >
            {index.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.en}
              </option>
            ))}
          </select>
          <select
            className="sel chap"
            value={pos.chapter}
            onChange={(e) => setPosPart({ chapter: Number(e.target.value) })}
          >
            {data?.chapters.map((c) => (
              <option key={c.n} value={c.n}>
                {c.n}
              </option>
            ))}
          </select>
        </div>
        <label className="furi">
          <input
            type="checkbox"
            checked={pos.furigana}
            onChange={(e) => setPosPart({ furigana: e.target.checked })}
          />
          ふりがな
        </label>
      </header>

      {!wide && (
        <div className="langring" role="tablist" aria-label="Language">
          {RING.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === pos.lang}
              className={`ringtab ${l === pos.lang ? 'active' : ''}`}
              onClick={() => setPosPart({ lang: l })}
            >
              <span lang={LANG_META[l].htmlLang}>{LANG_META[l].label}</span>
              <small>{LANG_META[l].edition}</small>
            </button>
          ))}
        </div>
      )}

      <main className="reader" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <h1 className="ref">
          {wide ? (
            <>{data?.en} {pos.chapter}</>
          ) : (
            <span lang={LANG_META[pos.lang].htmlLang}>
              {pos.lang === 'ja' ? `${data?.ja} ${pos.chapter}` : `${data?.en} ${pos.chapter}`}
            </span>
          )}
        </h1>

        {loading && !chapter ? (
          <p className="status">…</p>
        ) : (
          <div className={`cols cols-${langsToShow.length}`}>
            {langsToShow.map((l) => (
              <section key={l} className="col" lang={LANG_META[l].htmlLang}>
                {wide && (
                  <div className="colhead">
                    {LANG_META[l].label} · {LANG_META[l].edition}
                  </div>
                )}
                <ol className="verses">
                  {chapter?.verses.map((v) => (
                    <li key={v.v} className="verse">
                      <sup className="vn">{v.v}</sup>
                      <span className="vt">
                        <VerseText text={v[l]} lang={l} showFurigana={pos.furigana} />
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        <nav className="chapnav">
          <button onClick={() => goChapter(-1)} disabled={bookIdx === 0 && pos.chapter <= 1}>
            ← Prev
          </button>
          <span className="chaplabel">
            {data?.en} {pos.chapter}
          </span>
          <button
            onClick={() => goChapter(1)}
            disabled={bookIdx === index.length - 1 && data != null && pos.chapter >= data.chapters.length}
          >
            Next →
          </button>
        </nav>

        <footer className="attrib">
          English: King James Version (public domain) · Français: Bible King James
          Française © Nadine L. Stratford, reproduite sans modification · 日本語:
          文語訳聖書 (明治元訳・大正改訳, public domain)
        </footer>
      </main>
    </div>
  )
}
