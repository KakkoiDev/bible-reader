import { useEffect, useMemo, useState } from 'react'
import { COLORS, parseTags, type HColor } from '../lib/annotations'
import { BY_ID, VERSIONS, type Lang } from '../lib/versions'
import type { T } from '../lib/i18n'

export type Theme = 'system' | 'light' | 'dark'
export type Size = 'sm' | 'md' | 'lg'

const COLOR_LABEL: Record<HColor, string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
}

/** Coverage caveat for the editions that only carry half the canon. */
export const coverageNote = (t: T, id: Lang): string | null => {
  const c = BY_ID[id].coverage
  return c === 'nt' ? t('nt_only') : c === 'ot' ? t('ot_only') : null
}

const fmtDate = (ms: number | undefined, ui: Lang, fallback: string) => {
  if (!ms) return fallback
  try {
    return new Intl.DateTimeFormat(BY_ID[ui].htmlLang, { dateStyle: 'medium' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** Annotation toolbar: floats over the selection on desktop, docks to a bottom
 *  bar on mobile (so it never collides with the OS copy/paste menu). */
export function Toolbar({
  rect,
  dock,
  hasHL,
  t,
  onColor,
  onNote,
  onClear,
}: {
  rect: DOMRect
  dock: 'float' | 'bottom'
  hasHL: boolean
  t: T
  onColor: (c: HColor) => void
  onNote: () => void
  onClear: () => void
}) {
  const style =
    dock === 'float'
      ? {
          top: Math.max(8, rect.top - 50),
          left: Math.min(Math.max(8, rect.left + rect.width / 2 - 132), window.innerWidth - 272),
        }
      : undefined
  return (
    <div className={`atoolbar ${dock === 'bottom' ? 'bottom' : ''}`} style={style} onMouseDown={(e) => e.preventDefault()}>
      {COLORS.map((c) => (
        <button
          key={c}
          className={`swatch sw-${c}`}
          title={COLOR_LABEL[c]}
          aria-label={`${t('highlight')}: ${c}`}
          onClick={() => onColor(c)}
        />
      ))}
      <span className="asep" />
      <button className="abtn" onClick={onNote} title={t('add_note')}>✎</button>
      {hasHL && (
        <button className="abtn" onClick={onClear} title={t('remove_highlight')}>
          ⌫
        </button>
      )}
    </div>
  )
}

export interface SettingsProps {
  open: boolean
  t: T
  ui: Lang
  theme: Theme
  size: Size
  furigana: boolean
  align: boolean
  rate: number
  voice: 'male' | 'female'
  swipe: boolean
  flow: boolean
  stopAtChapterEnd: boolean
  columns: Lang[]
  ttsOn: boolean
  /** Editions this device has no installed voice for. */
  noVoice: Set<Lang>
  onUi: (l: Lang) => void
  onTheme: (t: Theme) => void
  onSize: (s: Size) => void
  onFurigana: (f: boolean) => void
  onAlign: (v: boolean) => void
  onRate: (r: number) => void
  onVoice: (g: 'male' | 'female') => void
  onSwipe: (v: boolean) => void
  onFlow: (v: boolean) => void
  onStopAtChapterEnd: (v: boolean) => void
  onColumns: (c: Lang[]) => void
  onExport: () => void
  onImport: (file: File) => void
  onClose: () => void
}

export function Settings({
  open,
  t,
  ui,
  theme,
  size,
  furigana,
  align,
  rate,
  voice,
  swipe,
  flow,
  stopAtChapterEnd,
  columns,
  ttsOn,
  noVoice,
  onUi,
  onTheme,
  onSize,
  onFurigana,
  onAlign,
  onRate,
  onVoice,
  onSwipe,
  onFlow,
  onStopAtChapterEnd,
  onColumns,
  onExport,
  onImport,
  onClose,
}: SettingsProps) {
  if (!open) return null
  const moveCol = (l: Lang, d: number) => {
    const i = columns.indexOf(l)
    const j = i + d
    if (j < 0 || j >= columns.length) return
    const c = [...columns]
    ;[c[i], c[j]] = [c[j], c[i]]
    onColumns(c)
  }
  const defaults = VERSIONS.filter((v) => v.defaultOn).map((v) => v.id)
  const hidden = VERSIONS.filter((v) => !columns.includes(v.id))

  const versionLabel = (id: Lang) => {
    const m = BY_ID[id]
    const note = coverageNote(t, id)
    return (
      // <bdi> isolates the native name so an Arabic or Hebrew label doesn't drag the
      // edition badge to the other side of the row: the row keeps the UI's direction,
      // the name keeps its own.
      <span className="collabel">
        <bdi lang={m.htmlLang} dir={m.dir}>{m.label}</bdi> <small>{m.edition}</small>
        {note && <small className="cnote">{note}</small>}
        {ttsOn && noVoice.has(id) && <small className="cnote">{t('no_voice')}</small>}
      </span>
    )
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{t('settings')}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        <div className="sgroup">{t('group_reading')}</div>
        <div className="srow">
          <span>{t('theme')}</span>
          <div className="seg">
            {(['system', 'light', 'dark'] as Theme[]).map((x) => (
              <button key={x} className={theme === x ? 'on' : ''} onClick={() => onTheme(x)}>
                {t(`theme_${x}` as 'theme_system')}
              </button>
            ))}
          </div>
        </div>
        <div className="srow">
          <span>{t('font_size')}</span>
          <div className="seg">
            {(['sm', 'md', 'lg'] as Size[]).map((s) => (
              <button key={s} className={size === s ? 'on' : ''} onClick={() => onSize(s)}>
                {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
        <label className="srow">
          <span>{t('flow')}</span>
          <input type="checkbox" checked={flow} onChange={(e) => onFlow(e.target.checked)} />
        </label>

        {/* Everything that depends on a language lives here: the UI language, which
            editions are shown and in what order, cross-edition alignment, and the
            two per-language reading aids (furigana, swipe-to-switch). */}
        <div className="sgroup">{t('group_languages')}</div>
        <div className="srow">
          <span>{t('ui_language')}</span>
          <select className="sel" value={ui} onChange={(e) => onUi(e.target.value as Lang)}>
            {VERSIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="srow">
          <span>{t('versions')}</span>
          <button className="mini" onClick={() => onColumns(defaults)}>{t('reset')}</button>
        </div>
        <div className="collist">
          {columns.map((l, i) => (
            <div className="colrow" key={l}>
              {versionLabel(l)}
              <div className="colctl">
                <button className="mini" disabled={i === 0} onClick={() => moveCol(l, -1)} aria-label={t('move_up')}>↑</button>
                <button className="mini" disabled={i === columns.length - 1} onClick={() => moveCol(l, 1)} aria-label={t('move_down')}>↓</button>
                <button className="mini" disabled={columns.length <= 1} onClick={() => onColumns(columns.filter((x) => x !== l))}>
                  {t('hide')}
                </button>
              </div>
            </div>
          ))}
          {hidden.map((v) => (
            <div className="colrow off" key={v.id}>
              {versionLabel(v.id)}
              <button className="mini" onClick={() => onColumns([...columns, v.id])}>{t('show')}</button>
            </div>
          ))}
        </div>

        <label className="srow">
          <span>{t('align')}</span>
          <input type="checkbox" checked={align} onChange={(e) => onAlign(e.target.checked)} />
        </label>
        <label className="srow">
          <span>{t('furigana')}</span>
          <input type="checkbox" checked={furigana} onChange={(e) => onFurigana(e.target.checked)} />
        </label>
        <label className="srow">
          <span>{t('swipe')}</span>
          <input type="checkbox" checked={swipe} onChange={(e) => onSwipe(e.target.checked)} />
        </label>

        <div className="sgroup">{t('group_data')}</div>
        <div className="srow">
          <span>{t('notes_data')}</span>
          <div className="databtns">
            <button className="mini" onClick={onExport}>{t('export')}</button>
            <label className="mini asbtn">
              {t('import')}
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImport(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        {ttsOn && (
          <>
            <div className="sgroup">{t('group_audio')}</div>
            <label className="srow">
              <span>{t('stop_chapter_end')}</span>
              <input type="checkbox" checked={stopAtChapterEnd} onChange={(e) => onStopAtChapterEnd(e.target.checked)} />
            </label>
            <div className="srow">
              <span>{t('voice')}</span>
              <div className="seg">
                {(['male', 'female'] as const).map((g) => (
                  <button key={g} className={voice === g ? 'on' : ''} onClick={() => onVoice(g)}>
                    {t(g === 'male' ? 'voice_male' : 'voice_female')}
                  </button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>{t('speed')}</span>
              <div className="seg">
                {([0.75, 1, 1.25] as number[]).map((r) => (
                  <button key={r} className={rate === r ? 'on' : ''} onClick={() => onRate(r)}>
                    {r}×
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

/* --------------------------- Texts & licences --------------------------- */
/** Every edition's attribution in one place — the reader footer only links here,
 *  because eleven attribution lines inline made the page unreadable. */
export function LicencesSheet({
  open,
  t,
  repoUrl,
  onClose,
}: {
  open: boolean
  t: T
  repoUrl: string
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet licences" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{t('licences')}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <p className="empty">{t('licences_intro')}</p>
        <ul className="liclist">
          {VERSIONS.map((v) => (
            <li key={v.id}>
              <span className="licname">
                <bdi lang={v.htmlLang} dir={v.dir}>{v.label}</bdi> <small>{v.edition}</small>
              </span>
              {/* Each attribution starts with its own language's name, so let the
                  browser pick the paragraph direction per line rather than
                  inheriting the UI's — otherwise Arabic/Hebrew lines reorder
                  their parenthesised dates into the wrong place. */}
              <span className="lictext" dir="auto">{v.attribution}</span>
            </li>
          ))}
        </ul>
        <p className="licrepo">
          <a href={repoUrl} target="_blank" rel="noreferrer noopener">{t('source_code')}</a>
        </p>
      </div>
    </div>
  )
}

/* ------------------------------- Confirm ------------------------------- */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  t,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirmLabel: string
  t: T
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="sheet-backdrop confirm-back" onClick={onClose}>
      <div className="sheet confirm" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{title}</b>
        </div>
        <p className="empty">{body}</p>
        <div className="noteact">
          <button className="ghost" onClick={onClose}>{t('cancel')}</button>
          <span className="spacer" />
          <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------- Drawer ------------------------------- */
export type SortMode = 'book' | 'created' | 'updated' | 'custom'

export interface DrawerItem {
  ref: string
  slug: string
  label: string
  note?: string
  tags: string[]
  colors: HColor[]
  createdAt?: number
  updatedAt?: number
}

export function Drawer({
  open,
  t,
  ui,
  items,
  hasAny,
  sort,
  asc,
  thisBook,
  tagFilter,
  tags,
  onSort,
  onAsc,
  onThisBook,
  onToggleTag,
  onDeleteTag,
  onMove,
  onJump,
  onDelete,
  onClose,
}: {
  open: boolean
  t: T
  ui: Lang
  /** Already filtered and sorted by the caller, which knows the book order. */
  items: DrawerItem[]
  /** Whether anything is saved at all — distinguishes "empty" from "filtered out". */
  hasAny: boolean
  sort: SortMode
  asc: boolean
  thisBook: boolean
  tagFilter: string[]
  tags: string[]
  onSort: (s: SortMode) => void
  onAsc: (v: boolean) => void
  onThisBook: (v: boolean) => void
  onToggleTag: (tag: string) => void
  /** Remove a tag from every note that carries it. */
  onDeleteTag: (tag: string) => void
  onMove: (ref: string, delta: 1 | -1) => void
  onJump: (ref: string) => void
  onDelete: (ref: string) => void
  onClose: () => void
}) {
  const [editTags, setEditTags] = useState(false)
  useEffect(() => {
    if (!open) setEditTags(false)
  }, [open])
  if (!open) return null
  const modes: SortMode[] = ['book', 'created', 'updated', 'custom']
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{t('saved')}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        <div className="dfilters">
          <div className="dfrow">
            <span className="dflabel">{t('sort')}</span>
            <div className="seg">
              {modes.map((m) => (
                <button key={m} className={sort === m ? 'on' : ''} onClick={() => onSort(m)}>
                  {t(`sort_${m}` as 'sort_book')}
                </button>
              ))}
            </div>
          </div>
          <div className="dfrow">
            <button
              className="mini"
              disabled={sort === 'custom'}
              onClick={() => onAsc(!asc)}
              title={asc ? t('ascending') : t('descending')}
            >
              {asc ? '↑' : '↓'} {asc ? t('ascending') : t('descending')}
            </button>
            <label className="dcheck">
              <input type="checkbox" checked={thisBook} onChange={(e) => onThisBook(e.target.checked)} />
              <span>{t('this_book')}</span>
            </label>
          </div>
          {tags.length > 0 && (
            <div className="dfrow tagrow">
              <span className="dflabel">{t('tags')}</span>
              <div className="chips">
                {tags.map((tag) =>
                  editTags ? (
                    // In edit mode a chip deletes the tag everywhere, which is how a
                    // misspelling gets fixed without opening each note.
                    <span key={tag} className="chip on">
                      {tag}
                      <button className="chipx" onClick={() => onDeleteTag(tag)} aria-label={`${t('delete')}: ${tag}`}>
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      key={tag}
                      className={`chip ${tagFilter.includes(tag) ? 'on' : ''}`}
                      onClick={() => onToggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ),
                )}
              </div>
              <button
                className={`mini tagedit-toggle ${editTags ? 'on' : ''}`}
                onClick={() => setEditTags(!editTags)}
              >
                {editTags ? t('save') : t('manage_tags')}
              </button>
            </div>
          )}
        </div>

        {!hasAny ? (
          <p className="empty">{t('saved_empty')}</p>
        ) : items.length === 0 ? (
          <p className="empty">{t('no_matches')}</p>
        ) : (
          <ul className="dlist">
            {items.map((it, i) => (
              <li key={it.ref}>
                {sort === 'custom' && (
                  <div className="dmove">
                    <button className="mini" disabled={i === 0} onClick={() => onMove(it.ref, -1)} aria-label={t('move_up')}>↑</button>
                    <button className="mini" disabled={i === items.length - 1} onClick={() => onMove(it.ref, 1)} aria-label={t('move_down')}>↓</button>
                  </div>
                )}
                <button className="dref" onClick={() => onJump(it.ref)}>
                  <span className="dlabel">
                    {it.label}
                    {it.colors.map((c, k) => (
                      <span key={k} className={`dot sw-${c}`} />
                    ))}
                    {it.note && <span className="dtag">✎</span>}
                  </span>
                  {it.note && <span className="dnote">{it.note}</span>}
                  {it.tags.length > 0 && (
                    <span className="chips small">
                      {it.tags.map((tag) => (
                        <span key={tag} className="chip static">{tag}</span>
                      ))}
                    </span>
                  )}
                  <span className="dmeta">
                    {t('updated')} {fmtDate(it.updatedAt, ui, t('unknown'))}
                  </span>
                </button>
                <button className="icon del" title={t('delete')} onClick={() => onDelete(it.ref)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}

/* ------------------------------ Note editor ---------------------------- */
export function NoteEditor({
  label,
  value,
  tags,
  knownTags,
  createdAt,
  updatedAt,
  t,
  ui,
  onSave,
  onDelete,
  onClose,
}: {
  label: string
  value: string
  tags: string[]
  /** Every tag already in use, offered as autocomplete. */
  knownTags: string[]
  createdAt?: number
  updatedAt?: number
  t: T
  ui: Lang
  onSave: (text: string, tags: string[]) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(value)
  const [list, setList] = useState<string[]>(tags)
  const [draft, setDraft] = useState('')
  useEffect(() => setText(value), [value])
  useEffect(() => setList(tags), [tags])

  // Commit whatever is typed: "study, prayer" enters as two tags, and duplicates
  // are ignored rather than rejected.
  const addTag = () => {
    const fresh = parseTags(draft).filter((x) => !list.includes(x))
    if (fresh.length) setList([...list, ...fresh])
    setDraft('')
  }
  const saved = useMemo(() => createdAt || updatedAt, [createdAt, updatedAt])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet note" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{label}</b>
          <button className="icon" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <textarea
          className="notearea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('note_placeholder')}
          autoFocus
        />
        <div className="tagedit">
          {/* Every tag in use is shown here: the ones on this note are lit, the rest
              are dimmed. Clicking toggles, so tagging is usually a tap and the field
              below is only needed to coin a new one. */}
          <div className="chips">
            {list.map((tag) => (
              <button key={tag} className="chip on" onClick={() => setList(list.filter((x) => x !== tag))}>
                {tag}
                <span className="chipx" aria-hidden="true">✕</span>
              </button>
            ))}
            {knownTags
              .filter((x) => !list.includes(x))
              .map((tag) => (
                <button key={tag} className="chip dim" onClick={() => setList([...list, tag])}>
                  {tag}
                </button>
              ))}
          </div>
          <input
            className="taginput"
            value={draft}
            placeholder={t('add_tag')}
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              // A trailing comma commits, so "study, prayer" enters as two tags.
              if (v.endsWith(',')) setTimeout(addTag, 0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            onBlur={addTag}
          />
        </div>
        {saved && (
          <p className="dmeta">
            {t('created')} {fmtDate(createdAt, ui, t('unknown'))} · {t('updated')}{' '}
            {fmtDate(updatedAt, ui, t('unknown'))}
          </p>
        )}
        <div className="noteact">
          <button className="ghost" onClick={onDelete}>{t('delete')}</button>
          <span className="spacer" />
          <button className="primary" onClick={() => onSave(text, list)}>{t('save')}</button>
        </div>
      </div>
    </div>
  )
}
