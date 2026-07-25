// Selection → base-text offsets (for persistent highlights, rendered as DOM
// spans in format.tsx) and the transient audio word-highlight (CSS Custom
// Highlight API — used only for EN/FR, which have no <ruby>).
import { isLang, type Lang } from './versions'

/* eslint-disable @typescript-eslint/no-explicit-any */
const cssAny = (): any => (typeof CSS !== 'undefined' ? (CSS as any) : undefined)
export const supportsHighlight = () =>
  typeof CSS !== 'undefined' && 'highlights' in (CSS as any) && typeof (globalThis as any).Highlight !== 'undefined'

function baseTextNodes(root: Element): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.parentElement && n.parentElement.closest('rt'))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  let n: Node | null
  while ((n = walker.nextNode())) out.push(n as Text)
  return out
}

// Base-text offset of an arbitrary boundary (container + offset). Works whether
// the boundary lands on a text node, an element, or inside a furigana <rt> —
// measured by a Range so first-character and edge selections count correctly.
function baseOffsetTo(vt: Element, container: Node, offset: number): number {
  const measure = document.createRange()
  measure.setStart(vt, 0)
  try {
    measure.setEnd(container, offset)
  } catch {
    return 0
  }
  const cmp = (t: Text, k: number) => {
    try {
      return measure.comparePoint(t, k)
    } catch {
      return 1
    }
  }
  let count = 0
  for (const t of baseTextNodes(vt)) {
    if (cmp(t, t.length) <= 0) {
      count += t.length // whole node is before the boundary
      continue
    }
    if (cmp(t, 0) <= 0) {
      let k = 0
      while (k < t.length && cmp(t, k + 1) <= 0) k++ // boundary falls inside this node
      count += k
    }
    break // node is at or after the boundary
  }
  return count
}

// One range PER base text node. A single range spanning a <ruby> boundary makes
// browsers mis-paint the highlight over the furigana; per-node ranges never
// cross ruby structure, so the paint stays on the base glyphs.
function rangesFromOffsets(vt: Element, start: number, end: number): Range[] {
  const nodes = baseTextNodes(vt)
  const ranges: Range[] = []
  let acc = 0
  for (const t of nodes) {
    const len = t.length
    const s = Math.max(start, acc)
    const e = Math.min(end, acc + len)
    if (s < e) {
      const r = document.createRange()
      r.setStart(t, s - acc)
      r.setEnd(t, e - acc)
      ranges.push(r)
    }
    acc += len
    if (acc >= end) break
  }
  return ranges
}

/** Highlight the word currently being spoken (ephemeral, its own layer). */
export function setWordHighlight(el: Element, start: number, end: number) {
  const css = cssAny()
  if (!css || !supportsHighlight()) return
  const rs = rangesFromOffsets(el, start, end)
  const Ctor = (globalThis as any).Highlight
  if (rs.length) css.highlights.set('hl-speaking', new Ctor(...rs))
  else css.highlights.delete('hl-speaking')
}
export function clearWordHighlight() {
  const css = cssAny()
  if (css && supportsHighlight()) css.highlights.delete('hl-speaking')
}

const verseOf = (n: Node | null): Element | null =>
  n ? (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest('.verse, .fverse') ?? null : null

/** Which verse the current selection belongs to. Handles both the parallel view
 *  (`.verse` li with `.vt`, id `v-<lang>-<n>`) and flow view (`.fverse`, `fv-<ch>-<n>`).
 *  lang/ch are null when the anchor doesn't encode them (caller fills from state). */
export function selectionContext(reader: Element): {
  el: Element
  lang: Lang | null
  ch: number | null
  v: number
  start: number
  end: number
  rect: DOMRect
} | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const verseEl = verseOf(range.commonAncestorContainer) || verseOf(range.startContainer)
  if (!verseEl || !reader.contains(verseEl)) return null
  const mf = /^fv-(\d+)-(\d+)$/.exec(verseEl.id)
  const mn = /^v-([a-z]+)-(\d+)$/.exec(verseEl.id)
  let el: Element | null
  let lang: Lang | null
  let ch: number | null
  let v: number
  if (mf) {
    el = verseEl // the .fverse span IS the text container
    lang = null
    ch = Number(mf[1])
    v = Number(mf[2])
  } else if (mn && isLang(mn[1])) {
    el = verseEl.querySelector('.vt')
    lang = mn[1] as Lang
    ch = null
    v = Number(mn[2])
  } else return null
  if (!el) return null
  const a = baseOffsetTo(el, range.startContainer, range.startOffset)
  const b = baseOffsetTo(el, range.endContainer, range.endOffset)
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  if (start === end) return null
  return { el, lang, ch, v, start, end, rect: range.getBoundingClientRect() }
}
