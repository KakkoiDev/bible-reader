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

/** Annotation toolbar: floats over the selection on desktop, docks to a bottom
 *  bar on mobile (so it never collides with the OS copy/paste menu). */
export function Toolbar({
  rect,
  dock,
  hasHL,
  onColor,
  onNote,
  onClear,
}: {
  rect: DOMRect
  dock: 'float' | 'bottom'
  hasHL: boolean
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
          aria-label={`Highlight ${c}`}
          onClick={() => onColor(c)}
        />
      ))}
      <span className="asep" />
      <button className="abtn" onClick={onNote} title="Add note">✎</button>
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
  voice,
  swipe,
  flow,
  ttsOn,
  onTheme,
  onSize,
  onFurigana,
  onRate,
  onVoice,
  onSwipe,
  onFlow,
  onExport,
  onImport,
  onClose,
}: {
  open: boolean
  theme: Theme
  size: Size
  furigana: boolean
  rate: number
  voice: 'male' | 'female'
  swipe: boolean
  flow: boolean
  ttsOn: boolean
  onTheme: (t: Theme) => void
  onSize: (s: Size) => void
  onFurigana: (f: boolean) => void
  onRate: (r: number) => void
  onVoice: (g: 'male' | 'female') => void
  onSwipe: (v: boolean) => void
  onFlow: (v: boolean) => void
  onExport: () => void
  onImport: (file: File) => void
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
          <span>Flowing text (no verse numbers)</span>
          <input type="checkbox" checked={flow} onChange={(e) => onFlow(e.target.checked)} />
        </label>
        <label className="srow">
          <span>Furigana (日本語)</span>
          <input type="checkbox" checked={furigana} onChange={(e) => onFurigana(e.target.checked)} />
        </label>
        <label className="srow">
          <span>Swipe to change language (mobile)</span>
          <input type="checkbox" checked={swipe} onChange={(e) => onSwipe(e.target.checked)} />
        </label>
        <div className="srow">
          <span>Notes &amp; highlights</span>
          <div className="databtns">
            <button className="mini" onClick={onExport}>Export</button>
            <label className="mini asbtn">
              Import
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
            <div className="srow">
              <span>Audio voice</span>
              <div className="seg">
                {(['male', 'female'] as const).map((g) => (
                  <button key={g} className={voice === g ? 'on' : ''} onClick={() => onVoice(g)}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
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
          </>
        )}
      </div>
    </div>
  )
}

export interface DrawerItem {
  ref: string
  label: string
  note?: string
  colors: HColor[]
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
          <b>Saved</b>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {items.length === 0 ? (
          <p className="empty">Nothing saved yet. Highlight text or add a note to a verse.</p>
        ) : (
          <ul className="dlist">
            {items.map((it) => (
              <li key={it.ref}>
                <button className="dref" onClick={() => onJump(it.ref)}>
                  <span className="dlabel">
                    {it.label}
                    {it.colors.map((c, i) => (
                      <span key={i} className={`dot sw-${c}`} />
                    ))}
                    {it.note && <span className="dtag">✎</span>}
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
  onSave,
  onDelete,
  onClose,
}: {
  label: string
  value: string
  onSave: (text: string) => void
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
          <button className="ghost" onClick={onDelete}>Delete</button>
          <span className="spacer" />
          <button className="primary" onClick={() => onSave(text)}>Save</button>
        </div>
      </div>
    </div>
  )
}
