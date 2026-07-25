// Invite links: a shareable URL that carries not just a passage but the sender's
// reading setup — which editions are visible, in what order, and which one to read.
//
// Encoded as base64url under the hash so it survives copy/paste and static hosting:
//   #/i/<payload>   payload = { c: [editions], l: reading edition, s: slug, ch, v? }
//
// Applying one changes the recipient's settings, so App.tsx always asks first.
import { isLang, type Lang } from './versions'

export interface Invite {
  columns: Lang[]
  lang: Lang
  slug: string
  chapter: number
  verse?: number
}

const toB64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeInvite(i: Invite): string {
  const payload: Record<string, unknown> = { c: i.columns, l: i.lang, s: i.slug, ch: i.chapter }
  if (i.verse) payload.v = i.verse
  return toB64Url(JSON.stringify(payload))
}

export function decodeInvite(encoded: string): Invite | null {
  try {
    const p = JSON.parse(fromB64Url(encoded))
    const columns = Array.isArray(p.c) ? (p.c.filter(isLang) as Lang[]) : []
    const lang = isLang(p.l) ? p.l : columns[0]
    const chapter = Number(p.ch)
    if (!columns.length || !lang || typeof p.s !== 'string' || !p.s || !Number.isFinite(chapter)) return null
    const verse = Number(p.v)
    return {
      columns: [...new Set(columns)],
      // The reading edition must be one of the offered columns.
      lang: columns.includes(lang) ? lang : columns[0],
      slug: p.s,
      chapter,
      verse: Number.isFinite(verse) && verse > 0 ? verse : undefined,
    }
  } catch {
    return null
  }
}

export const inviteUrl = (i: Invite) =>
  `${location.origin}${location.pathname}#/i/${encodeInvite(i)}`
