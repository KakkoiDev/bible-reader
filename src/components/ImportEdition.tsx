import { useEffect, useRef, useState } from 'react'
import { loadCanon, osisIndex, type CanonBook } from '../lib/canon'
import { importedId, listImported, saveImported, type ImportedMeta } from '../lib/imported'
import { OsisError, parseOsis, type ParsedOsis } from '../lib/osis'
import type { EditionBook } from '../lib/types'
import type { T } from '../lib/i18n'
import { BY_ID, type Lang } from '../lib/versions'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/**
 * Add an edition from a file the reader supplies.
 *
 * Three steps, and the middle one is the point: pick a file, **read back what was
 * actually found in it**, then name it and say where it came from. A reader adding a
 * Bible is trusting a file they downloaded from somewhere, and an importer that says
 * only "done" leaves them with no way to tell a complete text from one whose last
 * eleven books the exporter dropped. So the sheet reports books, chapters, verses and
 * anything it could not place, before anything is saved.
 *
 * The attribution line is required rather than optional. Every shipped edition
 * carries one and the licences sheet lists them all; an imported edition with no
 * provenance would be the only text in the app that could not say what it is.
 */

type Stage = 'pick' | 'reading' | 'found' | 'saving'

export function ImportEdition({
  open,
  t,
  onClose,
  onImported,
}: {
  open: boolean
  t: T
  onClose: () => void
  /** The new edition, once it is on the device. The caller registers it and shows it. */
  onImported: (meta: ImportedMeta) => void
}) {
  const [stage, setStage] = useState<Stage>('pick')
  const [parsed, setParsed] = useState<ParsedOsis | null>(null)
  const [canon, setCanon] = useState<CanonBook[]>([])
  const [label, setLabel] = useState('')
  const [edition, setEdition] = useState('')
  const [attribution, setAttribution] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)

  useEffect(() => {
    if (open) loadCanon().then(setCanon)
  }, [open])
  useEffect(() => {
    if (open) return
    setStage('pick')
    setParsed(null)
    setLabel('')
    setEdition('')
    setAttribution('')
    setError(null)
    fileRef.current = null
  }, [open])

  if (!open) return null

  const read = async (file: File) => {
    fileRef.current = file
    setError(null)
    setStage('reading')
    try {
      const xml = await file.text()
      const got = parseOsis(xml, osisIndex(canon.length ? canon : await loadCanon()))
      setParsed(got)
      // Seed the fields from the file's own header, which the reader can overwrite.
      setLabel(got.title?.slice(0, 60) ?? '')
      setEdition(file.name.replace(/\.[^.]+$/, '').slice(0, 24))
      setAttribution(got.rights?.slice(0, 400) ?? '')
      setStage('found')
    } catch (e) {
      setError(e instanceof OsisError ? e.message : 'unreadable')
      setStage('pick')
    }
  }

  const save = async () => {
    if (!parsed) return
    setStage('saving')
    const bySlug = new Map(canon.map((b) => [b.en, b]))
    const books: { slug: string; book: EditionBook }[] = []
    const chapters: Record<string, number[]> = {}
    const names: string[] = []
    for (const b of parsed.books) {
      const cb = bySlug.get(b.en)
      if (!cb) continue
      books.push({ slug: cb.slug, book: { chapters: b.chapters } })
      names.push(b.en)
      // Verse ceiling per chapter, indexed from chapter 1 — the shape index.json uses.
      const last = Math.max(...b.chapters.map((c) => c.n))
      const counts = Array.from({ length: last }, () => 0)
      for (const c of b.chapters) counts[c.n - 1] = Math.max(...c.verses.map((v) => v.v))
      chapters[cb.slug] = counts
    }
    const taken = new Set<string>([...Object.keys(BY_ID), ...listImported().map((m) => m.id)])
    const id: Lang = importedId(label || edition || 'edition', taken)
    const meta: ImportedMeta = {
      id,
      label: label.trim() || t('import_untitled'),
      edition: edition.trim() || t('import_untitled'),
      fullName: `${label.trim() || t('import_untitled')} — ${edition.trim()}`.replace(/ — $/, ''),
      htmlLang: (parsed.language || 'und').slice(0, 12),
      // An RTL import declares itself through its language tag; there is no other
      // signal in an OSIS file, and guessing from the script would be worse.
      dir: /^(he|ar|fa|ur|yi|arc|syr)\b/i.test(parsed.language ?? '') ? 'rtl' : 'ltr',
      speech: (parsed.language || 'und').slice(0, 12),
      // Imported text is stored as it was read. The two markup conventions in this
      // app are properties of editions it ships, not of OSIS.
      markup: 'plain',
      coverage: 'all',
      defaultOn: false,
      uiAvailable: false,
      attribution: attribution.trim(),
      books: names,
      chapters,
      addedAt: Date.now(),
    }
    try {
      await saveImported(meta, books)
      onImported(meta)
      onClose()
    } catch {
      setError('storage')
      setStage('found')
    }
  }

  const placed = parsed ? parsed.books.filter((b) => canon.some((c) => c.en === b.en)) : []
  const chapterCount = placed.reduce((n, b) => n + b.chapters.length, 0)
  const ready = !!parsed && !!label.trim() && !!attribution.trim() && stage === 'found'

  return (
    <Sheet
      variant="import"
      onClose={onClose}
      closeLabel={t('close')}
      title={t('import_title')}
      footer={
        stage === 'found' || stage === 'saving' ? (
          <>
            <span className="spacer" />
            <button className="primary" disabled={!ready} onClick={save}>
              {stage === 'saving' ? t('import_saving') : t('import_save')}
            </button>
          </>
        ) : undefined
      }
    >
      <p className="empty">{t('import_body')}</p>

      {stage === 'pick' && (
        <>
          <label className="mini importpick">
            <Icon name="download" size={16} /> {t('import_choose')}
            <input
              type="file"
              accept=".xml,.osis,application/xml,text/xml"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void read(f)
              }}
            />
          </label>
          {error && <p className="importerr">{t(`import_err_${error}` as 'import_err_unreadable')}</p>}
        </>
      )}

      {stage === 'reading' && (
        <p className="empty loadrow">
          <span className="spin" aria-hidden="true" />
          {t('import_reading')}
        </p>
      )}

      {parsed && (stage === 'found' || stage === 'saving') && (
        <>
          {/* What was actually in the file, before anything is saved. */}
          <h3 className="sgroup">{t('import_found')}</h3>
          <p className="importstat">
            {t('import_counts', {
              books: String(placed.length),
              chapters: String(chapterCount),
              verses: String(parsed.verses),
            })}
          </p>
          <p className="importbooks">{placed.map((b) => b.en).join(' · ')}</p>
          {parsed.skipped.length > 0 && (
            <p className="importerr">{t('import_skipped', { ids: parsed.skipped.join(', ') })}</p>
          )}

          <h3 className="sgroup">{t('import_naming')}</h3>
          <label className="srow">
            <span>{t('import_label')}</span>
            <input className="ptext" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="srow">
            <span>{t('import_edition')}</span>
            <input className="ptext" value={edition} maxLength={24} onChange={(e) => setEdition(e.target.value)} />
          </label>
          <div className="srow importattrib">
            <span>{t('import_attribution')}</span>
            <textarea
              className="notearea importnote"
              value={attribution}
              maxLength={400}
              placeholder={t('import_attribution_hint')}
              onChange={(e) => setAttribution(e.target.value)}
            />
          </div>
          {!ready && stage === 'found' && <p className="empty">{t('import_needs')}</p>}
          {error === 'storage' && <p className="importerr">{t('import_err_storage')}</p>}
        </>
      )}
    </Sheet>
  )
}
