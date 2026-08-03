import { useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * The shell every sheet in the app is built from.
 *
 * Nine sheets used to hand-roll the same three divs, which is why the design
 * system's sheet anatomy (handle, title and footer pinned, only the middle
 * scrolls) was implemented in none of them. Here the sheet is a flex column and
 * `.sheet-body` is the only scroller, so a pinned footer is structural rather
 * than a sticky trick, and the head needs no sticky offset at all.
 *
 * Dragging it down dismisses it. The gesture starts on the handle or the title,
 * or in the body when the body is already scrolled to the top: dragging down
 * from there has nothing to scroll to, so there is no gesture to steal.
 */

const DISMISS_FRACTION = 0.25
/** px per ms. A flick this fast dismisses regardless of how far it travelled. */
const DISMISS_VELOCITY = 0.5
const EXIT_MS = 180

export interface SheetProps {
  /** Extra classes on `.sheet`: the width variants (`nav`, `saved`, `confirm`). */
  variant?: string
  /** Extra classes on the backdrop. */
  backdropClass?: string
  /** Head content, left of the close button. */
  title: ReactNode
  onClose: () => void
  closeLabel: string
  /** Confirm has no close button: its two actions are the only ways out. */
  noClose?: boolean
  /** Pinned below the scrolling body. */
  footer?: ReactNode
  children: ReactNode
}

export function Sheet({
  variant = '',
  backdropClass = '',
  title,
  onClose,
  closeLabel,
  noClose,
  footer,
  children,
}: SheetProps) {
  const back = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y0: number; y: number; t: number; on: boolean } | null>(null)

  const docked = () => window.matchMedia('(max-width: 640px)').matches
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const paint = (dy: number) => {
    const el = sheet.current
    if (!el) return
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
    // Fading the backdrop element itself would fade the sheet with it, since the
    // sheet is inside it. Only the colour moves.
    const p = Math.min(1, dy / Math.max(1, el.offsetHeight))
    if (back.current) back.current.style.background = `rgba(0, 0, 0, ${(0.4 * (1 - p)).toFixed(3)})`
  }

  const settle = () => {
    const el = sheet.current
    if (!el) return
    el.style.transition = `transform ${EXIT_MS}ms ease-out`
    el.style.transform = ''
    if (back.current) back.current.style.background = ''
    setTimeout(() => {
      if (sheet.current) sheet.current.style.transition = ''
    }, EXIT_MS)
  }

  const dismiss = () => {
    const el = sheet.current
    if (!el || calm()) return onClose()
    el.style.transition = `transform ${EXIT_MS}ms ease-in`
    el.style.transform = `translateY(${el.offsetHeight}px)`
    if (back.current) {
      back.current.style.transition = `background ${EXIT_MS}ms ease-in`
      back.current.style.background = 'rgba(0, 0, 0, 0)'
    }
    setTimeout(onClose, EXIT_MS)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!docked() || e.button !== 0) return
    const el = e.target as HTMLElement
    // A control inside the head keeps its own behaviour; so does a text selection.
    if (el.closest('button, a, input, textarea, select, label')) return
    if (el.closest('.sheet-body') && (body.current?.scrollTop ?? 0) > 0) return
    drag.current = { id: e.pointerId, y0: e.clientY, y: e.clientY, t: e.timeStamp, on: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.y0
    // Commit only past a few pixels, so a tap that wobbles is still a tap, and a
    // body that has scrolled since pointerdown keeps its scroll.
    if (!d.on) {
      if (dy < 8) return
      if ((body.current?.scrollTop ?? 0) > 0) {
        drag.current = null
        return
      }
      d.on = true
      sheet.current?.setPointerCapture(e.pointerId)
    }
    d.y = e.clientY
    d.t = e.timeStamp
    paint(Math.max(0, dy))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.on) return
    const el = sheet.current
    const dy = Math.max(0, e.clientY - d.y0)
    const v = (e.clientY - d.y) / Math.max(1, e.timeStamp - d.t)
    if (el && (dy > el.offsetHeight * DISMISS_FRACTION || v > DISMISS_VELOCITY)) dismiss()
    else settle()
  }

  return (
    <div ref={back} className={`sheet-backdrop ${backdropClass}`} onClick={onClose}>
      <div
        ref={sheet}
        className={`sheet ${variant}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          {title}
          {!noClose && (
            <button className="icon" onClick={onClose} aria-label={closeLabel}>
              <Icon name="close" />
            </button>
          )}
        </div>
        <div ref={body} className="sheet-body">
          {children}
        </div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
