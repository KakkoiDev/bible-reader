import { useState } from 'react'
import { COLORS, type HColor } from '../lib/annotations'
import type { T } from '../lib/i18n'
import { Icon } from './Icon'

/**
 * The row that opens under a tapped verse: highlight, share, bookmark, note,
 * listen, Study. Five icon actions and one labelled, which is the full width of a
 * 390pt screen. Only Study opens a sheet.
 *
 * Highlight and share swap the row's contents in place rather than opening
 * anything, so highlighting three verses in a row is three taps.
 */

export interface VerseBarProps {
  t: T
  /** Whether this verse already carries a highlight in the tapped edition. */
  hasHL: boolean
  bookmarked: boolean
  /** False for an edition with no voice installed, or no text in this verse. */
  canListen: boolean
  onColour: (c: HColor) => void
  onClearHL: () => void
  onBookmark: () => void
  onNote: () => void
  onListen: () => void
  onStudy: () => void
  onCopyText: () => void
  onCopyLink: () => void
  onInvite: () => void
}

export function VerseBar({
  t, hasHL, bookmarked, canListen,
  onColour, onClearHL, onBookmark, onNote, onListen, onStudy,
  onCopyText, onCopyLink, onInvite,
}: VerseBarProps) {
  const [view, setView] = useState<'main' | 'highlight' | 'share'>('main')

  const back = (
    <button className="vbtn" onClick={() => setView('main')} aria-label={t('back')}>
      <Icon name="prev" size={18} flip />
    </button>
  )

  if (view === 'highlight') {
    return (
      <div className="vbar" onClick={(e) => e.stopPropagation()}>
        {back}
        {/* The same swatch atom the selection toolbar uses, so a colour is one thing
            in this app and not two. */}
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch sw-${c}`}
            aria-label={`${t('highlight')}: ${c}`}
            onClick={() => {
              onColour(c)
              setView('main')
            }}
          />
        ))}
        {hasHL && (
          <button
            className="swatch nocolour"
            aria-label={t('remove_highlight')}
            onClick={() => {
              onClearHL()
              setView('main')
            }}
          >
            <Icon name="noColour" size={26} />
          </button>
        )}
      </div>
    )
  }

  if (view === 'share') {
    // Three things under one button, because each is too rare to hold a slot of its
    // own on the main row and they are all the same intent.
    return (
      <div className="vbar" onClick={(e) => e.stopPropagation()}>
        {back}
        <button className="vbtn wide" onClick={onCopyText}>
          <Icon name="copy" size={17} /> {t('copy_text')}
        </button>
        <button className="vbtn wide" onClick={onCopyLink}>
          <Icon name="link" size={17} /> {t('copy_link')}
        </button>
        <button className="vbtn wide" onClick={onInvite}>
          <Icon name="invite" size={17} /> {t('copy_invite')}
        </button>
      </div>
    )
  }

  return (
    <div className="vbar" onClick={(e) => e.stopPropagation()}>
      <button className="vbtn" onClick={() => setView('highlight')} aria-label={t('highlight')}>
        <Icon name="highlight" size={19} />
      </button>
      <button className="vbtn" onClick={() => setView('share')} aria-label={t('share')}>
        <Icon name="share" size={18} />
      </button>
      {/* The one action that finishes on the tap: no sheet, no keyboard. The row
          stays open and the glyph fills, so the tap is visibly what saved it. */}
      <button
        className={`vbtn ${bookmarked ? 'on' : ''}`}
        onClick={onBookmark}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? t('remove_bookmark') : t('bookmark')}
      >
        <Icon name={bookmarked ? 'bookmarked' : 'bookmark'} size={18} />
      </button>
      <button className="vbtn" onClick={onNote} aria-label={t('add_note')}>
        <Icon name="note" size={18} />
      </button>
      {canListen && (
        <button className="vbtn" onClick={onListen} aria-label={t('listen_from_here')}>
          <Icon name="play" size={15} />
        </button>
      )}
      {/* Pushed right by its own margin rather than by a spacer element: a spacer is
          a flex item, and its gap is 6px the row does not have at 390pt. */}
      <button className="vbtn study" onClick={onStudy}>
        <Icon name="study" size={16} /> {t('study')}
      </button>
    </div>
  )
}
