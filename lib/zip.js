/**
 * Minimal ZIP reader for Office Open XML containers (docx/xlsx/pptx).
 *
 * Reads the end-of-central-directory record, walks the central directory, and
 * inflates each entry with node:zlib. Stored and deflated entries are supported,
 * as are ZIP64 sizes for very large packages. Nothing is written to disk.
 */
import zlib from 'node:zlib'

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

function findEocd (buf) {
  const min = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

/** Read ZIP64 extended information from a central-directory extra field. */
function zip64Extra (buf, extraStart, extraLen, want) {
  let p = extraStart
  const end = extraStart + extraLen
  while (p + 4 <= end) {
    const id = buf.readUInt16LE(p)
    const len = buf.readUInt16LE(p + 2)
    if (id === 0x0001) {
      let q = p + 4
      const values = {}
      if (want.uncompressed && q + 8 <= p + 4 + len) { values.uncompressed = Number(buf.readBigUInt64LE(q)); q += 8 }
      if (want.compressed && q + 8 <= p + 4 + len) { values.compressed = Number(buf.readBigUInt64LE(q)); q += 8 }
      if (want.offset && q + 8 <= p + 4 + len) { values.offset = Number(buf.readBigUInt64LE(q)); q += 8 }
      return values
    }
    p += 4 + len
  }
  return {}
}

/**
 * Read a ZIP archive into a `Map<entryName, Buffer>`.
 * Directory entries are skipped. Unsupported compression is skipped too.
 */
export function readZip (buf) {
  const files = new Map()
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('不是有效的 ZIP/OOXML 文件（未找到目录末尾记录）')
  let count = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff) {
    // ZIP64 end of central directory locator sits 20 bytes before the EOCD.
    const locator = eocd - 20
    if (locator >= 0 && buf.readUInt32LE(locator) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(locator + 8))
      if (z64 >= 0 && z64 + 56 <= buf.length && buf.readUInt32LE(z64) === 0x06064b50) {
        count = Number(buf.readBigUInt64LE(z64 + 32))
        cdOffset = Number(buf.readBigUInt64LE(z64 + 48))
      }
    }
  }
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) break
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const uncompressedSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8')
    let sizes = { compressed: compressedSize, uncompressed: uncompressedSize, offset: localOffset }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      const z = zip64Extra(buf, p + 46 + nameLen, extraLen, {
        compressed: compressedSize === 0xffffffff,
        uncompressed: uncompressedSize === 0xffffffff,
        offset: localOffset === 0xffffffff,
      })
      sizes = {
        compressed: z.compressed ?? compressedSize,
        uncompressed: z.uncompressed ?? uncompressedSize,
        offset: z.offset ?? localOffset,
      }
    }
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (sizes.offset + 30 > buf.length || buf.readUInt32LE(sizes.offset) !== SIG_LOCAL) continue
    const lNameLen = buf.readUInt16LE(sizes.offset + 26)
    const lExtraLen = buf.readUInt16LE(sizes.offset + 28)
    const dataStart = sizes.offset + 30 + lNameLen + lExtraLen
    const data = buf.slice(dataStart, dataStart + sizes.compressed)
    try {
      if (method === 0) files.set(name, data)
      else if (method === 8) files.set(name, zlib.inflateRawSync(data))
    } catch {
      // A corrupt member must not abort the whole document.
    }
  }
  return files
}

/** Convenience: read one entry as UTF-8 text, or undefined. */
export function readZipText (files, name) {
  const entry = files.get(name)
  return entry === undefined ? undefined : entry.toString('utf8')
}
