import { useEffect, useId, useRef, type ReactNode } from 'react'
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
 * from there has nothing to scroll to, so there is no gesture to steal. The body
 * case is a pointer-device one only. A touch there is claimed by the scroller
 * before the second move arrives, and the only way to stop that would be to take
 * `touch-action` off the one element in the sheet that has to keep scrolling.
 *
 * The search sheet gives up its title the same way and for the same reason: it is
 * the one sheet whose title is a text field, and a field cannot keep the touch
 * behaviour a field needs under an ancestor that has given it away. A touch drag
 * on its head is claimed by the browser, so search drags by its handle alone.
 *
 * It is also the dialog. Every sheet is `role="dialog" aria-modal="true"`, named by
 * its own `<h2>`, holds Tab inside itself while open, and hands focus back to
 * whatever opened it on the way out. None of that was true before: a screen reader
 * announced no boundary, and six Tab presses from an open sheet walked out onto the
 * header icons, the edition tabs and a verse number, all of them behind the backdrop.
 */

const DISMISS_FRACTION = 0.25
/** px per ms. A flick this fast dismisses regardless of how far it travelled. */
const DISMISS_VELOCITY = 0.5
const EXIT_MS = 180

/** Everything a Tab press can reach, in document order. `:not([tabindex='-1'])`
 *  keeps the sheet root and the chapter-end landmark out of the cycle. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  " textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])"

export interface SheetProps {
  /** Extra classes on `.sheet`: the width variants (`nav`, `saved`, `confirm`). */
  variant?: string
  /** Extra classes on the backdrop. */
  backdropClass?: string
  /** Head content, left of the close button. Wrapped in the sheet's `<h2>` unless
   *  `label` is given, in which case it is rendered as-is. */
  title: ReactNode
  /** The sheet's accessible name when `title` is not text — the search sheet, whose
   *  head is the query field. Rendered as a visually-hidden heading. */
  label?: string
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
  label,
  onClose,
  closeLabel,
  noClose,
  footer,
  children,
}: SheetProps) {
  const back = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y0: number; y: number; t: number; on: boolean; inBody: boolean } | null>(null)
  const titleId = useId()

  /**
   * Focus in on the way up, and back to the opener on the way down.
   *
   * A sheet that opens without moving focus leaves the reader's place behind the
   * backdrop: the book/chapter, saved, plan and settings sheets all did. Focus goes
   * to the first control inside, or to the sheet itself when it has none, unless
   * something in there has already claimed it — the search field and the note editor
   * both `autoFocus`, and stealing that back would close the phone keyboard.
   *
   * Restoring is explicit rather than left to the browser. Dropping the sheet out of
   * the DOM sends focus to `<body>`, which loses the reader's place just as surely,
   * and the check keeps it from yanking focus off something that has since moved on.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = sheet.current
    const raf = requestAnimationFrame(() => {
      if (!el || el.contains(document.activeElement)) return
      const first = el.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? el).focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      if (opener?.isConnected && document.activeElement === document.body) opener.focus()
    }
  }, [])

  /** Hold Tab inside the sheet. Escape is the App's business: it unwinds the whole
   *  stack of overlays innermost-first, which no single sheet can see. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const el = sheet.current
    if (!el) return
    const stops = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.offsetParent !== null || x === document.activeElement,
    )
    if (!stops.length) {
      e.preventDefault()
      return el.focus()
    }
    const first = stops[0]
    const last = stops[stops.length - 1]
    const on = document.activeElement
    // The sheet root itself is a stop that Tab must leave, so treat it as "before
    // the first" in either direction.
    if (!e.shiftKey && (on === last || on === el)) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && (on === first || on === el)) {
      e.preventDefault()
      last.focus()
    }
  }

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
    const inBody = !!el.closest('.sheet-body')
    if (inBody && (body.current?.scrollTop ?? 0) > 0) return
    drag.current = { id: e.pointerId, y0: e.clientY, y: e.clientY, t: e.timeStamp, on: false, inBody }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.y0
    // Commit only past a few pixels, so a tap that wobbles is still a tap, and a
    // body that has scrolled since pointerdown keeps its scroll. Only a gesture that
    // started *in* the body can lose that race; one that started on the handle or the
    // title is not competing with the scroller, and killing it because the body happens
    // to be scrolled is what made the handle dead on every tall sheet.
    if (!d.on) {
      if (dy < 8) return
      if (d.inBody && (body.current?.scrollTop ?? 0) > 0) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          {label ? (
            <>
              <h2 className="sheet-title vhidden" id={titleId}>{label}</h2>
              {title}
            </>
          ) : (
            <h2 className="sheet-title" id={titleId}>{title}</h2>
          )}
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
