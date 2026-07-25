import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chapter, EditionBook, IndexItem } from './lib/types'
import { bookName } from './lib/types'
import { BY_ID, DEFAULT_COLUMNS, VERSION_IDS, coversBook, isLang, type Lang } from './lib/versions'
import { VerseText, type HL } from './lib/format'
import { useAnnotations, vref, parseRef, allTags, countTagged, type HColor } from './lib/annotations'
import { selectionContext, setWordHighlight, clearWordHighlight } from './lib/highlight'
import {
  ttsSupported,
  primeVoices,
  speakVerses,
  stopSpeaking,
  hasVoice,
  voicesLoaded,
  onVoicesChanged,
  type Gender,
} from './lib/tts'
import { translator, detectUiLang } from './lib/i18n'
import { decodeInvite, inviteUrl, type Invite } from './lib/invite'
import {
  Toolbar,
  Settings,
  Drawer,
  NoteEditor,
  ConfirmSheet,
  LicencesSheet,
  type Theme,
  type Size,
  type DrawerItem,
  type SortMode,
} from './components/Panels'
import { SearchSheet, Navigator, VerseSheet, InviteBuilder, type VerseSheetData } from './components/Sheets'

const BASE = import.meta.env.BASE_URL
const SWIPE_MIN = 45
const REPO_URL = 'https://github.com/KakkoiDev/bible-reader'

interface Pos {
  slug: string
  chapter: number
  lang: Lang
}
interface Prefs {
  ui: Lang
  theme: Theme
  size: Size
  furigana: boolean
  align: boolean
  rate: number
  voice: Gender
  swipe: boolean
  flow: boolean
  stopAtChapterEnd: boolean
  columns: Lang[]
}
type Paragraphs = Record<string, Record<string, number[]>>

