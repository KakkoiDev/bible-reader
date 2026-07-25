import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookData, IndexItem, Lang } from './lib/types'
import { LANG_META, RING } from './lib/types'
import { VerseText } from './lib/format'
import { useAnnotations, vref, parseRef, type HColor } from './lib/annotations'
import { selectionContext, setWordHighlight, clearWordHighlight } from './lib/highlight'
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
import { SearchSheet, Navigator, VerseSheet, type VerseSheetData } from './components/Sheets'
import { FR_BOOKS } from './lib/frbooks'

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
  flow: boolean
  columns: Lang[]
}
type Paragraphs = Record<string, Record<string, number[]>>

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
  const d: Prefs = { theme: 'system', size: 'md', furigana: true, rate: 1, voice: 'male', swipe: false, flow: false, columns: ['en', 'ja', 'fr'] }
  try {
    const p = { ...d, ...JSON.parse(localStorage.getItem('prefs') || '{}') }
    const valid = [...new Set((p.columns || []).filter((l: Lang) => (RING as string[]).includes(l)))] as Lang[]
    p.columns = valid.length ? valid : ['en', 'ja', 'fr']
    return p
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
  const [speaking, setSpeaking] = useState<{ ch: number; v: number; lang: Lang } | null>(null)
  const [playingLang, setPlayingLang] = useState<Lang | null>(null)
  const [autoNext, setAutoNext] = useState<Lang | null>(null)
  const [pending, setPending] = useState<{ slug: string; chapter: number; lang: Lang } | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [verseSheet, setVerseSheet] = useState<(VerseSheetData & { slug: string; ch: number; v: number }) | null>(null)
  const [paras, setParas] = useState<Paragraphs>({})
  const canTTS = ttsSupported()

  const { store, addHighlight, clearHighlightsIn, setNote, remove, importStore } = useAnnotations()
  const [sel, setSel] = useState<{ lang: Lang; ch: number; v: number; start: number; end: number; rect: DOMRect } | null>(null)
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

  // load index + book + paragraph boundaries (for flow mode)
  useEffect(() => {
    fetch(`${BASE}data/index.json`).then((r) => r.json()).then(setIndex).catch(() => setIndex([]))
    fetch(`${BASE}data/paragraphs.json`).then((r) => r.json()).then(setParas).catch(() => setParas({}))
  }, [])
  const flow = prefs.flow
  const verseElId = useCallback(
    (ch: number, v: number, lang: Lang) => (flow ? `fv-${ch}-${v}` : `v-${lang}-${v}`),
    [flow],
  )
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
  const langsToShow: Lang[] = flow || !wide ? [pos.lang] : prefs.columns
  // keep the current language among the enabled columns
  useEffect(() => {
    if (prefs.columns.length && !prefs.columns.includes(pos.lang)) navigate({ lang: prefs.columns[0] })
  }, [prefs.columns, pos.lang, navigate])

  // ---- audio (Web Speech) ----
  useEffect(() => {
    primeVoices()
  }, [])
  const genRef = useRef(0) // bumped on stop/new-play so stale callbacks are ignored
  const stopAudio = useCallback(() => {
    genRef.current++
    stopSpeaking()
    clearWordHighlight()
    setSpeaking(null)
    setPlayingLang(null)
    setAutoNext(null)
    setPending(null)
  }, [])
  const speakList = useCallback(
    (lang: Lang, verses: { ch: number; v: number; text: string }[], continuous: boolean) => {
      if (!canTTS || !verses.length) return
      const gen = ++genRef.current
      const chOf = new Map(verses.map((x) => [x.v, x.ch]))
      setPlayingLang(lang)
      setSpeaking(null)
      clearWordHighlight()
      speakVerses(verses, lang, prefs.rate, prefs.voice, {
        onVerse: (v) => {
          if (gen !== genRef.current) return
          const ch = chOf.get(v) ?? pos.chapter
          setSpeaking({ ch, v, lang })
          clearWordHighlight()
          const el = document.getElementById(verseElId(ch, v, lang))
          if (el) {
            // Only glide when the active verse leaves a comfortable band, so it
            // doesn't re-center (jitter) on every verse.
            const r = el.getBoundingClientRect()
            const vh = window.innerHeight || document.documentElement.clientHeight
            if (r.top < vh * 0.2 || r.bottom > vh * 0.72) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        },
        onWord: (v, s, e) => {
          if (gen !== genRef.current) return
          const el = document.getElementById(verseElId(chOf.get(v) ?? pos.chapter, v, lang))?.querySelector('.vt')
          if (el) setWordHighlight(el, s, e)
        },
        onDone: () => {
          if (gen !== genRef.current) return
          clearWordHighlight()
          setSpeaking(null)
          setPlayingLang(null)
          if (continuous) setAutoNext(lang) // advance to the next chapter
        },
      })
    },
    [canTTS, prefs.rate, prefs.voice, verseElId, pos.chapter],
  )
  // Play the whole chapter in one language, from the top-visible verse of that column.
  const playChapter = useCallback(
    (lang: Lang) => {
      if (!chapter) return
      const els = readerRef.current?.querySelectorAll(`[id^="${flow ? 'fv-' + chapter.n + '-' : 'v-' + lang + '-'}"]`)
      let start = chapter.verses[0]?.v ?? 1
      if (els) {
        for (const el of els) {
          if (el.getBoundingClientRect().bottom > 96) {
            start = Number(/-(\d+)$/.exec(el.id)?.[1] ?? start)
            break
          }
        }
      }
      speakList(lang, chapter.verses.filter((v) => v.v >= start).map((v) => ({ ch: chapter.n, v: v.v, text: v[lang] })), true)
    },
    [chapter, speakList, flow],
  )
  const playVerse = useCallback(
    (lang: Lang, ch: number, v: number, text: string) => speakList(lang, [{ ch, v, text }], false),
    [speakList],
  )
  // Play continuously from a given verse onward (through the chapter, then the book).
  const playFrom = useCallback(
    (lang: Lang, ch: number, v: number) => {
      const c = data?.chapters.find((x) => x.n === ch)
      if (!c) return
      speakList(lang, c.verses.filter((x) => x.v >= v).map((x) => ({ ch, v: x.v, text: x[lang] })), true)
    },
    [data, speakList],
  )
  useEffect(() => () => stopSpeaking(), []) // stop on unmount

  // user navigation stops audio; auto-advance (below) uses navigate() directly so it doesn't
  const go = useCallback(
    (next: { slug?: string; chapter?: number; lang?: Lang; verse?: number }) => {
      stopAudio()
      navigate(next)
    },
    [stopAudio, navigate],
  )
  // continuous playback: when a chapter ends, move to the next chapter/book and keep playing
  useEffect(() => {
    if (autoNext == null || !data) return
    const lang = autoNext
    setAutoNext(null)
    const at = data.chapters.findIndex((c) => c.n === pos.chapter)
    let target: { slug: string; chapter: number; lang: Lang } | null = null
    if (at < data.chapters.length - 1) target = { slug: pos.slug, chapter: data.chapters[at + 1].n, lang }
    else if (bookIdx < index.length - 1) target = { slug: index[bookIdx + 1].slug, chapter: 1, lang }
    if (target) {
      setPending(target)
      navigate({ slug: target.slug, chapter: target.chapter })
      window.scrollTo({ top: 0 })
    }
  }, [autoNext, data, pos.slug, pos.chapter, bookIdx, index, navigate])
  useEffect(() => {
    if (!pending || !chapter) return
    if (pos.slug === pending.slug && pos.chapter === pending.chapter && chapter.n === pending.chapter) {
      const lang = pending.lang
      setPending(null)
      speakList(lang, chapter.verses.map((v) => ({ ch: chapter.n, v: v.v, text: v[lang] })), true)
    }
  }, [pending, chapter, pos.slug, pos.chapter, speakList])

  // scroll to flashed verse once rendered; auto-clear the flash
  useEffect(() => {
    if (flashVerse == null || !data) return
    const raf = requestAnimationFrame(() =>
      document.getElementById(verseElId(pos.chapter, flashVerse, pos.lang))?.scrollIntoView({ block: 'center' }),
    )
    const t = setTimeout(() => setFlashVerse(null), 4000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [flashVerse, data, pos.chapter, pos.lang, wide, verseElId])

  // remember the top-visible verse for resume-on-reopen (and, in flow, the current chapter)
  const posRef = useRef(pos)
  posRef.current = pos
  useEffect(() => {
    const el = readerRef.current
    if (!el || !data) return
    const visible = new Map<string, { ch: number; v: number }>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const mf = /^fv-(\d+)-(\d+)$/.exec(e.target.id)
          const mn = /^v-(en|ja|fr)-(\d+)$/.exec(e.target.id)
          let cur: { ch: number; v: number } | null = null
          if (mf) cur = { ch: Number(mf[1]), v: Number(mf[2]) }
          else if (mn && (wide || mn[1] === posRef.current.lang)) cur = { ch: posRef.current.chapter, v: Number(mn[2]) }
          if (!cur) continue
          if (e.isIntersecting) visible.set(e.target.id, cur)
          else visible.delete(e.target.id)
        }
        let best: { ch: number; v: number } | null = null
        for (const c of visible.values()) if (!best || c.ch < best.ch || (c.ch === best.ch && c.v < best.v)) best = c
        if (best) {
          localStorage.setItem('lastRead', JSON.stringify({ slug: posRef.current.slug, chapter: best.ch, lang: posRef.current.lang, verse: best.v }))
          if (flow) setPos((prev) => (prev.chapter === best!.ch ? prev : { ...prev, chapter: best!.ch }))
        }
      },
      { rootMargin: '-84px 0px -55% 0px', threshold: 0 },
    )
    el.querySelectorAll(flow ? '.fverse' : '.verse').forEach((x) => io.observe(x))
    return () => io.disconnect()
  }, [data, pos.slug, pos.lang, wide, prefs.furigana, flow])

  // text-selection → annotation toolbar
  useEffect(() => {
    let t = 0
    const handler = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const el = readerRef.current
        if (!el) return
        const ctx = selectionContext(el)
        if (ctx)
          setSel({
            lang: ctx.lang ?? posRef.current.lang,
            ch: ctx.ch ?? posRef.current.chapter,
            v: ctx.v,
            start: ctx.start,
            end: ctx.end,
            rect: ctx.rect,
          })
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
      if (nx >= 0 && nx < data.chapters.length) go({ chapter: data.chapters[nx].n })
      else if (nx < 0 && bookIdx > 0) go({ slug: index[bookIdx - 1].slug, chapter: 999 })
      else if (nx >= data.chapters.length && bookIdx < index.length - 1) go({ slug: index[bookIdx + 1].slug, chapter: 1 })
      else return
      window.scrollTo({ top: 0 })
    },
    [data, pos.chapter, bookIdx, index, go],
  )
  const cycleLang = useCallback(
    (dir: 1 | -1) => {
      const ring = prefs.columns
      const i = Math.max(0, ring.indexOf(pos.lang))
      go({ lang: ring[(i + dir + ring.length) % ring.length], verse: flashVerse ?? undefined })
    },
    [pos.lang, flashVerse, go, prefs.columns],
  )

  // Copy a shareable link to a verse (does not move you or stop audio).
  const copyVerseLink = useCallback(
    async (lang: Lang, v: number) => {
      const url = `${location.origin}${location.pathname}${buildHash(pos.slug, pos.chapter, lang, v)}`
      try {
        await navigator.clipboard.writeText(url)
        setToast('Verse link copied')
      } catch {
        setToast('Could not copy the link')
      }
    },
    [pos.slug, pos.chapter],
  )
  const copyVerseText = useCallback(
    async (lang: Lang, slug: string, ch: number, v: number, text: string) => {
      const plain =
        lang === 'en'
          ? text.replace(/[{}]/g, '')
          : lang === 'ja'
            ? text.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1')
            : text
      const b = index.find((x) => x.slug === slug)
      const book = lang === 'ja' ? b?.ja || slug : lang === 'fr' ? FR_BOOKS[slug] || b?.en || slug : b?.en || slug
      const version =
        lang === 'en' ? 'King James Version (KJV)' : lang === 'ja' ? '文語訳聖書' : 'Bible King James Française (KJF)'
      try {
        await navigator.clipboard.writeText(`"${plain}" [${book} ${ch}:${v}] ${version}`)
        setToast('Verse copied')
      } catch {
        setToast('Could not copy the text')
      }
    },
    [index],
  )
  const openVerseAt = useCallback(
    (lang: Lang, ch: number, v: number) => {
      const vv = data?.chapters.find((c) => c.n === ch)?.verses.find((x) => x.v === v)
      if (!vv) return
      setVerseSheet({ label: `${data?.en} ${ch}:${v}`, lang, en: vv.en, fr: vv.fr, ja: vv.ja, slug: pos.slug, ch, v })
    },
    [data, pos.slug],
  )
  // paragraphs for flow/reading mode (whole book, single language, logical breaks)
  const flowParas = useMemo(() => {
    if (!flow || !data) return []
    const breaks = paras[pos.slug] || {}
    const out: { ch: number; v: number; text: string; ann: import('./lib/annotations').Ann | undefined }[][] = []
    let cur: (typeof out)[number] = []
    for (const c of data.chapters) {
      const chBreaks = breaks[String(c.n)] || []
      for (const vv of c.verses) {
        if (chBreaks.includes(vv.v) && cur.length) {
          out.push(cur)
          cur = []
        }
        cur.push({ ch: c.n, v: vv.v, text: vv[pos.lang], ann: store[vref(pos.slug, c.n, vv.v)] })
      }
    }
    if (cur.length) out.push(cur)
    return out
  }, [flow, data, paras, pos.slug, pos.lang, store])
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
  const selRef = sel ? vref(pos.slug, sel.ch, sel.v) : null
  const selHasHL = !!(sel && store[selRef!]?.highlights?.some((h) => h.lang === sel.lang && h.start < sel.end && h.end > sel.start))
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges()
    setSel(null)
  }
  const doColor = (c: HColor) => {
    if (sel && selRef) addHighlight(selRef, { lang: sel.lang, start: sel.start, end: sel.end, color: c })
    clearSelection()
  }

  const exportAnnotations = useCallback(() => {
    const payload = { app: 'bible-reader', type: 'annotations', version: 1, exportedAt: new Date().toISOString(), data: store }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bible-notes-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    const n = Object.keys(store).length
    setToast(n ? `Exported ${n} verse${n === 1 ? '' : 's'}` : 'Nothing to export yet')
  }, [store])

  const importAnnotations = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result))
          const data = parsed && parsed.type === 'annotations' && parsed.data ? parsed.data : parsed
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad')
          importStore(data)
          const n = Object.keys(data).length
          setToast(`Imported ${n} verse${n === 1 ? '' : 's'}`)
        } catch {
          setToast('Could not read that file')
        }
      }
      reader.onerror = () => setToast('Could not read that file')
      reader.readAsText(file)
    },
    [importStore],
  )

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
        <button className="navbtn" onClick={() => setNavOpen(true)}>
          {data?.en} {pos.chapter} <span className="caret">▾</span>
        </button>
        <div className="tools">
          <button className="icon" title="Search" onClick={() => setSearchOpen(true)}>🔍</button>
          <button className="icon" title="Saved (notes & highlights)" onClick={() => setDrawerOpen(true)}>🔖</button>
          <button className="icon" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      {(!wide || flow) && prefs.columns.length > 1 && (
        <div className="langring" role="tablist" aria-label="Language">
          {prefs.columns.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === pos.lang}
              className={`ringtab ${l === pos.lang ? 'active' : ''}`}
              onClick={() => go({ lang: l, verse: flashVerse ?? undefined })}
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
        ) : flow ? (
          <div className="flow" lang={LANG_META[pos.lang].htmlLang}>
            {flowParas.map((para, pi) => (
              <p className="fpar" key={pi}>
                {para.map((it) => (
                  <span
                    key={`${it.ch}-${it.v}`}
                    id={`fv-${it.ch}-${it.v}`}
                    className={`fverse ${flashVerse === it.v && pos.chapter === it.ch ? 'flash' : ''} ${
                      speaking?.ch === it.ch && speaking?.v === it.v ? 'speaking' : ''
                    }`}
                    onClick={() => window.getSelection()?.isCollapsed && openVerseAt(pos.lang, it.ch, it.v)}
                  >
                    <VerseText
                      text={it.text}
                      lang={pos.lang}
                      showFurigana={prefs.furigana}
                      highlights={it.ann?.highlights?.filter((h) => h.lang === pos.lang)}
                    />{' '}
                  </span>
                ))}
              </p>
            ))}
          </div>
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
                    const spk = speaking?.ch === pos.chapter && speaking?.v === v.v && speaking?.lang === l
                    return (
                      <li
                        key={v.v}
                        id={`v-${l}-${v.v}`}
                        className={`verse ${flashVerse === v.v && pos.lang === l ? 'flash' : ''} ${spk ? 'speaking' : ''}`}
                      >
                        <button className="vn" title="Verse actions" onClick={() => openVerseAt(l, pos.chapter, v.v)}>
                          {v.v}
                        </button>
                        {canTTS && (
                          <button
                            className={`vplay ${spk ? 'on' : ''}`}
                            title={spk ? 'Stop' : 'Play verse'}
                            onClick={() => (spk ? stopAudio() : playVerse(l, pos.chapter, v.v, v[l]))}
                          >
                            {spk ? '⏹' : '▶'}
                          </button>
                        )}
                        {ann?.note && (
                          <button className="mk note" title="Note" onClick={() => setNoteRef(ref)}>
                            ✎
                          </button>
                        )}
                        <span
                          className="vt"
                          onClick={() => window.getSelection()?.isCollapsed && openVerseAt(l, pos.chapter, v.v)}
                        >
                          <VerseText
                            text={v[l]}
                            lang={l}
                            showFurigana={prefs.furigana}
                            highlights={ann?.highlights?.filter((h) => h.lang === l)}
                          />
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        {!flow && (
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
        )}

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
        flow={prefs.flow}
        columns={prefs.columns}
        ttsOn={canTTS}
        onColumns={(c) => setPref({ columns: c })}
        onTheme={(t) => setPref({ theme: t })}
        onSize={(s) => setPref({ size: s })}
        onFurigana={(f) => setPref({ furigana: f })}
        onRate={(r) => setPref({ rate: r })}
        onVoice={(g) => setPref({ voice: g })}
        onSwipe={(v) => setPref({ swipe: v })}
        onFlow={(v) => setPref({ flow: v })}
        onExport={exportAnnotations}
        onImport={importAnnotations}
        onClose={() => setSettingsOpen(false)}
      />

      <Drawer
        open={drawerOpen}
        items={drawerItems}
        onJump={(ref) => {
          const { slug, ch, v } = parseRef(ref)
          go({ slug, chapter: ch, verse: v })
          setDrawerOpen(false)
        }}
        onDelete={(ref) => remove(ref)}
        onClose={() => setDrawerOpen(false)}
      />

      <Navigator
        open={navOpen}
        index={index}
        current={pos.slug}
        onNavigate={(slug, ch) => {
          go({ slug, chapter: ch })
          window.scrollTo({ top: 0 })
          setNavOpen(false)
        }}
        onClose={() => setNavOpen(false)}
      />

      <SearchSheet
        open={searchOpen}
        index={index}
        onNavigate={(slug, ch, v, lang) => {
          go({ slug, chapter: ch, verse: v, lang })
          setSearchOpen(false)
        }}
        onClose={() => setSearchOpen(false)}
      />

      <VerseSheet
        data={verseSheet}
        showFurigana={prefs.furigana}
        onCopyText={() =>
          verseSheet &&
          copyVerseText(verseSheet.lang, verseSheet.slug, verseSheet.ch, verseSheet.v, verseSheet[verseSheet.lang])
        }
        onCopyLink={() => verseSheet && copyVerseLink(verseSheet.lang, verseSheet.v)}
        onPlay={() => {
          if (verseSheet) playFrom(verseSheet.lang, verseSheet.ch, verseSheet.v)
          setVerseSheet(null)
        }}
        onNote={() => {
          if (verseSheet) setNoteRef(vref(verseSheet.slug, verseSheet.ch, verseSheet.v))
          setVerseSheet(null)
        }}
        onClose={() => setVerseSheet(null)}
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

      {flow && playingLang && (
        <button className="audiofab" onClick={stopAudio} title="Stop audio" aria-label="Stop audio">
          ⏹
        </button>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
