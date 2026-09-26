import type { T } from '../lib/i18n'
import { BY_ID, type Lang } from '../lib/versions'
import { Icon } from './Icon'

/**
 * The transport: what is being read, how far through it is, and the controls for it.
 *
 * It replaces a single round button that said only "stop". That button answered none
 * of the three questions a listener actually has — *what* is playing, *how far* in it
 * is, and *how do I go back over that bit* — and it moved around: the chapter head in
 * the parallel reader, a corner in flowing mode and in a plan day. One fixed place,
 * one set of controls, whatever is being read.
 *
 * The reference is a button because the other half of "where is the audio" is being
 * able to get back to it. Playback follows the spoken verse down the page until the
 * reader scrolls by hand, at which point it lets go — and this is how they rejoin.
 *
 * The hairline is not draggable and is not meant to be. Three pixels is not a drag
 * target, and making it one would turn the one cue in the bar into a widget. The
 * seek surface is the text itself: tap a verse, press *Read on*.
 *
 * Following has a toggle here as well as a setting, because it is the one thing about
 * playback a reader changes their mind on mid-chapter: the default belongs in
 * settings, the exception belongs to hand. Scrolling turns it off, and the toggle is
 * how it comes back — the same state, shown rather than guessed at.
 *
 * There is no close. It sat beside pause doing something pause already did — silencing
 * the voice — differing only in whether the place was kept, which nothing on screen
 * could say. Ending a run belongs to the control that started it: the chapter head, the
 * progress row in flowing mode, a day's summary line. Each shows a stop while its run
 * exists, playing or paused, and pressing it takes the bar with it.
 *
 * So the row is two kinds of thing: what is playing and how to move through it, then —
 * across a rule — whether the page keeps up. That last one is a toggle with a word on
 * it, not a glyph: a reader who has just been dropped by a mode they did not know they
 * were in needs to read the way back, not infer it from a tinted circle.
 */
export function NowPlaying({
  t,
  lang,
  label,
  at,
  total,
  playing,
  playLabel,
  following,
  onFollow,
  onJump,
  onPrev,
  onNext,
  onPlayPause,
}: {
  t: T
  /** The interface language, which is what the bar is written in whatever edition is
   *  being spoken — it names controls, not scripture. */
  lang: Lang
  /** The verse being read, named: "John 3:16". */
  label: string
  /** Position in the run, from 1. */
  at: number
  total: number
  playing: boolean
  /** What the play button promises when stopped — a day reads the day, a paused run
   *  resumes. */
  playLabel: string
  /** Whether the page is being pulled along with the verse being read. */
  following: boolean
  onFollow: (on: boolean) => void
  onJump: () => void
  onPrev: () => void
  onNext: () => void
  onPlayPause: () => void
}) {
  return (
    <div
      className="nowplay"
      role="region"
      aria-label={t('now_playing')}
      /* The bar is interface, not scripture: it reads in the UI language whatever the
         edition being spoken is, and lays out in that language's direction. */
      lang={BY_ID[lang].htmlLang}
      dir={BY_ID[lang].dir}
    >
      <div
        className="nowtrack"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={at}
        aria-label={t('now_playing')}
      >
        <span className="nowfill" style={{ inlineSize: `${(at / total) * 100}%` }} />
      </div>
      {/* Two rows, because five things do not fit one at 390pt and legibly: with the
          toggle beside them the reference collapsed to "1 T…" on a book like
          1 Thessalonians. What is playing and how to move through it on top; how far
          in, and whether the page keeps up, underneath. */}
      <div className="nowrow">
        <button className="nowref" onClick={onJump} title={t('audio_jump')} aria-label={t('audio_jump')}>
          <span className="nowlabel">{label}</span>
        </button>
        <div className="nowbtns">
          <button className="nowbtn" onClick={onPrev} title={t('audio_prev')} aria-label={t('audio_prev')}>
            <Icon name="prev" size={20} />
          </button>
          <button
            className="nowbtn play"
            onClick={onPlayPause}
            title={playing ? t('pause_audio') : playLabel}
            aria-label={playing ? t('pause_audio') : playLabel}
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button className="nowbtn" onClick={onNext} title={t('audio_next')} aria-label={t('audio_next')}>
            <Icon name="next" size={20} />
          </button>
        </div>
      </div>
      <div className="nowrow2">
        <small className="nowat">{t('audio_at', { n: String(at), total: String(total) })}</small>
        <div className="nowmeta">
          {/* Labelled, and the label is the reader's word for it rather than the
              codebase's. The state is said twice over — the word ON or OFF, and the
              fill — because scrolling switches this without being asked to, and a
              reader who did not know the mode existed has to be able to read what
              just happened. */}
          <button
            className={`nowtoggle ${following ? 'on' : ''}`}
            onClick={() => onFollow(!following)}
            aria-pressed={following}
            title={following ? t('follow_off') : t('follow_on')}
          >
            <Icon name="follow" size={15} />
            <span className="nowtogname">{t('autoscroll')}</span>
            <span className="nowtogstate">{t(following ? 'on_short' : 'off_short')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
