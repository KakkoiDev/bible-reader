// Tiny ZIP reader for the eBible.org USFM archives, so `npm run fetch` needs no
// external `unzip` binary. Reads the central directory and inflates each entry.
import { inflateRawSync } from 'node:zlib'

/**
 * @param {Buffer} buf a whole .zip file
 * @returns {Map<string, Buffer>} entry name → contents (directories omitted)
 */
export function unzip(buf) {
  // End of central directory: signature 0x06054b50, scanned from the tail
  // because the record is followed by a variable-length comment.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)')

  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  const out = new Map()

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`bad central directory entry at ${at}`)
    const method = buf.readUInt16LE(at + 10)
    const compressedSize = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const localAt = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue

    // Re-read the name/extra lengths from the local header — they can differ.
    if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const lNameLen = buf.readUInt16LE(localAt + 26)
    const lExtraLen = buf.readUInt16LE(localAt + 28)
    const start = localAt + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compressedSize)

    if (method === 0) out.set(name, Buffer.from(raw))
    else if (method === 8) out.set(name, inflateRawSync(raw))
    else throw new Error(`${name}: unsupported compression method ${method}`)
  }
  return out
}
