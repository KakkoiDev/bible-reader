import { useMemo, useState } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { bookName, type IndexItem, type Lang } from '../lib/types'
import { BY_ID } from '../lib/versions'
import type { translator } from '../lib/i18n'
import {
  dayIndex,
  dayProgress,
  daysLeft,
  scopeChapters,
  startOfDay,
  todaysReading,
  type PlanBlock,
  type Progress,
  type Ref,
  type Scope,
} from '../lib/plans'

/**
 * The reading planner.
 *
 * Today's reading sits at the top, because that is the only part most readers ever
 * need. Setting a plan up is four taps: what to read, how long, add. Everything the
 * request called "advanced" is behind a `<details>`, closed, so the default path is
 * never asked a question it can answer itself.
 *
 * Nothing here computes a streak or a debt. `todaysReading` is a pure function of the
 * start date, so a day missed leaves today's slot exactly where it was.
 */

/** "Genesis 1-3, Psalms 4": consecutive chapters of one book collapse to a range. */
export function formatRefs(refs: Ref[], index: IndexItem[], ui: Lang): string {
  const parts: string[] = []
  let i = 0
  while (i < refs.length) {
    const { slug } = refs[i]
    let j = i
    while (j + 1 < refs.length && refs[j + 1].slug === slug && refs[j + 1].ch === refs[j].ch + 1) j++
    const name = bookName(index.find((b) => b.slug === slug), ui)
    parts.push(j > i ? `${name} ${refs[i].ch}-${refs[j].ch}` : `${name} ${refs[i].ch}`)
    i = j + 1
  }
  return parts.join(', ')
}

const GOSPELS = ['matthew', 'mark', 'luke', 'john']

type Preset = 'bible' | 'ot' | 'nt' | 'gospels' | 'book'

const scopeOf = (preset: Preset, slug: string): Scope =>
  preset === 'bible' ? { kind: 'range', from: 'genesis', to: 'revelation' }
  : preset === 'ot' ? { kind: 'range', from: 'genesis', to: 'malachi' }
  : preset === 'nt' ? { kind: 'range', from: 'matthew', to: 'revelation' }
  : preset === 'gospels' ? { kind: 'books', slugs: GOSPELS }
  : { kind: 'books', slugs: [slug] }

/** What a block covers, in words, for the row under its name. */
function scopeLabel(scope: Scope, index: IndexItem[], ui: Lang, t: ReturnType<typeof translator>): string {
  const named = (slug: string) => bookName(index.find((b) => b.slug === slug), ui)
  if (scope.kind === 'chapters') return t('plan_chapters_n', { n: String(scope.refs.length) })
  if (scope.kind === 'books')
    return scope.slugs.length === 4 && GOSPELS.every((g) => scope.slugs.includes(g))
      ? t('plan_scope_gospels')
      : scope.slugs.map(named).join(', ')
  if (scope.from === 'genesis' && scope.to === 'revelation') return t('plan_scope_bible')
  if (scope.from === 'genesis' && scope.to === 'malachi') return t('old_testament')
  if (scope.from === 'matthew' && scope.to === 'revelation') return t('new_testament')
  return `${named(scope.from)} - ${named(scope.to)}`
}

/** "2026-08-03", which is what `<input type="date">` reads and writes. */
const isoDay = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fromIsoDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export interface PlannerProps {
  index: IndexItem[]
  blocks: PlanBlock[]
  progress: Progress
  ui: Lang
  t: ReturnType<typeof translator>
  today: number
  canTTS: boolean
  onClose: () => void
  onAdd: (b: Omit<PlanBlock, 'id' | 'order'>) => void
  onRemove: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  /** Open the day's chapters as one passage. */
  onRead: (refs: Ref[]) => void
  onPlay: (refs: Ref[]) => void
}

