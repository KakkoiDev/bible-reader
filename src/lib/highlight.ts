// Partial-verse highlighting via the CSS Custom Highlight API.
// Offsets are measured over the verse's BASE text nodes only (furigana <rt> is
// skipped), so a highlight stays put whether or not furigana is displayed.
import type { Lang } from './types'
import type { HColor, HRange } from './annotations'
import { COLORS } from './annotations'

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

/** Character offsets of the current selection within `vt` (base text), or null. */
export function offsetsFromSelection(vt: Element): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!vt.contains(range.startContainer) || !vt.contains(range.endContainer)) return null
  const nodes = baseTextNodes(vt)
  let start = -1
  let end = -1
  let acc = 0
  for (const t of nodes) {
    if (t === range.startContainer) start = acc + range.startOffset
    if (t === range.endContainer) end = acc + range.endOffset
    acc += t.length
  }
  if (start < 0 || end < 0) return null
  if (start > end) [start, end] = [end, start]
  return start === end ? null : { start, end }
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

const NAME: Record<HColor, string> = {
  yellow: 'hl-yellow',
  green: 'hl-green',
  blue: 'hl-blue',
  pink: 'hl-pink',
  purple: 'hl-purple',
}

/** Rebuild every CSS highlight for the verses currently on screen. */
export function rebuildHighlights(items: { el: Element; h: HRange }[]) {
  const css = cssAny()
  if (!css || !supportsHighlight()) return
  for (const name of Object.values(NAME)) css.highlights.delete(name)
  const byColor: Partial<Record<HColor, Range[]>> = {}
  for (const { el, h } of items) {
    const rs = rangesFromOffsets(el, h.start, h.end)
    if (rs.length) (byColor[h.color] ||= []).push(...rs)
  }
  const Ctor = (globalThis as any).Highlight
  for (const color of COLORS) {
    const ranges = byColor[color]
    if (ranges && ranges.length) css.highlights.set(NAME[color], new Ctor(...ranges))
  }
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

/** Which verse/lang does the current selection belong to? Reads `.verse` id `v-<lang>-<n>`. */
export function selectionContext(reader: Element): {
  vt: Element
  lang: Lang
  v: number
  start: number
  end: number
  rect: DOMRect
} | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const anchor = sel.anchorNode
  const focus = sel.focusNode
  if (!anchor || !focus) return null
  const verseEl = (anchor.parentElement || (anchor as Element)).closest?.('.verse')
  const focusVerse = (focus.parentElement || (focus as Element)).closest?.('.verse')
  if (!verseEl || verseEl !== focusVerse) return null
  const m = /^v-(en|ja|fr)-(\d+)$/.exec(verseEl.id)
  if (!m) return null
  const vt = verseEl.querySelector('.vt')
  if (!vt || !reader.contains(vt)) return null
  const offs = offsetsFromSelection(vt)
  if (!offs) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  return { vt, lang: m[1] as Lang, v: Number(m[2]), start: offs.start, end: offs.end, rect }
}
