import { useEffect, useState } from 'react'
import { COLORS, type HColor } from '../lib/annotations'

export type Theme = 'system' | 'light' | 'dark'
export type Size = 'sm' | 'md' | 'lg'

const COLOR_LABEL: Record<HColor, string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
}

/** Floating toolbar shown over a text selection. */
export function Toolbar({
  rect,
  bookmarked,
  hasHL,
  onColor,
  onNote,
  onBookmark,
  onClear,
}: {
  rect: DOMRect
  bookmarked: boolean
  hasHL: boolean
  onColor: (c: HColor) => void
  onNote: () => void
  onBookmark: () => void
  onClear: () => void
}) {
  const top = Math.max(8, rect.top - 50)
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 132), window.innerWidth - 272)
  return (
    <div className="atoolbar" style={{ top, left }} onMouseDown={(e) => e.preventDefault()}>
      {COLORS.map((c) => (
        <button
          key={c}
          className={`swatch sw-${c}`}
          title={COLOR_LABEL[c]}
          aria-label={`Highlight ${c}`}
          onClick={() => onColor(c)}
        />
      ))}
      <span className="asep" />
      <button className="abtn" onClick={onNote} title="Add note">✎</button>
      <button className={`abtn ${bookmarked ? 'on' : ''}`} onClick={onBookmark} title="Bookmark">
        🔖
      </button>
      {hasHL && (
        <button className="abtn" onClick={onClear} title="Remove highlight">
          ⌫
        </button>
      )}
    </div>
  )
}

export function Settings({
  open,
  theme,
  size,
  furigana,
  rate,
  ttsOn,
  onTheme,
  onSize,
  onFurigana,
  onRate,
  onClose,
}: {
  open: boolean
  theme: Theme
  size: Size
  furigana: boolean
  rate: number
  ttsOn: boolean
  onTheme: (t: Theme) => void
  onSize: (s: Size) => void
  onFurigana: (f: boolean) => void
  onRate: (r: number) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>Settings</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="srow">
          <span>Theme</span>
          <div className="seg">
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => onTheme(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="srow">
          <span>Font size</span>
          <div className="seg">
            {(['sm', 'md', 'lg'] as Size[]).map((s) => (
              <button key={s} className={size === s ? 'on' : ''} onClick={() => onSize(s)}>
                {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
        <label className="srow">
          <span>Furigana (日本語)</span>
          <input type="checkbox" checked={furigana} onChange={(e) => onFurigana(e.target.checked)} />
        </label>
        {ttsOn && (
          <div className="srow">
            <span>Audio speed</span>
            <div className="seg">
              {([0.75, 1, 1.25] as number[]).map((r) => (
                <button key={r} className={rate === r ? 'on' : ''} onClick={() => onRate(r)}>
                  {r}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export interface DrawerItem {
  ref: string
  label: string
  note?: string
  bookmark?: boolean
}
export function Drawer({
  open,
  items,
  onJump,
  onDelete,
  onClose,
}: {
  open: boolean
  items: DrawerItem[]
  onJump: (ref: string) => void
  onDelete: (ref: string) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>Bookmarks &amp; notes</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {items.length === 0 ? (
          <p className="empty">
            Nothing saved yet. Select text to highlight or add a note, or bookmark a verse.
          </p>
        ) : (
          <ul className="dlist">
            {items.map((it) => (
              <li key={it.ref}>
                <button className="dref" onClick={() => onJump(it.ref)}>
                  <span className="dlabel">
                    {it.bookmark ? '🔖 ' : ''}
                    {it.label}
                  </span>
                  {it.note && <span className="dnote">{it.note}</span>}
                </button>
                <button className="icon del" title="Delete" onClick={() => onDelete(it.ref)}>
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

export function NoteEditor({
  label,
  value,
  bookmarked,
  onSave,
  onToggleBookmark,
  onDelete,
  onClose,
}: {
  label: string
  value: string
  bookmarked: boolean
  onSave: (text: string) => void
  onToggleBookmark: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet note" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{label}</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <textarea
          className="notearea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a note…"
          autoFocus
        />
        <div className="noteact">
          <button className={`abtn wide ${bookmarked ? 'on' : ''}`} onClick={onToggleBookmark}>
            🔖 {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          <span className="spacer" />
          <button className="ghost" onClick={onDelete}>Delete</button>
          <button className="primary" onClick={() => onSave(text)}>Save</button>
        </div>
      </div>
    </div>
  )
}
