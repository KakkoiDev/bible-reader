import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookData, IndexItem, Lang } from './lib/types'
import { LANG_META, RING } from './lib/types'
import { VerseText } from './lib/format'
import { useAnnotations, vref, parseRef, type HColor } from './lib/annotations'
import { rebuildHighlights, selectionContext, setWordHighlight, clearWordHighlight } from './lib/highlight'
import { ttsSupported, primeVoices, speakVerses, stopSpeaking, type Gender } from './lib/tts'
import {
  Toolbar,
  Settings,
  Drawer,
  NoteEditor,
  type Theme,
  type Size,
  type DrawerItem,
} from './components/Panels'

const BASE = import.meta.env.BASE_URL
const SWIPE_MIN = 45

interface Pos {
  slug: string
  chapter: number
  lang: Lang
}
interface Prefs {
  theme: Theme
  size: Size
  furigana: boolean
  rate: number
  voice: Gender
  swipe: boolean
}

// ---- URL hash: #/<slug>/<chapter>/<lang>[/<verse>] ----
interface HashLoc {
  slug: string
  chapter: number
  lang?: Lang
  verse?: number
}
function parseHash(): HashLoc | null {
  const h = location.hash.replace(/^#\/?/, '')
  if (!h) return null
  const [slug, ch, lang, verse] = h.split('/')
  const chapter = parseInt(ch, 10)
  if (!slug || !Number.isFinite(chapter)) return null
  const L = (RING as string[]).includes(lang) ? (lang as Lang) : undefined
  const v = verse != null ? parseInt(verse, 10) : NaN
  return { slug, chapter, lang: L, verse: Number.isFinite(v) ? v : undefined }
}
const buildHash = (slug: string, chapter: number, lang: Lang, verse?: number) =>
  `#/${slug}/${chapter}/${lang}` + (verse ? `/${verse}` : '')

const loadPrefs = (): Prefs => {
  const d: Prefs = { theme: 'system', size: 'md', furigana: true, rate: 1, voice: 'male', swipe: false }
  try {
    return { ...d, ...JSON.parse(localStorage.getItem('prefs') || '{}') }
  } catch {
    return d
  }
}
const loadLastRead = (): { slug: string; chapter: number; lang: Lang; verse: number } | null => {
  try {
    return JSON.parse(localStorage.getItem('lastRead') || 'null')
  } catch {
    return null
  }
}

export default function App() {
  const initHash = parseHash()
  const initLast = initHash ? null : loadLastRead()

  const [index, setIndex] = useState<IndexItem[]>([])
  const [pos, setPos] = useState<Pos>(() =>
    initHash
      ? { slug: initHash.slug, chapter: initHash.chapter, lang: initHash.lang ?? 'en' }
      : initLast
        ? { slug: initLast.slug, chapter: initLast.chapter, lang: initLast.lang }
        : { slug: 'genesis', chapter: 1, lang: 'en' },
  )
  const [flashVerse, setFlashVerse] = useState<number | null>(initHash?.verse ?? initLast?.verse ?? null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [data, setData] = useState<BookData | null>(null)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState<{ v: number; lang: Lang } | null>(null)
  const [playingLang, setPlayingLang] = useState<Lang | null>(null)
  const canTTS = ttsSupported()

  const { store, addHighlight, clearHighlightsIn, setNote, remove } = useAnnotations()
  const [sel, setSel] = useState<{ lang: Lang; v: number; start: number; end: number; rect: DOMRect } | null>(null)
  const [noteRef, setNoteRef] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const readerRef = useRef<HTMLElement>(null)

  const setPref = useCallback((p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p })), [])

  // navigation via URL hash (shareable, back-button friendly)
  const navigate = useCallback((next: { slug?: string; chapter?: number; lang?: Lang; verse?: number }) => {
    setPos((prev) => {
      location.hash = buildHash(next.slug ?? prev.slug, next.chapter ?? prev.chapter, next.lang ?? prev.lang, next.verse)
      return prev
    })
  }, [])

  // apply prefs to <html> for CSS
  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme === 'system' ? '' : prefs.theme
    el.dataset.size = prefs.size
    localStorage.setItem('prefs', JSON.stringify(prefs))
  }, [prefs])

  // responsive
  useEffect(() => {
    const mq = matchMedia('(min-width: 900px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // apply hash on change (pasted link, back/forward)
  useEffect(() => {
    const apply = () => {
      const h = parseHash()
      if (!h) return
      setPos((prev) => ({ ...prev, slug: h.slug, chapter: h.chapter, lang: h.lang ?? prev.lang }))
      setFlashVerse(h.verse ?? null)
    }
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  // load index + book
  useEffect(() => {
    fetch(`${BASE}data/index.json`).then((r) => r.json()).then(setIndex).catch(() => setIndex([]))
  }, [])
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

  const bookIdx = useMemo(() => index.findIndex((b) => b.slug === pos.slug), [index, pos.slug])
  const chapter = useMemo(
    () => data?.chapters.find((c) => c.n === pos.chapter) ?? data?.chapters[0],
    [data, pos.chapter],
  )
  const langsToShow: Lang[] = wide ? RING : [pos.lang]

  // ---- audio (Web Speech) ----
  useEffect(() => {
    primeVoices()
  }, [])
  const stopAudio = useCallback(() => {
    stopSpeaking()
    clearWordHighlight()
    setSpeaking(null)
    setPlayingLang(null)
  }, [])
  const speakList = useCallback(
    (lang: Lang, verses: { v: number; text: string }[]) => {
      if (!canTTS || !verses.length) return
      setPlayingLang(lang)
      setSpeaking(null)
      clearWordHighlight()
      speakVerses(verses, lang, prefs.rate, prefs.voice, {
        onVerse: (v) => {
          setSpeaking({ v, lang })
          clearWordHighlight()
          document.getElementById(`v-${lang}-${v}`)?.scrollIntoView({ block: 'center' })
        },
        onWord: (v, s, e) => {
          const el = document.getElementById(`v-${lang}-${v}`)?.querySelector('.vt')
          if (el) setWordHighlight(el, s, e)
        },
        onDone: () => {
          clearWordHighlight()
          setSpeaking(null)
          setPlayingLang(null)
        },
      })
    },
    [canTTS, prefs.rate, prefs.voice],
  )
  // Play the whole chapter in one language, from the top-visible verse of that column.
  const playChapter = useCallback(
    (lang: Lang) => {
      if (!chapter) return
      const els = readerRef.current?.querySelectorAll(`[id^="v-${lang}-"]`)
      let start = chapter.verses[0]?.v ?? 1
      if (els) {
        for (const el of els) {
          if (el.getBoundingClientRect().bottom > 96) {
            start = Number(/-(\d+)$/.exec(el.id)?.[1] ?? start)
            break
          }
        }
      }
      speakList(lang, chapter.verses.filter((v) => v.v >= start).map((v) => ({ v: v.v, text: v[lang] })))
    },
    [chapter, speakList],
  )
  const playVerse = useCallback((lang: Lang, v: number, text: string) => speakList(lang, [{ v, text }]), [speakList])
  // stop audio when leaving the current chapter/language
  useEffect(() => () => stopAudio(), [pos.slug, pos.chapter, pos.lang, stopAudio])

  // scroll to flashed verse once rendered; auto-clear the flash
  useEffect(() => {
    if (flashVerse == null || !data) return
    const raf = requestAnimationFrame(() =>
      document.getElementById(`v-${pos.lang}-${flashVerse}`)?.scrollIntoView({ block: 'center' }),
    )
    const t = setTimeout(() => setFlashVerse(null), 4000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [flashVerse, data, pos.chapter, pos.lang, wide])

  // rebuild CSS highlights for the visible chapter
  useEffect(() => {
    const items: { el: Element; h: import('./lib/annotations').HRange }[] = []
    if (chapter) {
      for (const v of chapter.verses) {
        const ann = store[vref(pos.slug, pos.chapter, v.v)]
        if (!ann?.highlights) continue
        for (const h of ann.highlights) {
          if (!langsToShow.includes(h.lang)) continue
          const el = document.getElementById(`v-${h.lang}-${v.v}`)?.querySelector('.vt')
          if (el) items.push({ el, h })
        }
      }
    }
    rebuildHighlights(items)
  }, [store, chapter, pos.slug, pos.chapter, pos.lang, wide, prefs.furigana])

  // remember the top-visible verse for resume-on-reopen
  useEffect(() => {
    const el = readerRef.current
    if (!el || !data) return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const m = /^v-(en|ja|fr)-(\d+)$/.exec(e.target.id)
          if (!m) continue
          if (!(wide || m[1] === pos.lang)) continue
          if (e.isIntersecting) visible.set(e.target.id, Number(m[2]))
          else visible.delete(e.target.id)
        }
        let top = Infinity
        for (const v of visible.values()) top = Math.min(top, v)
        if (top !== Infinity)
          localStorage.setItem('lastRead', JSON.stringify({ slug: pos.slug, chapter: pos.chapter, lang: pos.lang, verse: top }))
      },
      { rootMargin: '-84px 0px -55% 0px', threshold: 0 },
    )
    el.querySelectorAll('.verse').forEach((v) => io.observe(v))
    return () => io.disconnect()
  }, [data, pos.slug, pos.chapter, pos.lang, wide, prefs.furigana])

  // text-selection → annotation toolbar
  useEffect(() => {
    let t = 0
    const handler = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const el = readerRef.current
        if (!el) return
        const ctx = selectionContext(el)
        if (ctx) setSel({ lang: ctx.lang, v: ctx.v, start: ctx.start, end: ctx.end, rect: ctx.rect })
        else {
          const s = window.getSelection()
          if (!s || s.isCollapsed) setSel(null)
        }
      }, 180)
    }
    document.addEventListener('selectionchange', handler)
    return () => {
      document.removeEventListener('selectionchange', handler)
      window.clearTimeout(t)
    }
  }, [])

  const goChapter = useCallback(
    (delta: number) => {
      if (!data) return
      const at = data.chapters.findIndex((c) => c.n === pos.chapter)
      const nx = at + delta
      if (nx >= 0 && nx < data.chapters.length) navigate({ chapter: data.chapters[nx].n })
      else if (nx < 0 && bookIdx > 0) navigate({ slug: index[bookIdx - 1].slug, chapter: 999 })
      else if (nx >= data.chapters.length && bookIdx < index.length - 1) navigate({ slug: index[bookIdx + 1].slug, chapter: 1 })
      else return
      window.scrollTo({ top: 0 })
    },
    [data, pos.chapter, bookIdx, index, navigate],
  )
  const cycleLang = useCallback(
    (dir: 1 | -1) => {
      const i = RING.indexOf(pos.lang)
      navigate({ lang: RING[(i + dir + RING.length) % RING.length], verse: flashVerse ?? undefined })
    },
    [pos.lang, flashVerse, navigate],
  )

  const linkVerse = useCallback(
    async (lang: Lang, v: number) => {
      navigate({ lang, verse: v })
      const url = `${location.origin}${location.pathname}${buildHash(pos.slug, pos.chapter, lang, v)}`
      try {
        await navigator.clipboard.writeText(url)
        setToast('Verse link copied')
      } catch {
        setToast('Verse linked — copy from the address bar')
      }
    },
    [navigate, pos.slug, pos.chapter],
  )
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight') goChapter(1)
      else if (e.key === 'ArrowLeft') goChapter(-1)
      else if (!wide && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) cycleLang(e.key === 'ArrowUp' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goChapter, cycleLang, wide])

  // swipe → language ring
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current || wide || !prefs.swipe) return
    if (!window.getSelection()?.isCollapsed) return // don't swipe while selecting text
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) cycleLang(dx < 0 ? 1 : -1)
    touch.current = null
  }

  // annotation actions bound to the current selection
  const selRef = sel ? vref(pos.slug, pos.chapter, sel.v) : null
  const selHasHL = !!(sel && store[selRef!]?.highlights?.some((h) => h.lang === sel.lang && h.start < sel.end && h.end > sel.start))
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges()
    setSel(null)
  }
  const doColor = (c: HColor) => {
    if (sel && selRef) addHighlight(selRef, { lang: sel.lang, start: sel.start, end: sel.end, color: c })
    clearSelection()
  }

  const labelFor = useCallback(
    (ref: string) => {
      const { slug, ch, v } = parseRef(ref)
      const en = index.find((b) => b.slug === slug)?.en ?? slug
      return `${en} ${ch}:${v}`
    },
    [index],
  )
  const drawerItems: DrawerItem[] = useMemo(() => {
    const rank = (slug: string) => index.findIndex((b) => b.slug === slug)
    return Object.entries(store)
      .filter(([, a]) => a.note || a.highlights?.length)
      .map(([ref, a]) => ({
        ref,
        label: labelFor(ref),
        note: a.note,
        colors: [...new Set((a.highlights || []).map((h) => h.color))],
      }))
      .sort((x, y) => {
        const px = parseRef(x.ref)
        const py = parseRef(y.ref)
        return rank(px.slug) - rank(py.slug) || px.ch - py.ch || px.v - py.v
      })
  }, [store, index, labelFor])

  return (
    <div className="app">
      <header className="bar">
        <div className="pickers">
          <select className="sel book" value={pos.slug} onChange={(e) => navigate({ slug: e.target.value, chapter: 1 })}>
            {index.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.en}
              </option>
            ))}
          </select>
          <select className="sel chap" value={pos.chapter} onChange={(e) => navigate({ chapter: Number(e.target.value) })}>
            {data?.chapters.map((c) => (
              <option key={c.n} value={c.n}>
                {c.n}
              </option>
            ))}
          </select>
        </div>
        <div className="tools">
          <button className="icon" title="Saved (notes & highlights)" onClick={() => setDrawerOpen(true)}>🔖</button>
          <button className="icon" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      {!wide && (
        <div className="langring" role="tablist" aria-label="Language">
          {RING.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === pos.lang}
              className={`ringtab ${l === pos.lang ? 'active' : ''}`}
              onClick={() => navigate({ lang: l, verse: flashVerse ?? undefined })}
            >
              <span lang={LANG_META[l].htmlLang}>{LANG_META[l].label}</span>
              <small>{LANG_META[l].edition}</small>
            </button>
          ))}
        </div>
      )}

      <main className="reader" ref={readerRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
                {(wide || canTTS) && (
                  <div className="colhead">
                    {wide && <span>{LANG_META[l].label} · {LANG_META[l].edition}</span>}
                    {canTTS && (
                      <button
                        className={`colplay ${playingLang === l ? 'on' : ''}`}
                        title={playingLang === l ? 'Stop' : `Play chapter (${LANG_META[l].label})`}
                        onClick={() => (playingLang === l ? stopAudio() : playChapter(l))}
                      >
                        {playingLang === l ? '⏹' : '▶'} {LANG_META[l].edition}
                      </button>
                    )}
                  </div>
                )}
                <ol className="verses">
                  {chapter?.verses.map((v) => {
                    const ref = vref(pos.slug, pos.chapter, v.v)
                    const ann = store[ref]
                    return (
                      <li
                        key={v.v}
                        id={`v-${l}-${v.v}`}
                        className={`verse ${flashVerse === v.v && pos.lang === l ? 'flash' : ''} ${
                          speaking?.v === v.v && speaking?.lang === l ? 'speaking' : ''
                        }`}
                      >
                        <button className="vn" title="Copy link to this verse" onClick={() => linkVerse(l, v.v)}>
                          {v.v}
                        </button>
                        {canTTS &&
                          (() => {
                            const spk = speaking?.v === v.v && speaking?.lang === l
                            return (
                              <button
                                className={`vplay ${spk ? 'on' : ''}`}
                                title={spk ? 'Stop' : 'Play verse'}
                                onClick={() => (spk ? stopAudio() : playVerse(l, v.v, v[l]))}
                              >
                                {spk ? '⏹' : '▶'}
                              </button>
                            )
                          })()}
                        {ann?.note && (
                          <button className="mk note" title="Note" onClick={() => setNoteRef(ref)}>
                            ✎
                          </button>
                        )}
                        <span className="vt">
                          <VerseText text={v[l]} lang={l} showFurigana={prefs.furigana} />
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        <nav className="chapnav">
          <button onClick={() => goChapter(-1)} disabled={bookIdx === 0 && pos.chapter <= 1}>← Prev</button>
          <span className="chaplabel">{data?.en} {pos.chapter}</span>
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

      {sel && (
        <Toolbar
          rect={sel.rect}
          dock={wide ? 'float' : 'bottom'}
          hasHL={selHasHL}
          onColor={doColor}
          onNote={() => {
            if (selRef) setNoteRef(selRef)
            clearSelection()
          }}
          onClear={() => {
            if (sel && selRef) clearHighlightsIn(selRef, sel.lang, sel.start, sel.end)
            clearSelection()
          }}
        />
      )}

      <Settings
        open={settingsOpen}
        theme={prefs.theme}
        size={prefs.size}
        furigana={prefs.furigana}
        rate={prefs.rate}
        voice={prefs.voice}
        swipe={prefs.swipe}
        ttsOn={canTTS}
        onTheme={(t) => setPref({ theme: t })}
        onSize={(s) => setPref({ size: s })}
        onFurigana={(f) => setPref({ furigana: f })}
        onRate={(r) => setPref({ rate: r })}
        onVoice={(g) => setPref({ voice: g })}
        onSwipe={(v) => setPref({ swipe: v })}
        onClose={() => setSettingsOpen(false)}
      />

      <Drawer
        open={drawerOpen}
        items={drawerItems}
        onJump={(ref) => {
          const { slug, ch, v } = parseRef(ref)
          navigate({ slug, chapter: ch, verse: v })
          setDrawerOpen(false)
        }}
        onDelete={(ref) => remove(ref)}
        onClose={() => setDrawerOpen(false)}
      />

      {noteRef && (
        <NoteEditor
          label={labelFor(noteRef)}
          value={store[noteRef]?.note ?? ''}
          onSave={(text) => {
            setNote(noteRef, text)
            setNoteRef(null)
          }}
          onDelete={() => {
            remove(noteRef)
            setNoteRef(null)
          }}
          onClose={() => setNoteRef(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