export function Planner({
  index, blocks, progress, ui, t, today, canTTS, onClose, onAdd, onRemove, onMove, onRead, onPlay,
}: PlannerProps) {
  const [preset, setPreset] = useState<Preset>('nt')
  const [slug, setSlug] = useState('proverbs')
  const [days, setDays] = useState(30)
  const [name, setName] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [start, setStart] = useState(() => isoDay(Date.now()))
  const [adding, setAdding] = useState(false)

  const sorted = useMemo(() => [...blocks].sort((a, b) => a.order - b.order), [blocks])
  const dir = BY_ID[ui].dir

  const draftScope = scopeOf(preset, slug)
  const draftSize = scopeChapters(draftScope, index).length
  const draftName = name.trim() || scopeLabel(draftScope, index, ui, t)

  const submit = () => {
    onAdd({
      name: draftName,
      scope: draftScope,
      days: Math.max(1, Math.round(days)),
      repeat,
      startedAt: startOfDay(fromIsoDay(start)),
    })
    setAdding(false)
    setName('')
  }

  return (
    <Sheet onClose={onClose} closeLabel={t('close')} title={<b>{t('planner')}</b>}>
      {sorted.length === 0 && <p className="empty">{t('planner_empty')}</p>}

      {sorted.map((b) => {
        const refs = todaysReading(b, index, today)
        const { done, total } = dayProgress(progress, refs)
        const left = daysLeft(b, today)
        const i = dayIndex(b, today)
        const all = scopeChapters(b.scope, index)
        return (
          <section className="pblock" key={b.id}>
            <div className="pblock-head">
              <div className="dmove">
                <button className="mini" disabled={b.order === 0} onClick={() => onMove(b.id, -1)} aria-label={t('move_up')}>
                  <Icon name="collapse" size={15} />
                </button>
                <button className="mini" disabled={b.order === sorted.length - 1} onClick={() => onMove(b.id, 1)} aria-label={t('move_down')}>
                  <Icon name="expand" size={15} />
                </button>
              </div>
              <div className="pblock-id">
                <b>{b.name}</b>
                <small>
                  {scopeLabel(b.scope, index, ui, t)} · {t('plan_chapters_n', { n: String(all.length) })}
                  {b.repeat && ` · ${t('plan_repeats')}`}
                </small>
              </div>
              <button className="icon" onClick={() => onRemove(b.id)} aria-label={t('plan_delete')}>
                <Icon name="delete" size={18} />
              </button>
            </div>

            <p className="pday">
              <span className="peyebrow">{t('plan_today')}</span>
              {i === null ? (
                <span className="pstate">
                  {startOfDay(b.startedAt) > startOfDay(today)
                    ? t('plan_not_started', { date: new Date(b.startedAt).toLocaleDateString(BY_ID[ui].htmlLang) })
                    : t('plan_finished')}
                </span>
              ) : refs.length === 0 ? (
                <span className="pstate">{t('plan_nothing_today')}</span>
              ) : (
                <span className="pref" dir={dir}>{formatRefs(refs, index, ui)}</span>
              )}
            </p>

            {refs.length > 0 && i !== null && (
              <>
                <p className="pmeta">
                  {done === total ? t('plan_all_read') : t('plan_progress', { done: String(done), total: String(total) })}
                  {left !== null && ` · ${left === 1 ? t('plan_last_day') : t('plan_days_left', { n: String(left) })}`}
                </p>
                <div className="pactions">
                  <button className="primary" onClick={() => onRead(refs)}>
                    <Icon name="study" size={18} /> {t('plan_read_now')}
                  </button>
                  {canTTS && (
                    <button className="mini" onClick={() => onPlay(refs)} aria-label={t('play_chapter')}>
                      <Icon name="play" size={17} />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )
      })}

      {!adding ? (
        <button className="pnew" onClick={() => setAdding(true)}>
          <Icon name="add" size={18} /> {t('plan_new')}
        </button>
      ) : (
        <section className="pform">
          <div className="sgroup">{t('plan_covers')}</div>
          <div className="chips">
            {([['bible', t('plan_scope_bible')], ['ot', t('old_testament')], ['nt', t('new_testament')],
               ['gospels', t('plan_scope_gospels')], ['book', t('plan_scope_book')]] as [Preset, string][])
              .map(([p, label]) => (
                <button key={p} className={`chip ${preset === p ? 'on' : ''}`} onClick={() => setPreset(p)}>
                  {label}
                </button>
              ))}
          </div>
          {preset === 'book' && (
            <select className="pselect" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {index.map((b) => (
                <option key={b.slug} value={b.slug}>{bookName(b, ui)}</option>
              ))}
            </select>
          )}

          <div className="sgroup">{t('plan_length')}</div>
          <div className="chips">
            {([[7, t('plan_len_week')], [30, t('plan_len_month')], [90, t('plan_len_quarter')],
               [365, t('plan_len_year')]] as [number, string][]).map(([n, label]) => (
              <button key={n} className={`chip ${days === n ? 'on' : ''}`} onClick={() => setDays(n)}>
                {label}
              </button>
            ))}
          </div>
          {/* What will actually land on a day, before anything is committed. */}
          <p className="pmeta">
            {t('plan_chapters_n', { n: String(draftSize) })} ·{' '}
            {(draftSize / Math.max(1, days)).toFixed(1)} / {t('plan_today').toLowerCase()}
          </p>

          <details className="padv">
            <summary>{t('plan_advanced')}</summary>
            <label className="srow">
              <span>{t('plan_name')}</span>
              <input className="ptext" value={name} placeholder={draftName} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="srow">
              <span>{t('plan_days_field')}</span>
              <input className="pnum" type="number" min={1} max={3650} value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)} />
            </label>
            <label className="srow">
              <span>{t('plan_start_field')}</span>
              <input className="pnum" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="srow">
              <span>{t('plan_repeat')}</span>
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            </label>
          </details>

          <div className="pactions">
            <button className="primary" onClick={submit}>{t('plan_add')}</button>
            <button className="mini" onClick={() => setAdding(false)}>{t('close')}</button>
          </div>
        </section>
      )}
    </Sheet>
  )
}
