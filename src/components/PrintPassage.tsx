import { vref, type Store } from '../lib/annotations'
import { VerseText } from '../lib/format'
import type { Chapter } from '../lib/types'
import { BY_ID, coversBook, type Lang } from '../lib/versions'

/** Print engines fragment tables reliably and repeat their headers, unlike the
 * interactive parallel grid. This view never appears on screen. */
export function PrintPassage({ title, chapter, slug, chapterNumber, bookIndex, columns, store, furigana }: {
  title: string
  chapter: Chapter | null
  slug: string
  chapterNumber: number
  bookIndex: number
  columns: Lang[]
  store: Store
  furigana: boolean
}) {
  if (!chapter) return null
  const visible = columns.filter((lang) => coversBook(lang, bookIndex))
  return (
    <section className="print-passage" aria-hidden="true">
      <h1>{title} {chapterNumber}</h1>
      <table>
        <thead><tr>
          <th className="print-vn" scope="col">#</th>
          {visible.map((lang) => {
            const meta = BY_ID[lang]
            return <th key={lang} scope="col" lang={meta.htmlLang} dir={meta.dir}>{meta.label} · {meta.edition}</th>
          })}
        </tr></thead>
        <tbody>
          {chapter.verses.map((verse) => (
            <tr key={verse.v}>
              <th className="print-vn" scope="row">{verse.v}</th>
              {visible.map((lang) => {
                const meta = BY_ID[lang]
                const text = verse.text[lang]
                const highlights = store[vref(slug, chapterNumber, verse.v)]?.highlights?.filter((h) => h.lang === lang)
                return <td key={lang} lang={meta.htmlLang} dir={meta.dir}>
                  {text ? <VerseText text={text} lang={lang} showFurigana={furigana} highlights={highlights} /> : <span className="print-gap">—</span>}
                </td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