// ---- URL hash: #/<slug>/<chapter>/<lang>[/<verse>]  or  #/i/<invite payload> ----
interface HashLoc {
  slug: string
  chapter: number
  lang?: Lang
  verse?: number
}
function parseHash(): { loc?: HashLoc; invite?: Invite } {
  const h = location.hash.replace(/^#\/?/, '')
  if (!h) return {}
  if (h.startsWith('i/')) {
    const invite = decodeInvite(h.slice(2))
    return invite ? { invite } : {}
  }
  const [slug, ch, lang, verse] = h.split('/')
  const chapter = parseInt(ch, 10)
  if (!slug || !Number.isFinite(chapter)) return {}
  const v = verse != null ? parseInt(verse, 10) : NaN
  return {
    loc: {
      slug,
      chapter,
      lang: isLang(lang) ? lang : undefined,
      verse: Number.isFinite(v) ? v : undefined,
    },
  }
}
const buildHash = (slug: string, chapter: number, lang: Lang, verse?: number) =>
  `#/${slug}/${chapter}/${lang}` + (verse ? `/${verse}` : '')

const loadPrefs = (): Prefs => {
  const d: Prefs = {
    ui: 'en',
    theme: 'system',
    size: 'md',
    furigana: true,
    align: true,
    rate: 1,
    voice: 'male',
    swipe: false,
    flow: false,
    stopAtChapterEnd: false,
    columns: DEFAULT_COLUMNS,
  }
  try {
    const stored = JSON.parse(localStorage.getItem('prefs') || '{}')
    const p = { ...d, ...stored }
    const valid = [...new Set((p.columns || []).filter(isLang))] as Lang[]
    p.columns = valid.length ? valid : DEFAULT_COLUMNS
    // First run has no stored UI language: follow the browser instead of forcing English.
    if (!isLang(stored.ui)) p.ui = detectUiLang()
    return p
  } catch {
    return { ...d, ui: detectUiLang() }
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
  const initLast = initHash.loc ? null : loadLastRead()

  const [index, setIndex] = useState<IndexItem[]>([])
  const [pos, setPos] = useState<Pos>(() =>
    initHash.loc
      ? { slug: initHash.loc.slug, chapter: initHash.loc.chapter, lang: initHash.loc.lang ?? 'en' }
      : initLast
        ? { slug: initLast.slug, chapter: initLast.chapter, lang: initLast.lang }
        : { slug: 'genesis', chapter: 1, lang: 'en' },
  )
  const [flashVerse, setFlashVerse] = useState<number | null>(initHash.loc?.verse ?? initLast?.verse ?? null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches)
  const [loading, setLoading] = useState(false)
  // An action turns the toast into an undo affordance — used by invite links, which
  // apply immediately rather than asking first.
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null)
  const say = useCallback(
    (text: string, action?: { label: string; run: () => void }) => setToast({ text, action }),
    [],
  )
  const [speaking, setSpeaking] = useState<{ ch: number; v: number; lang: Lang } | null>(null)
  const [playingLang, setPlayingLang] = useState<Lang | null>(null)
  const [autoNext, setAutoNext] = useState<Lang | null>(null)
  const [pending, setPending] = useState<{ slug: string; chapter: number; lang: Lang } | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [licencesOpen, setLicencesOpen] = useState(false)
  const [verseSheet, setVerseSheet] = useState<VerseSheetData | null>(null)
  const [paras, setParas] = useState<Paragraphs>({})
  const [invite, setInvite] = useState<Invite | null>(initHash.invite ?? null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // Set to the verse to share (or 0 for the chapter) while the builder is open.
  const [inviteFor, setInviteFor] = useState<number | null>(null)
  // Tag pending global deletion, awaiting confirmation.
  const [confirmTag, setConfirmTag] = useState<string | null>(null)
  const canTTS = ttsSupported()

  const { store, addHighlight, clearHighlightsIn, setNote, setTags, removeTag, setOrder, remove, importStore } =
    useAnnotations()
  const [sel, setSel] = useState<{ lang: Lang; ch: number; v: number; start: number; end: number; rect: DOMRect } | null>(null)
  const [noteRef, setNoteRef] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const readerRef = useRef<HTMLElement>(null)

  // saved-notes drawer controls
  const [sort, setSort] = useState<SortMode>('book')
  const [asc, setAsc] = useState(true)
  const [thisBook, setThisBook] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])

  const t = useMemo(() => translator(prefs.ui), [prefs.ui])
  const setPref = useCallback((p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p })), [])

  // navigation via URL hash (shareable, back-button friendly)
  const navigate = useCallback((next: { slug?: string; chapter?: number; lang?: Lang; verse?: number }) => {
    setPos((prev) => {
      location.hash = buildHash(next.slug ?? prev.slug, next.chapter ?? prev.chapter, next.lang ?? prev.lang, next.verse)
      return prev
    })
  }, [])

  // apply prefs to <html> for CSS, including writing direction for the UI language
  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme === 'system' ? '' : prefs.theme
    el.dataset.size = prefs.size
    el.lang = BY_ID[prefs.ui].htmlLang
    el.dir = BY_ID[prefs.ui].dir
    localStorage.setItem('prefs', JSON.stringify(prefs))
  }, [prefs])

  // responsive
  useEffect(() => {
    const mq = matchMedia('(min-width: 900px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const flow = prefs.flow
  const verseElId = useCallback(
    (ch: number, v: number, lang: Lang) => (flow ? `fv-${ch}-${v}` : `v-${lang}-${v}`),
    [flow],
  )
  // In flow mode the whole book is on one page, so navigating a chapter means
  // scrolling to it. Non-null while that scroll is pending — the observer below
  // must not fight it by deriving the chapter back from scroll position.
  const [flowTarget, setFlowTarget] = useState<{ ch: number; v: number } | null>(null)
  const flowTargetRef = useRef(flowTarget)
  flowTargetRef.current = flowTarget

  // load index + paragraph boundaries (for flow mode)
  useEffect(() => {
    fetch(`${BASE}data/index.json`).then((r) => r.json()).then(setIndex).catch(() => setIndex([]))
    fetch(`${BASE}data/paragraphs.json`).then((r) => r.json()).then(setParas).catch(() => setParas({}))
  }, [])

  const book = useMemo(() => index.find((b) => b.slug === pos.slug), [index, pos.slug])
  const bookIdx = useMemo(() => index.findIndex((b) => b.slug === pos.slug), [index, pos.slug])
  const chapterCount = book?.chapters.length ?? 0

  // Editions to download: the visible columns plus whatever is being read. On a
  // phone only one column shows at a time, but the ring can reach any of them.
  // Editions that don't cover this half of the canon are skipped — asking for
  // data/el/genesis.json would only ever be a wasted round trip.
  const needed = useMemo(() => {
    const all = [...new Set([...prefs.columns, pos.lang])]
    return bookIdx < 0 ? all : all.filter((l) => coversBook(l, bookIdx))
  }, [prefs.columns, pos.lang, bookIdx])
  const neededKey = needed.join(',')

  // ---- per-edition book loading ----
  const cache = useRef(new Map<string, EditionBook>())
  const [loaded, setLoaded] = useState<{ slug: string; texts: Partial<Record<Lang, EditionBook>> }>({ slug: '', texts: {} })
  useEffect(() => {
    let alive = true
    const slug = pos.slug
    setLoading(true)
    Promise.all(
      needed.map(async (l) => {
        const key = `${l}/${slug}`
        let b = cache.current.get(key)
        if (!b) {
          b = await fetch(`${BASE}data/${l}/${slug}.json`)
            .then((r) => (r.ok ? (r.json() as Promise<EditionBook>) : { chapters: [] }))
            .catch(() => ({ chapters: [] }) as EditionBook)
          cache.current.set(key, b)
        }
        return [l, b] as const
      }),
    )
      .then((pairs) => {
        if (!alive) return
        setLoaded({ slug, texts: Object.fromEntries(pairs) })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [pos.slug, neededKey, needed])

  /** `<ch>.<v>` → text, per edition, for the book currently open. */
  const verseText = useMemo(() => {
    const out: Partial<Record<Lang, Map<string, string>>> = {}
    if (loaded.slug !== pos.slug) return out
    for (const [l, b] of Object.entries(loaded.texts) as [Lang, EditionBook][]) {
      const m = new Map<string, string>()
      for (const c of b.chapters) for (const vv of c.verses) m.set(`${c.n}.${vv.v}`, vv.t)
      out[l] = m
    }
    return out
  }, [loaded, pos.slug])
  const ready = loaded.slug === pos.slug && !!book

  // keep the chapter within the book
  useEffect(() => {
    if (chapterCount && pos.chapter > chapterCount) navigate({ chapter: chapterCount })
    else if (pos.chapter < 1) navigate({ chapter: 1 })
  }, [chapterCount, pos.chapter, navigate])

  const langsToShow: Lang[] = flow || !wide ? [pos.lang] : prefs.columns

  /** Rows of the open chapter — one per verse number in the canonical union. */
  const chapter: Chapter | null = useMemo(() => {
    if (!book) return null
    const count = book.chapters[pos.chapter - 1] ?? 0
    if (!count) return null
    const verses = Array.from({ length: count }, (_, i) => {
      const v = i + 1
      const text: Partial<Record<Lang, string>> = {}
      for (const l of needed) {
        const s = verseText[l]?.get(`${pos.chapter}.${v}`)
        if (s) text[l] = s
      }
      return { v, text }
    })
    return { n: pos.chapter, verses }
  }, [book, pos.chapter, needed, verseText])

  // keep the current language among the enabled columns; a shared link pointing at a
  // hidden edition opens in the first visible one instead, and says so.
  useEffect(() => {
    // An invite sets the editions and the reading edition together; without this
    // guard the fallback can observe the intermediate state and redirect away from
    // the edition the invite was meant to open.
    if (invite) return
    if (!prefs.columns.length || prefs.columns.includes(pos.lang)) return
    const fallback = prefs.columns[0]
    say(t('hidden_version', { shown: BY_ID[fallback].label, hidden: BY_ID[pos.lang].label }))
    navigate({ lang: fallback, verse: flashVerse ?? undefined })
  }, [prefs.columns, pos.lang, navigate, flashVerse, t, say, invite])

  // ---- audio (Web Speech) ----
  // Chrome populates getVoices() asynchronously, so voice availability has to be
  // reactive — memoising it at mount labelled every edition "no voice installed"
  // and hid every play button, because the list was still empty.
  const [voicesTick, setVoicesTick] = useState(0)
  useEffect(() => {
    primeVoices()
    return onVoicesChanged(() => setVoicesTick((n) => n + 1))
  }, [])
  const noVoice = useMemo(() => {
    // Until the list arrives, "unknown" — don't claim anything is unspeakable.
    if (!canTTS || !voicesLoaded()) return new Set<Lang>()
    return new Set(VERSION_IDS.filter((id) => !hasVoice(id)))
  }, [canTTS, voicesTick])
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
  // "Stop at chapter end" turns off the roll-on into the next chapter/book.
  const keepGoing = !prefs.stopAtChapterEnd
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
      speakList(
        lang,
        chapter.verses
          .filter((v) => v.v >= start && v.text[lang])
          .map((v) => ({ ch: chapter.n, v: v.v, text: v.text[lang]! })),
        keepGoing,
      )
    },
    [chapter, speakList, flow, keepGoing],
  )
  const playVerse = useCallback(
    (lang: Lang, ch: number, v: number, text: string) => speakList(lang, [{ ch, v, text }], false),
    [speakList],
  )
  // Play continuously from a given verse onward (through the chapter, then the book).
  const playFrom = useCallback(
    (lang: Lang, ch: number, v: number) => {
      const count = book?.chapters[ch - 1] ?? 0
      const items: { ch: number; v: number; text: string }[] = []
      for (let n = v; n <= count; n++) {
        const text = verseText[lang]?.get(`${ch}.${n}`)
        if (text) items.push({ ch, v: n, text })
      }
      speakList(lang, items, keepGoing)
    },
    [book, verseText, speakList, keepGoing],
  )
  useEffect(() => () => stopSpeaking(), []) // stop on unmount

  // user navigation stops audio; auto-advance (below) uses navigate() directly so it doesn't
  const go = useCallback(
    (next: { slug?: string; chapter?: number; lang?: Lang; verse?: number }) => {
      stopAudio()
      if (flow && (next.chapter != null || next.slug != null)) {
        setFlowTarget({ ch: next.chapter ?? pos.chapter, v: next.verse ?? 1 })
      }
      navigate(next)
    },
    [stopAudio, navigate, flow, pos.chapter],
  )
  // continuous playback: when a chapter ends, move to the next chapter/book and keep playing
  useEffect(() => {
    if (autoNext == null || !book) return
    const lang = autoNext
    setAutoNext(null)
    let target: { slug: string; chapter: number; lang: Lang } | null = null
    if (pos.chapter < chapterCount) target = { slug: pos.slug, chapter: pos.chapter + 1, lang }
    else if (bookIdx < index.length - 1) target = { slug: index[bookIdx + 1].slug, chapter: 1, lang }
    if (target) {
      setPending(target)
      navigate({ slug: target.slug, chapter: target.chapter })
      window.scrollTo({ top: 0 })
    }
  }, [autoNext, book, pos.slug, pos.chapter, chapterCount, bookIdx, index, navigate])
  useEffect(() => {
    if (!pending || !chapter || !ready) return
    if (pos.slug === pending.slug && pos.chapter === pending.chapter) {
      const lang = pending.lang
      setPending(null)
      speakList(
        lang,
        chapter.verses.filter((v) => v.text[lang]).map((v) => ({ ch: chapter.n, v: v.v, text: v.text[lang]! })),
        keepGoing,
      )
    }
  }, [pending, chapter, ready, pos.slug, pos.chapter, speakList, keepGoing])

  // apply hash on change (pasted link, back/forward)
  useEffect(() => {
    const apply = () => {
      const h = parseHash()
      if (h.invite) {
        setInvite(h.invite)
        return
      }
      if (!h.loc) return
      const loc = h.loc
      setPos((prev) => {
        if (flow && (loc.slug !== prev.slug || loc.chapter !== prev.chapter))
          setFlowTarget({ ch: loc.chapter, v: loc.verse ?? 1 })
        return { ...prev, slug: loc.slug, chapter: loc.chapter, lang: loc.lang ?? prev.lang }
      })
      setFlashVerse(loc.verse ?? null)
    }
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [flow])

  // scroll to flashed verse once rendered; auto-clear the flash
  useEffect(() => {
    if (flashVerse == null || !ready) return
    const raf = requestAnimationFrame(() =>
      document.getElementById(verseElId(pos.chapter, flashVerse, pos.lang))?.scrollIntoView({ block: 'center' }),
    )
    const timer = setTimeout(() => setFlashVerse(null), 4000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [flashVerse, ready, pos.chapter, pos.lang, wide, verseElId])

  // flow mode: scroll to the chapter the reader navigated to, then release the observer
  useEffect(() => {
    if (!flowTarget || !flow || !ready) return
    const el =
      document.getElementById(`fv-${flowTarget.ch}-${flowTarget.v}`) ||
      document.getElementById(`fv-${flowTarget.ch}-1`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    // Release on the next frame *after* the scroll has settled, so the observer's
    // catch-up callbacks don't immediately rewrite pos.chapter.
    const timer = setTimeout(() => setFlowTarget(null), 250)
    return () => clearTimeout(timer)
  }, [flowTarget, flow, ready])

  // remember the top-visible verse for resume-on-reopen (and, in flow, the current chapter)
  const posRef = useRef(pos)
  posRef.current = pos
  useEffect(() => {
    const el = readerRef.current
    if (!el || !ready) return
    const visible = new Map<string, { ch: number; v: number }>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const mf = /^fv-(\d+)-(\d+)$/.exec(e.target.id)
          const mn = /^v-([a-z]+)-(\d+)$/.exec(e.target.id)
          let cur: { ch: number; v: number } | null = null
          if (mf) cur = { ch: Number(mf[1]), v: Number(mf[2]) }
          else if (mn && isLang(mn[1]) && (wide || mn[1] === posRef.current.lang))
            cur = { ch: posRef.current.chapter, v: Number(mn[2]) }
          if (!cur) continue
          if (e.isIntersecting) visible.set(e.target.id, cur)
          else visible.delete(e.target.id)
        }
        let best: { ch: number; v: number } | null = null
        for (const c of visible.values()) if (!best || c.ch < best.ch || (c.ch === best.ch && c.v < best.v)) best = c
        if (!best) return
        localStorage.setItem(
          'lastRead',
          JSON.stringify({ slug: posRef.current.slug, chapter: best.ch, lang: posRef.current.lang, verse: best.v }),
        )
        // Don't derive the chapter from scrolling while a chapter jump is in flight.
        if (flow && !flowTargetRef.current)
          setPos((prev) => (prev.chapter === best!.ch ? prev : { ...prev, chapter: best!.ch }))
      },
      { rootMargin: '-84px 0px -55% 0px', threshold: 0 },
    )
    el.querySelectorAll(flow ? '.fverse' : '.verse').forEach((x) => io.observe(x))
    return () => io.disconnect()
  }, [ready, pos.slug, pos.lang, wide, prefs.furigana, flow, prefs.columns, prefs.align])

  // text-selection → annotation toolbar
  useEffect(() => {
    let timer = 0
    const handler = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        // No root: selections are matched by the verse-id patterns themselves, so
        // this also picks up text selected inside the verse sheet.
        const ctx = selectionContext()
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
      window.clearTimeout(timer)
    }
  }, [])

  const goChapter = useCallback(
    (delta: number) => {
      if (!book) return
      const next = pos.chapter + delta
      if (next >= 1 && next <= chapterCount) go({ chapter: next })
      else if (next < 1 && bookIdx > 0) {
        const prevBook = index[bookIdx - 1]
        go({ slug: prevBook.slug, chapter: prevBook.chapters.length })
      } else if (next > chapterCount && bookIdx < index.length - 1) go({ slug: index[bookIdx + 1].slug, chapter: 1 })
      else return
      if (!flow) window.scrollTo({ top: 0 })
    },
    [book, pos.chapter, chapterCount, bookIdx, index, go, flow],
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
        say(t('link_copied'))
      } catch {
        say(t('copy_failed'))
      }
    },
    [pos.slug, pos.chapter, t],
  )
  /** An invite carries a chosen set of editions, not just the passage. The first
   *  column is the one it opens in. */
  const copyInvite = useCallback(
    async (columns: Lang[], verse?: number) => {
      try {
        await navigator.clipboard.writeText(
          inviteUrl({ columns, lang: columns[0], slug: pos.slug, chapter: pos.chapter, verse }),
        )
        say(t('invite_copied'))
      } catch {
        say(t('copy_failed'))
      }
      setInviteFor(null)
    },
    [pos.slug, pos.chapter, t, say],
  )
  const copyVerseText = useCallback(
    async (lang: Lang, ch: number, v: number, text: string) => {
      const markup = BY_ID[lang].markup
      const plain =
        markup === 'kjv'
          ? text.replace(/[{}]/g, '')
          : markup === 'ruby'
            ? text.replace(/\{\{([^|}]*)\|[^}]+\}\}/g, '$1')
            : text
      // Cite in the verse's own language, not the UI's.
      const name = bookName(book, lang)
      try {
        await navigator.clipboard.writeText(`"${plain}" [${name} ${ch}:${v}] ${BY_ID[lang].fullName}`)
        say(t('verse_copied'))
      } catch {
        say(t('copy_failed'))
      }
    },
    [book, t],
  )

  /** Saved highlights for one verse, grouped by edition — for the verse sheet. */
  const highlightsFor = useCallback(
    (ch: number, v: number): Partial<Record<Lang, HL[]>> => {
      const ann = store[vref(pos.slug, ch, v)]
      if (!ann?.highlights?.length) return {}
      const out: Partial<Record<Lang, HL[]>> = {}
      for (const h of ann.highlights) (out[h.lang] ||= []).push(h)
      return out
    },
    [store, pos.slug],
  )

  const openVerseAt = useCallback(
    (lang: Lang, ch: number, v: number) => {
      const text: Partial<Record<Lang, string>> = {}
      // Only the editions the reader has visible — a hidden edition stays hidden here too.
      for (const l of prefs.columns) {
        const s = verseText[l]?.get(`${ch}.${v}`)
        if (s) text[l] = s
      }
      setVerseSheet({ label: `${bookName(book, prefs.ui)} ${ch}:${v}`, lang, slug: pos.slug, ch, v, text })
    },
    [verseText, prefs.columns, prefs.ui, book, pos.slug],
  )

  // paragraphs for flow/reading mode (whole book, single language, logical breaks)
  const flowParas = useMemo(() => {
    if (!flow || !book) return []
    const breaks = paras[pos.slug] || {}
    const m = verseText[pos.lang]
    type Item = { ch: number; v: number; text: string; first: boolean; hl?: HL[] }
    const out: Item[][] = []
    let cur: Item[] = []
    for (let c = 1; c <= book.chapters.length; c++) {
      const chBreaks = breaks[String(c)] || []
      const count = book.chapters[c - 1] ?? 0
      for (let v = 1; v <= count; v++) {
        const text = m?.get(`${c}.${v}`)
        if (!text) continue
        if ((v === 1 || chBreaks.includes(v)) && cur.length) {
          out.push(cur)
          cur = []
        }
        cur.push({
          ch: c,
          v,
          text,
          first: v === 1,
          hl: store[vref(pos.slug, c, v)]?.highlights?.filter((h) => h.lang === pos.lang),
        })
      }
    }
    if (cur.length) out.push(cur)
    return out
  }, [flow, book, paras, pos.slug, pos.lang, verseText, store])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.action ? 7000 : 2400)
    return () => clearTimeout(timer)
  }, [toast])

  // Escape closes the topmost overlay, innermost first, so a stack of sheets unwinds
  // one layer at a time instead of everything vanishing at once.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const layers: [boolean, () => void][] = [
        [confirmDelete !== null, () => setConfirmDelete(null)],
        [confirmTag !== null, () => setConfirmTag(null)],
        [noteRef !== null, () => setNoteRef(null)],
        [verseSheet !== null, () => setVerseSheet(null)],
        [inviteFor !== null, () => setInviteFor(null)],
        [licencesOpen, () => setLicencesOpen(false)],
        [searchOpen, () => setSearchOpen(false)],
        [navOpen, () => setNavOpen(false)],
        [drawerOpen, () => setDrawerOpen(false)],
        [settingsOpen, () => setSettingsOpen(false)],
        [sel !== null, () => clearSelection()],
      ]
      const top = layers.find(([open]) => open)
      if (top) {
        e.preventDefault()
        top[1]()
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  })

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
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
    say(n ? t('exported_n', { n }) : t('nothing_to_export'))
  }, [store, t, say])

  const importAnnotations = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result))
          const data = parsed && parsed.type === 'annotations' && parsed.data ? parsed.data : parsed
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad')
          importStore(data)
          say(t('imported_n', { n: Object.keys(data).length }))
        } catch {
          say(t('import_failed'))
        }
      }
      reader.onerror = () => say(t('import_failed'))
      reader.readAsText(file)
    },
    [importStore, t],
  )

  const labelFor = useCallback(
    (ref: string) => {
      const p = parseRef(ref)
      return `${bookName(index.find((b) => b.slug === p.slug), prefs.ui)} ${p.ch}:${p.v}`
    },
    [index, prefs.ui],
  )

  const tags = useMemo(() => allTags(store), [store])
  const savedCount = useMemo(
    () => Object.values(store).filter((a) => a.note || a.highlights?.length || a.tags?.length).length,
    [store],
  )
  const drawerItems: DrawerItem[] = useMemo(() => {
    const rank = new Map(index.map((b, i) => [b.slug, i]))
    let items = Object.entries(store)
      .filter(([, a]) => a.note || a.highlights?.length || a.tags?.length)
      .map(([ref, a]) => {
        const p = parseRef(ref)
        return {
          ref,
          slug: p.slug,
          label: labelFor(ref),
          note: a.note,
          tags: a.tags ?? [],
          colors: [...new Set((a.highlights || []).map((h) => h.color))],
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          order: a.order ?? Number.MAX_SAFE_INTEGER,
        }
      })
    if (thisBook) items = items.filter((it) => it.slug === pos.slug)
    if (tagFilter.length) items = items.filter((it) => tagFilter.every((tag) => it.tags.includes(tag)))

    const byBook = (x: typeof items[number], y: typeof items[number]) => {
      const px = parseRef(x.ref)
      const py = parseRef(y.ref)
      return (rank.get(px.slug) ?? 0) - (rank.get(py.slug) ?? 0) || px.ch - py.ch || px.v - py.v
    }
    items.sort((x, y) => {
      if (sort === 'custom') return x.order - y.order || byBook(x, y)
      const dir = asc ? 1 : -1
      if (sort === 'created') return dir * ((x.createdAt ?? 0) - (y.createdAt ?? 0)) || byBook(x, y)
      if (sort === 'updated') return dir * ((x.updatedAt ?? 0) - (y.updatedAt ?? 0)) || byBook(x, y)
      return dir * byBook(x, y)
    })
    return items
  }, [store, index, labelFor, sort, asc, thisBook, tagFilter, pos.slug])

  /** Move one note within the hand-arranged order, persisting the whole list. */
  const moveNote = useCallback(
    (ref: string, delta: 1 | -1) => {
      const refs = drawerItems.map((it) => it.ref)
      const i = refs.indexOf(ref)
      const j = i + delta
      if (i < 0 || j < 0 || j >= refs.length) return
      ;[refs[i], refs[j]] = [refs[j], refs[i]]
      setOrder(refs)
    },
    [drawerItems, setOrder],
  )

  // An invite comes from someone who already knows the recipient, so it applies
  // with no approval step: adopt the sender's editions and open the passage. The
  // toast carries an Undo so a link can't silently cost someone a arrangement they
  // liked, without putting a dialog in the way of reading.
  const columnsRef = useRef(prefs.columns)
  columnsRef.current = prefs.columns
  useEffect(() => {
    if (!invite) return
    const previous = columnsRef.current
    setInvite(null)
    setPref({ columns: invite.columns })
    setFlashVerse(invite.verse ?? null)
    setPos({ slug: invite.slug, chapter: invite.chapter, lang: invite.lang })
    location.hash = buildHash(invite.slug, invite.chapter, invite.lang, invite.verse)
    window.scrollTo({ top: 0 })
    say(t('invite_applied', { versions: invite.columns.map((l) => BY_ID[l].label).join(' · ') }), {
      label: t('undo'),
      run: () => setPref({ columns: previous }),
    })
  }, [invite, setPref, say, t])

  const title = bookName(book, prefs.ui)
  const readingTitle = bookName(book, pos.lang)
  const verseCount = chapter?.verses.length ?? 0
  // Subgrid needs a literal row count, so it's computed here rather than in CSS.
  const aligned = prefs.align && !flow && wide && langsToShow.length > 1
  const colsStyle = aligned ? { gridTemplateRows: `auto repeat(${verseCount}, auto)` } : undefined

  return (
    <div className="app">
      <header className="bar">
        <button className="navbtn" onClick={() => setNavOpen(true)}>
          {title} {pos.chapter} <span className="caret">▾</span>
        </button>
        <div className="tools">
          {/* Composing an invite lives in the verse sheet, not here: you share a
              passage rather than a bare chapter, and the header is reserved for the
              actions a reader uses routinely. */}
          <button className="icon" title={t('search')} onClick={() => setSearchOpen(true)}>🔍</button>
          <button className="icon" title={t('saved_aria')} onClick={() => setDrawerOpen(true)}>🔖</button>
          <button className="icon" title={t('settings')} onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      {(!wide || flow) && prefs.columns.length > 1 && (
        <div className="langring" role="tablist" aria-label={t('language')}>
          {prefs.columns.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === pos.lang}
              className={`ringtab ${l === pos.lang ? 'active' : ''}`}
              onClick={() => go({ lang: l, verse: flashVerse ?? undefined })}
            >
              <span lang={BY_ID[l].htmlLang} dir={BY_ID[l].dir}>{BY_ID[l].label}</span>
              <small>{BY_ID[l].edition}</small>
            </button>
          ))}
        </div>
      )}

      <main className="reader" ref={readerRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <h1 className="ref">
          {wide && !flow ? (
            <>{title} {pos.chapter}</>
          ) : (
            <span lang={BY_ID[pos.lang].htmlLang} dir={BY_ID[pos.lang].dir}>
              {readingTitle} {pos.chapter}
            </span>
          )}
        </h1>

        {loading && !ready ? (
          <p className="status">…</p>
        ) : flow ? (
          <div className="flow" lang={BY_ID[pos.lang].htmlLang} dir={BY_ID[pos.lang].dir}>
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
                    {/* Flow mode has no verse numbers, so without this the chapter nav
                        would scroll to a place with nothing to see. */}
                    {it.first && <span className="fchap" dir="ltr">{it.ch}</span>}
                    <VerseText text={it.text} lang={pos.lang} showFurigana={prefs.furigana} highlights={it.hl} />{' '}
                  </span>
                ))}
              </p>
            ))}
          </div>
        ) : (
          <div className={`cols cols-${langsToShow.length} ${aligned ? 'aligned' : ''}`} style={colsStyle}>
            {langsToShow.map((l) => {
              const m = BY_ID[l]
              const covers = bookIdx < 0 || coversBook(l, bookIdx)
              // Nothing to speak in a column with no text for this book.
              const playable = canTTS && !noVoice.has(l) && covers
              // Greek carries no Old Testament and Hebrew no New Testament. Rendering
              // a verse row per number would give a column of bare placeholders that
              // reads as a loading failure — and, with alignment on, would stretch
              // every row. One statement of what the edition contains is both honest
              // and quieter.
              const uncovered = !covers
              return (
                <section key={l} className={`col ${uncovered ? 'uncovered' : ''}`} lang={m.htmlLang} dir={m.dir}>
                  {(wide || playable) && (
                    <div className="colhead">
                      {wide && <span>{m.label} · {m.edition}</span>}
                      {playable && (
                        <button
                          className={`colplay ${playingLang === l ? 'on' : ''}`}
                          title={playingLang === l ? t('stop') : `${t('play_chapter')}: ${m.label}`}
                          onClick={() => (playingLang === l ? stopAudio() : playChapter(l))}
                        >
                          {playingLang === l ? '⏹' : '▶'} {m.edition}
                        </button>
                      )}
                    </div>
                  )}
                  {uncovered ? (
                    <p className="coverage" dir={BY_ID[prefs.ui].dir} lang={BY_ID[prefs.ui].htmlLang}>
                      {t(m.coverage === 'nt' ? 'coverage_nt_only' : 'coverage_ot_only')}
                    </p>
                  ) : (
                  <ol className="verses">
                    {chapter?.verses.map((v) => {
                      const ref = vref(pos.slug, pos.chapter, v.v)
                      const ann = store[ref]
                      const spk = speaking?.ch === pos.chapter && speaking?.v === v.v && speaking?.lang === l
                      const text = v.text[l]
                      return (
                        <li
                          key={v.v}
                          id={`v-${l}-${v.v}`}
                          className={`verse ${flashVerse === v.v && pos.lang === l ? 'flash' : ''} ${spk ? 'speaking' : ''}`}
                        >
                          <button className="vn" title={t('verse_actions')} onClick={() => openVerseAt(l, pos.chapter, v.v)}>
                            {v.v}
                          </button>
                          {playable && text && (
                            <button
                              className={`vplay ${spk ? 'on' : ''}`}
                              title={spk ? t('stop') : t('play_verse')}
                              onClick={() => (spk ? stopAudio() : playVerse(l, pos.chapter, v.v, text))}
                            >
                              {spk ? '⏹' : '▶'}
                            </button>
                          )}
                          {ann?.note && (
                            <button className="mk note" title={t('note')} onClick={() => setNoteRef(ref)}>
                              ✎
                            </button>
                          )}
                          <span
                            className="vt"
                            onClick={() => window.getSelection()?.isCollapsed && openVerseAt(l, pos.chapter, v.v)}
                          >
                            <VerseText
                              text={text ?? ''}
                              lang={l}
                              showFurigana={prefs.furigana}
                              highlights={ann?.highlights?.filter((h) => h.lang === l)}
                            />
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <nav className="chapnav">
          <button onClick={() => goChapter(-1)} disabled={bookIdx <= 0 && pos.chapter <= 1}>
            {t('prev')}
          </button>
          <span className="chaplabel">{title} {pos.chapter}</span>
          <button onClick={() => goChapter(1)} disabled={bookIdx === index.length - 1 && pos.chapter >= chapterCount}>
            {t('next')}
          </button>
        </nav>

        <footer className="attrib">
          <button className="liclink" onClick={() => setLicencesOpen(true)}>{t('licences')}</button>
          {' · '}
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">{t('source_code')}</a>
        </footer>
      </main>

      {sel && (
        <Toolbar
          rect={sel.rect}
          dock={wide ? 'float' : 'bottom'}
          hasHL={selHasHL}
          t={t}
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
        t={t}
        ui={prefs.ui}
        theme={prefs.theme}
        size={prefs.size}
        furigana={prefs.furigana}
        align={prefs.align}
        rate={prefs.rate}
        voice={prefs.voice}
        swipe={prefs.swipe}
        flow={prefs.flow}
        stopAtChapterEnd={prefs.stopAtChapterEnd}
        columns={prefs.columns}
        ttsOn={canTTS}
        noVoice={noVoice}
        onUi={(l) => setPref({ ui: l })}
        onColumns={(c) => setPref({ columns: c })}
        onTheme={(x) => setPref({ theme: x })}
        onSize={(s) => setPref({ size: s })}
        onFurigana={(f) => setPref({ furigana: f })}
        onAlign={(v) => setPref({ align: v })}
        onRate={(r) => setPref({ rate: r })}
        onVoice={(g) => setPref({ voice: g })}
        onSwipe={(v) => setPref({ swipe: v })}
        onFlow={(v) => setPref({ flow: v })}
        onStopAtChapterEnd={(v) => setPref({ stopAtChapterEnd: v })}
        onExport={exportAnnotations}
        onImport={importAnnotations}
        onClose={() => setSettingsOpen(false)}
      />

      <LicencesSheet open={licencesOpen} t={t} repoUrl={REPO_URL} onClose={() => setLicencesOpen(false)} />

      <Drawer
        open={drawerOpen}
        t={t}
        ui={prefs.ui}
        items={drawerItems}
        hasAny={savedCount > 0}
        sort={sort}
        asc={asc}
        thisBook={thisBook}
        tagFilter={tagFilter}
        tags={tags}
        onSort={setSort}
        onAsc={setAsc}
        onThisBook={setThisBook}
        onToggleTag={(tag) =>
          setTagFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
        }
        onDeleteTag={(tag) => setConfirmTag(tag)}
        onMove={moveNote}
        onJump={(ref) => {
          const p = parseRef(ref)
          go({ slug: p.slug, chapter: p.ch, verse: p.v })
          setDrawerOpen(false)
        }}
        onDelete={(ref) => setConfirmDelete(ref)}
        onClose={() => setDrawerOpen(false)}
      />

      <Navigator
        open={navOpen}
        index={index}
        current={pos.slug}
        ui={prefs.ui}
        t={t}
        onNavigate={(slug, ch) => {
          go({ slug, chapter: ch })
          if (!flow) window.scrollTo({ top: 0 })
          setNavOpen(false)
        }}
        onClose={() => setNavOpen(false)}
      />

      <SearchSheet
        open={searchOpen}
        index={index}
        columns={prefs.columns}
        ui={prefs.ui}
        t={t}
        onNavigate={(slug, ch, v, lang) => {
          go({ slug, chapter: ch, verse: v, lang })
          setSearchOpen(false)
        }}
        onClose={() => setSearchOpen(false)}
      />

      <VerseSheet
        data={verseSheet}
        columns={prefs.columns}
        showFurigana={prefs.furigana}
        highlights={verseSheet ? highlightsFor(verseSheet.ch, verseSheet.v) : {}}
        t={t}
        onCopyText={() =>
          verseSheet &&
          verseSheet.text[verseSheet.lang] &&
          copyVerseText(verseSheet.lang, verseSheet.ch, verseSheet.v, verseSheet.text[verseSheet.lang]!)
        }
        onCopyLink={() => verseSheet && copyVerseLink(verseSheet.lang, verseSheet.v)}
        onCopyInvite={() => verseSheet && setInviteFor(verseSheet.v)}
        onClearHighlight={(lang) =>
          verseSheet &&
          clearHighlightsIn(vref(verseSheet.slug, verseSheet.ch, verseSheet.v), lang, 0, Number.MAX_SAFE_INTEGER)
        }
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

      <InviteBuilder
        open={inviteFor !== null}
        t={t}
        initial={prefs.columns}
        refLabel={`${title} ${pos.chapter}${inviteFor ? `:${inviteFor}` : ''}`}
        onCopy={(cols) => copyInvite(cols, inviteFor || undefined)}
        onClose={() => setInviteFor(null)}
      />

      {noteRef && (
        <NoteEditor
          label={labelFor(noteRef)}
          value={store[noteRef]?.note ?? ''}
          tags={store[noteRef]?.tags ?? []}
          knownTags={tags}
          createdAt={store[noteRef]?.createdAt}
          updatedAt={store[noteRef]?.updatedAt}
          t={t}
          ui={prefs.ui}
          onSave={(text, newTags) => {
            setNote(noteRef, text)
            setTags(noteRef, newTags)
            setNoteRef(null)
          }}
          onDelete={() => setConfirmDelete(noteRef)}
          onClose={() => setNoteRef(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmSheet
          title={t('confirm_delete_title')}
          body={t('confirm_delete_body', { ref: labelFor(confirmDelete) })}
          confirmLabel={t('delete')}
          t={t}
          onConfirm={() => {
            remove(confirmDelete)
            if (noteRef === confirmDelete) setNoteRef(null)
            setConfirmDelete(null)
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmTag && (
        <ConfirmSheet
          title={t('delete_tag_title')}
          body={t('delete_tag_body', { tag: confirmTag, n: countTagged(store, confirmTag) })}
          confirmLabel={t('delete')}
          t={t}
          onConfirm={() => {
            removeTag(confirmTag)
            setTagFilter((prev) => prev.filter((x) => x !== confirmTag))
            setConfirmTag(null)
          }}
          onClose={() => setConfirmTag(null)}
        />
      )}

      {flow && playingLang && (
        <button className="audiofab" onClick={stopAudio} title={t('stop_audio')} aria-label={t('stop_audio')}>
          ⏹
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toastact"
              onClick={() => {
                toast.action!.run()
                setToast(null)
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

