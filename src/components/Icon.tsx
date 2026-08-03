import type { ReactNode } from 'react'

/**
 * The product's whole icon set, harvested from `design-system/design-system.html`
 * ("Icons · the complete set"). Outlined on a 24px grid, 1.4-2.2 stroke, rounded
 * caps and joins, drawn at 17-21px inside a 44pt target.
 *
 * The design system's first rule about icons is that there are no emoji anywhere:
 * an emoji carries another vendor's art direction into a page that is otherwise
 * entirely this one's, and it renders differently on every platform. So this file
 * is the only place a glyph is allowed to come from.
 *
 * The set ships every icon the document names, not only the ones in use today, so
 * a screen that has not been built yet does not have to re-harvest them.
 */

interface Spec {
  d: ReactNode
  /** Absent means the shape is filled rather than stroked. */
  sw?: number
  fill?: boolean
}

const ICONS = {
  prev: { d: <><path d="m14 6-6 6 6 6" /></>, sw: 2 },
  next: { d: <><path d="m10 6 6 6-6 6" /></>, sw: 2 },
  expand: { d: <><path d="m6 9 6 6 6-6" /></>, sw: 2 },
  collapse: { d: <><path d="m18 15-6-6-6 6" /></>, sw: 2 },
  close: { d: <><path d="M6 6l12 12M18 6 6 18" /></>, sw: 1.9 },
  add: { d: <><path d="M12 5v14M5 12h14" /></>, sw: 1.9 },
  done: { d: <><path d="m5 12.5 4.5 4.5L19 7" /></>, sw: 2.2 },
  noColour: { d: <><circle cx="12" cy="12" r="8.5" /><path d="M6 18 18 6" /></>, sw: 1.4 },
  search: { d: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>, sw: 1.8 },
  menu: { d: <><path d="M4 7h16M4 12h16M4 17h10" /></>, sw: 1.9 },
  highlight: { d: <><path d="M14 4 20 10 11 19H5v-6z" /><path d="M4 21h16" /></>, sw: 1.7 },
  bookmark: { d: <><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" /></>, sw: 1.7 },
  bookmarked: { d: <><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" /></>, sw: 1.7, fill: true },
  note: { d: <><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M14 6l4 4" /></>, sw: 1.7 },
  share: { d: <><path d="M12 15V4" /><path d="m8 7.5 4-3.5 4 3.5" /><path d="M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6" /></>, sw: 1.7 },
  copy: { d: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" /></>, sw: 1.7 },
  link: { d: <><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.8 6.5" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" /></>, sw: 1.7 },
  invite: { d: <><circle cx="9" cy="8.5" r="3.5" /><path d="M3 19.5a6 6 0 0 1 12 0" /><path d="M17 6.5v6M20 9.5h-6" /></>, sw: 1.7 },
  play: { d: <><path d="M8 5v14l11-7z" /></>, fill: true },
  pause: { d: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>, fill: true },
  /* The 39th. The document's Listening header is described as carrying "pause,
     time remaining and stop", but its icon set ships only play and pause. This
     reader stops rather than pauses (playback resets to the start of the verse),
     so borrowing the pause glyph would state something the button does not do.
     Drawn to match pause: same 14-tall body, same 1 rounded corner. */
  stop: { d: <><rect x="6" y="5" width="12" height="14" rx="1" /></>, fill: true },
  speak: { d: <><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18 7a7 7 0 0 1 0 10" /></>, sw: 1.7 },
  study: { d: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" /></>, sw: 1.7 },
  concordance: { d: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v13.5H6.5A2.5 2.5 0 0 0 4 20z" /><path d="M19 17.5v2.5H6.5" /></>, sw: 1.7 },
  edition: { d: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.4 2.6 2.4 14.4 0 17M12 3.5c-2.4 2.6-2.4 14.4 0 17" /></>, sw: 1.7 },
  download: { d: <><path d="M12 4v10" /><path d="m8 10.5 4 3.5 4-3.5" /><path d="M5 18.5h14" /></>, sw: 1.7 },
  stack: { d: <><path d="M4 6h16M4 12h16M4 18h16" /></>, sw: 1.7 },
  paragraph: { d: <><path d="M5 6h14M5 10h14M5 14h9" /><path d="M5 18h11" /></>, sw: 1.7 },
  verseRows: { d: <><path d="M6 7h1M10 7h8M6 12h1M10 12h8M6 17h1M10 17h5" /></>, sw: 1.7 },
  day: { d: <><circle cx="12" cy="12" r="4.2" /><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" /></>, sw: 1.7 },
  night: { d: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></>, sw: 1.7 },
  settings: { d: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>, sw: 1.7 },
  sort: { d: <><path d="M4.5 7.5h7M4.5 12h11M4.5 16.5h5" /><path d="M17.5 8v9M15 14.5l2.5 2.5 2.5-2.5" /></>, sw: 1.7 },
  reorder: { d: <><path d="M4 5.5h16M4 12h16M4 18.5h16" /></>, sw: 1.7 },
  tag: { d: <><path d="M12.5 4.5 20 12l-6.5 6.5H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /><circle cx="15.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" /></>, sw: 1.7 },
  history: { d: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, sw: 1.7 },
  export: { d: <><path d="M12 4.5v9" /><path d="m8.5 10 3.5 3.5L15.5 10" /><path d="M5 15v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3" /></>, sw: 1.7 },
  delete: { d: <><path d="M6 7.5h12" /><path d="M9.5 7.5V5.5h5v2" /><path d="m7.5 7.5.9 11.2a1.4 1.4 0 0 0 1.4 1.3h4.4a1.4 1.4 0 0 0 1.4-1.3l.9-11.2" /></>, sw: 1.7 },
  about: { d: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.9" r="0.9" fill="currentColor" stroke="none" /></>, sw: 1.7 },
} satisfies Record<string, Spec>

export type IconName = keyof typeof ICONS

/**
 * An icon is decoration: the button around it carries the accessible name through
 * its `aria-label` or `title`, so this is hidden from assistive technology and
 * never announced twice.
 */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const spec: Spec = ICONS[name]
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={spec.fill ? 'currentColor' : 'none'}
      stroke={spec.sw ? 'currentColor' : 'none'}
      strokeWidth={spec.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {spec.d}
    </svg>
  )
}
