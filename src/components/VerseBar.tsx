import { useEffect, useRef, useState } from 'react'
import { COLORS, type HColor } from '../lib/annotations'
import type { T } from '../lib/i18n'
import { Icon } from './Icon'

/**
 * The row that opens under a tapped verse: highlight, note, bookmark, share,
 * listen, Study.
 *
 * Six equal cells that cannot wrap, each with its label under its glyph.
 *
 * It used to be five icons and one labelled button sized so the row *just* fitted a
 * 390pt screen — and at exactly 390 it wrapped anyway, stranding Study alone on a
 * second line. Worse, five of the six said nothing: Highlight was a pen nib and Add
 * note a pencil, two near-identical marks three cells apart, and they are the two
 * everyday actions. Equal cells mean the row's height is the same whatever is in it
 * and whatever the column width, so opening the bar shifts the text below by a
 * constant instead of by one, two or three rows' worth.
 *
 * Highlight and share still swap the row's contents in place rather than opening
 * anything, so highlighting three verses in a row is three taps.
 */

export interface VerseBarProps {
  t: T
  /** Whether this verse already carries a highlight in the tapped edition. */
  hasHL: boolean
  bookmarked: boolean
  /** False for an edition with no voice installed, or no text in this verse. */
  canListen: boolean
  /** What the play cell promises here. The reader's Listen is this verse and then
   *  silence; a reading plan day's is the rest of the day, which is a different size
   *  of thing and has to say so. Defaults to Listen. */
  listenLabel?: string
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
  t, hasHL, bookmarked, canListen, listenLabel,
  onColour, onClearHL, onBookmark, onNote, onListen, onStudy,
  onCopyText, onCopyLink, onInvite,
}: VerseBarProps) {
  const [view, setView] = useState<'main' | 'highlight' | 'share'>('main')
  const el = useRef<HTMLDivElement>(null)

  // Tapping the last verse on screen used to open the bar below the fold, so the
  // tap looked like it had done nothing. `nearest` moves the page only when the row
  // is actually outside it.
  useEffect(() => {
    el.current?.scrollIntoView({ block: 'nearest' })
  }, [view])

  const back = (
    <button className="vbtn" onClick={() => setView('main')} aria-label={t('back')}>
      <Icon name="prev" size={18} flip />
    </button>
  )

  if (view === 'highlight') {
    return (
      <div className="vbar swatches" ref={el} onClick={(e) => e.stopPropagation()}>
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
    // own on the main row and they are all the same intent. The Study sheet's own
    // footer swaps the same way, under the same names.
    return (
      <div className="vbar" ref={el} onClick={(e) => e.stopPropagation()}>
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
    <div className="vbar cells" ref={el} onClick={(e) => e.stopPropagation()}>
      <button className="vbtn" onClick={() => setView('highlight')}>
        <Icon name="highlight" size={19} />
        <span className="vlabel">{t('highlight')}</span>
      </button>
      <button className="vbtn" onClick={onNote}>
        <Icon name="note" size={18} />
        <span className="vlabel">{t('note')}</span>
      </button>
      {/* The one action that finishes on the tap: no sheet, no keyboard. The row
          stays open and the glyph fills, so the tap is visibly what saved it. */}
      <button
        className={`vbtn ${bookmarked ? 'on' : ''}`}
        onClick={onBookmark}
        aria-pressed={bookmarked}
      >
        <Icon name={bookmarked ? 'bookmarked' : 'bookmark'} size={18} />
        <span className="vlabel">{t('bookmark')}</span>
      </button>
      <button className="vbtn" onClick={() => setView('share')}>
        <Icon name="share" size={18} />
        <span className="vlabel">{t('share')}</span>
      </button>
      {/* An edition with no installed voice keeps its cell rather than closing the
          gap, so the six actions stay in the same place from verse to verse and
          from edition to edition. */}
      <button className="vbtn" onClick={onListen} disabled={!canListen}>
        <Icon name="play" size={15} />
        <span className="vlabel">{listenLabel ?? t('listen')}</span>
      </button>
      {/* Study is the only action here that opens a sheet, so it is the only filled
          one. It is a cell like the others now, not a wider button pushed right. */}
      <button className="vbtn study" onClick={onStudy}>
        <Icon name="study" size={16} />
        <span className="vlabel">{t('study')}</span>
      </button>
    </div>
  )
}
