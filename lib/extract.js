/**
 * Material extraction: turn a clinical-record file into plain text the model can
 * read. Modern Office formats are parsed natively; PDF uses the bundled
 * pdfjs-dist, with an optional local poppler/mutool fast path.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseXml, findAll, find, textOf } from './xml.js'
import { readZip, readZipText } from './zip.js'

const run = promisify(execFile)

/** Formats the workbench accepts, with their display labels. */
export const FORMATS = {
  '.xlsx': 'Excel 工作簿',
  '.docx': 'Word 文档',
  '.pdf': 'PDF 文档',
  '.csv': 'CSV 表格',
  '.md': 'Markdown 文档',
  '.markdown': 'Markdown 文档',
  '.txt': '文本',
  '.text': '文本',
  '.doc': 'Word 97-2003（解析不支持）',
  '.xls': 'Excel 97-2003（解析不支持）',
}
export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS)

const MAX_SHEET_ROWS = 4000
const MAX_SHEET_COLS = 60
const MAX_CELL = 300
const MAX_CSV_ROWS = 4000
const MAX_PDF_BYTES = 120 * 1024 * 1024

let pdfjsCache = null
const toolPathCache = new Map()

/** Lower-case extension with its dot, or '' when the name has none. */
export function extensionOf (name) {
  const ext = path.extname(String(name || '')).toLowerCase()
  return ext === '.markdown' ? '.md' : ext
}

/** Decode bytes as text, honouring BOMs and falling back to GB18030. */
export function decodeBytes (buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3))
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2))
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {}
  try {
    return new TextDecoder('gb18030').decode(buf)
  } catch {}
  return new TextDecoder('utf-8').decode(buf)
}

function cleanCell (value) {
  const text = String(value ?? '').replace(/\r/g, ' ').replace(/\t/g, ' ').replace(/\n+/g, ' ⏎ ').trim()
  return text.length > MAX_CELL ? text.slice(0, MAX_CELL) + '…' : text
}

function rowsToTsv (rows, maxCols = MAX_SHEET_COLS) {
  const lines = []
  for (const row of rows) {
    const cells = row.slice(0, maxCols).map(cleanCell)
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// SpreadsheetML (xlsx)
// ---------------------------------------------------------------------------

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
])

function isDateFormatCode (code) {
  if (!code) return false
  let stripped = String(code)
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
  return /[ymdhs]/i.test(stripped) && !/^general$/i.test(stripped.trim())
}

function pad2 (n) {
  return n < 10 ? `0${n}` : String(n)
}

function excelSerialToText (serial, dateOnly) {
  if (!Number.isFinite(serial)) return String(serial)
  const ms = serial * 86_400_000
  let out
  if (serial >= 1) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(ms))
    out = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
    const seconds = Math.round((serial % 1) * 86_400)
    if (!dateOnly && seconds > 0) {
      const hh = Math.floor(seconds / 3600)
      const mm = Math.floor((seconds % 3600) / 60)
      const ss = seconds % 60
      out += ` ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
    }
  } else {
    const seconds = Math.round(ms / 1000)
    out = `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor((seconds % 3600) / 60))}:${pad2(seconds % 60)}`
  }
  return out
}

function readSharedStrings (files) {
  const xml = readZipText(files, 'xl/sharedStrings.xml')
  if (xml === undefined) return []
  const tree = parseXml(xml)
  const out = []
  const collect = (node, acc) => {
    for (const child of node.children) {
      if (typeof child === 'string') { acc.push(child); continue }
      if (child.tag === 'rPh') continue
      collect(child, acc)
    }
    return acc
  }
  const visit = (node) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue
      if (child.tag === 'si') out.push(collect(child, []).join(''))
      else visit(child)
    }
  }
  visit(tree)
  return out
}

function readDateStyles (files) {
  const xml = readZipText(files, 'xl/styles.xml')
  if (xml === undefined) return { perXf: [] }
  const tree = parseXml(xml)
  const custom = new Map()
  const numFmts = find(tree, 'numFmts')
  if (numFmts !== undefined) {
    for (const node of numFmts.children) {
      if (typeof node === 'string' || node.tag !== 'numFmt') continue
      custom.set(Number(node.attrs.numFmtId), node.attrs.formatCode)
    }
  }
  const perXf = []
  const cellXfs = find(tree, 'cellXfs')
  if (cellXfs !== undefined) {
    for (const node of cellXfs.children) {
      if (typeof node === 'string' || node.tag !== 'xf') continue
      const id = Number(node.attrs.numFmtId ?? 0)
      const builtinDate = BUILTIN_DATE_FORMATS.has(id)
      const code = custom.get(id)
      const date = builtinDate || isDateFormatCode(code)
      const hasTime = builtinDate
        ? (id >= 18 && id <= 22) || (id >= 45 && id <= 47)
        : /[hs]/i.test(String(code || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, ''))
      perXf.push({ date, dateOnly: date && !hasTime })
    }
  }
  return { perXf }
}

function columnIndex (ref) {
  const match = /^([A-Za-z]+)/.exec(ref || '')
  if (!match) return 0
  let index = 0
  for (const ch of match[1].toUpperCase()) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

function sheetTargets (files) {
  const workbook = readZipText(files, 'xl/workbook.xml')
  const relsXml = readZipText(files, 'xl/_rels/workbook.xml.rels')
  const relMap = new Map()
  if (relsXml !== undefined) {
    for (const rel of findAll(parseXml(relsXml), 'Relationship')) {
      let target = rel.attrs.Target || ''
      target = target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`)
      relMap.set(rel.attrs.Id, target)
    }
  }
  const targets = []
  if (workbook !== undefined) {
    const sheets = findAll(parseXml(workbook), 'sheet')
    sheets.forEach((sheet, i) => {
      const rid = sheet.attrs['r:id'] || Object.entries(sheet.attrs).find(([k]) => k.endsWith(':id'))?.[1]
      const target = relMap.get(rid)
      targets.push({ name: sheet.attrs.name || `Sheet${i + 1}`, path: target })
    })
  }
  if (targets.length === 0 || targets.every(t => t.path === undefined)) {
    const names = [...files.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
    return names.map((p, i) => ({ name: `Sheet${i + 1}`, path: p }))
  }
  return targets.filter(t => t.path !== undefined && files.has(t.path))
}

function readSheetRows (xml, shared, styles) {
  const tree = parseXml(xml)
  const rows = []
  const sheetData = find(tree, 'sheetData') || tree
  const visitRows = (node) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue
      if (child.tag === 'row') rows.push(child)
      else visitRows(child)
    }
  }
  visitRows(sheetData)
  const out = []
  for (const row of rows) {
    const cells = []
    for (const cell of row.children) {
      if (typeof cell === 'string' || cell.tag !== 'c') continue
      const index = columnIndex(cell.attrs.r)
      const type = cell.attrs.t
      let value = ''
      const v = find(cell, 'v')
      const is = find(cell, 'is')
      if (type === 's') {
        const i = Number(v ? textOf(v) : '')
        value = shared[i] ?? ''
      } else if (type === 'inlineStr') {
        value = is !== undefined ? textOf(is) : (v ? textOf(v) : '')
      } else if (type === 'b') {
        value = v && textOf(v) === '1' ? '是' : '否'
      } else if (type === 'str' || type === 'e') {
        value = v ? textOf(v) : ''
      } else if (type === 'd') {
        value = v ? textOf(v) : ''
      } else {
        const raw = v ? textOf(v) : ''
        const style = styles.perXf[Number(cell.attrs.s ?? -1)]
        if (raw !== '' && style?.date && /^-?\d+(\.\d+)?$/.test(raw)) {
          value = excelSerialToText(Number(raw), style.dateOnly)
        } else {
          value = raw
        }
      }
      cells[index] = value
    }
    out.push(Array.from(cells, v => (v === undefined ? '' : v)))
    if (out.length >= MAX_SHEET_ROWS + 1) break
  }
  return out
}

async function extractXlsx (absPath) {
  const buf = await fs.readFile(absPath)
  const files = readZip(buf)
  const shared = readSharedStrings(files)
  const styles = readDateStyles(files)
  const targets = sheetTargets(files)
  if (targets.length === 0) throw new Error('工作簿中没有可读取的工作表')
  const warnings = []
  const blocks = []
  for (const target of targets) {
    const xml = readZipText(files, target.path)
    if (xml === undefined) continue
    const rows = readSheetRows(xml, shared, styles)
    const truncated = rows.length > MAX_SHEET_ROWS
    const body = rowsToTsv(rows.slice(0, MAX_SHEET_ROWS))
    blocks.push(`【工作表：${target.name}】（${Math.min(rows.length, MAX_SHEET_ROWS)} 行${truncated ? '，已截断' : ''}）\n${body}`)
    if (truncated) warnings.push(`工作表「${target.name}」超过 ${MAX_SHEET_ROWS} 行，已截断`)
  }
  return { text: blocks.join('\n\n'), format: 'xlsx', warnings }
}

// ---------------------------------------------------------------------------
// WordprocessingML (docx)
// ---------------------------------------------------------------------------

function paragraphText (node) {
  let out = ''
  const walk = (n) => {
    for (const child of n.children) {
      if (typeof child === 'string') { out += child; continue }
      switch (child.tag) {
        case 'w:t': out += textOf(child); break
        case 'w:tab': out += '\t'; break
        case 'w:br':
        case 'w:cr': out += '\n'; break
        case 'w:instrText':
        case 'w:delText': break
        case 'w:drawing':
        case 'w:pict': out += '［图片］'; break
        case 'w:object': out += '［嵌入对象］'; break
        default: walk(child)
      }
    }
  }
  walk(node)
  return out
}

function tableRows (node) {
  const rows = []
  const visit = (n) => {
    for (const child of n.children) {
      if (typeof child === 'string') continue
      if (child.tag === 'w:tr') {
        const cells = []
        for (const cell of child.children) {
          if (typeof cell === 'string' || cell.tag !== 'w:tc') continue
          const parts = []
          for (const p of cell.children) {
            if (typeof p === 'string' || p.tag !== 'w:p') continue
            const text = paragraphText(p).replace(/\s+/g, ' ').trim()
            if (text) parts.push(text)
          }
          cells.push(parts.join(' / ').replace(/\t/g, ' '))
        }
        rows.push(cells)
      } else {
        visit(child)
      }
    }
  }
  visit(node)
  return rows
}

async function extractDocx (absPath) {
  const buf = await fs.readFile(absPath)
  const files = readZip(buf)
  const xml = readZipText(files, 'word/document.xml')
  if (xml === undefined) throw new Error('Word 文档缺少正文部件（word/document.xml）')
  const tree = parseXml(xml)
  const body = find(tree, 'w:body') || tree
  const lines = []
  const walk = (node) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue
      switch (child.tag) {
        case 'w:p': {
          const text = paragraphText(child).replace(/[ \t]+\n/g, '\n').trimEnd()
          if (text.trim()) lines.push(text)
          break
        }
        case 'w:tbl': {
          const rows = tableRows(child)
          if (rows.length > 0) {
            lines.push(rows.map(cells => `| ${cells.join(' | ')} |`).join('\n'))
          }
          break
        }
        case 'w:sdt':
        case 'w:sdtContent':
        case 'w:customXml':
        case 'w:ins':
          walk(child)
          break
        default:
          break
      }
    }
  }
  walk(body)
  const warnings = []
  if (lines.length === 0) warnings.push('Word 文档未提取到文字，可能全部为图片/扫描件')
  return { text: lines.join('\n\n'), format: 'docx', warnings }
}

// ---------------------------------------------------------------------------
// CSV / delimited text
// ---------------------------------------------------------------------------

function sniffDelimiter (text) {
  const sample = text.split(/\r?\n/).slice(0, 12).join('\n')
  const candidates = [',', '\t', ';', '|']
  let best = ','
  let bestScore = 0
  for (const delim of candidates) {
    const counts = sample.split(/\r?\n/).filter(Boolean).map(line => line.split(delim).length)
    if (counts.length === 0) continue
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length
    if (avg > bestScore + 0.5 && avg > 1) { best = delim; bestScore = avg }
  }
  return best
}

function parseDelimited (text, delim) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delim) { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (rows.length > MAX_CSV_ROWS) return rows
      continue
    }
    field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

async function extractCsv (absPath) {
  const buf = await fs.readFile(absPath)
  const text = decodeBytes(buf).replace(/^\uFEFF/, '')
  const delimiter = sniffDelimiter(text)
  const rows = parseDelimited(text, delimiter)
  const warnings = []
  const truncated = rows.length > MAX_CSV_ROWS
  if (truncated) warnings.push(`CSV 超过 ${MAX_CSV_ROWS} 行，已截断`)
  return { text: rowsToTsv(rows.slice(0, MAX_CSV_ROWS)), format: 'csv', warnings }
}

// ---------------------------------------------------------------------------
// PDF and legacy Office formats, through local tools
// ---------------------------------------------------------------------------

async function findTool (name) {
  if (toolPathCache.has(name)) return toolPathCache.get(name)
  const names = process.platform === 'win32' ? [name, `${name}.exe`] : [name]
  const dirs = [
    ...String(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean)
  for (const dir of dirs) {
    for (const candidate of names) {
      const full = path.join(dir, candidate)
      try {
        await fs.access(full)
        toolPathCache.set(name, full)
        return full
      } catch {}
    }
  }
  toolPathCache.set(name, null)
  return null
}

async function loadPdfjs () {
  if (pdfjsCache) return pdfjsCache
  const require = createRequire(import.meta.url)
  const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  let root = path.resolve(path.dirname(entry), '../..')
  try { root = path.dirname(require.resolve('pdfjs-dist/package.json')) } catch {}
  const mod = await import(pathToFileURL(entry).href)
  pdfjsCache = {
    getDocument: mod.getDocument,
    cMapUrl: path.join(root, 'cmaps') + path.sep,
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep,
  }
  return pdfjsCache
}

function pdfjsText (items) {
  const lines = []
  let line = ''
  let lastY = null
  let lastXEnd = null
  const flush = () => {
    if (line.trim()) lines.push(line.trim())
    line = ''
    lastY = null
    lastXEnd = null
  }
  for (const item of items || []) {
    const str = String(item?.str || '')
    if (!str) continue
    const y = Number(item.transform?.[5])
    const x = Number(item.transform?.[4])
    const width = Number(item.width) || 0
    const size = Number(item.height) || 10
    if (lastY !== null && Math.abs(y - lastY) > 2) flush()
    if (line && lastXEnd !== null && x - lastXEnd > Math.max(1.5, size * 0.12) && !/\s$/.test(line) && !/^\s/.test(str)) {
      line += ' '
    }
    line += str
    lastY = y
    lastXEnd = x + width
    if (item.hasEOL) flush()
  }
  flush()
  return lines.join('\n')
}

async function extractPdfWithPdfjs (absPath) {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await fs.readFile(absPath))
  let doc = null
  try {
    doc = await pdfjs.getDocument({
      data,
      cMapUrl: pdfjs.cMapUrl,
      cMapPacked: true,
      standardFontDataUrl: pdfjs.standardFontDataUrl,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    }).promise
    const pages = []
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent({ includeMarkedContent: false })
      const text = pdfjsText(content.items)
      if (text.trim()) pages.push(text)
    }
    return pages.join('\n\n')
  } finally {
    if (doc) {
      try { await doc.destroy() } catch {}
    }
  }
}

async function extractPdf (absPath) {
  const stat = await fs.stat(absPath)
  if (stat.size > MAX_PDF_BYTES) throw new Error('PDF 超过 120MB，请拆分后再导入')
  const attempts = []
  let text = ''
  const preferExternal = process.env.IW_PDF_ENGINE !== 'pdfjs'
  const pdftotext = preferExternal ? await findTool('pdftotext') : null
  if (pdftotext) {
    try {
      const result = await run(pdftotext, ['-layout', '-enc', 'UTF-8', '-nopgbrk', absPath, '-'], {
        maxBuffer: 96 * 1024 * 1024,
        timeout: 180_000,
      })
      text = result.stdout
    } catch (error) {
      attempts.push(`pdftotext: ${error?.message || error}`)
    }
  }
  if (!text.trim() && preferExternal) {
    const mutool = await findTool('mutool')
    if (mutool) {
      try {
        const result = await run(mutool, ['draw', '-F', 'txt', '-o', '-', absPath], {
          maxBuffer: 96 * 1024 * 1024,
          timeout: 180_000,
        })
        text = result.stdout
      } catch (error) {
        attempts.push(`mutool: ${error?.message || error}`)
      }
    }
  }
  if (!text.trim()) {
    try {
      text = await extractPdfWithPdfjs(absPath)
    } catch (error) {
      attempts.push(`PDF.js: ${error?.message || error}`)
    }
  }
  if (!text.trim()) {
    const pdfjsFailure = attempts.find(item => item.startsWith('PDF.js:'))
    if (pdfjsFailure && /Cannot find (package|module)|ERR_MODULE_NOT_FOUND/i.test(pdfjsFailure)) {
      throw new Error('PDF 解析组件 pdfjs-dist 未安装，请重新安装插件或运行 npm install。')
    }
    if (attempts.length > 0) {
      throw new Error(`PDF 解析失败（${attempts.join('；')}）。`)
    }
    throw new Error('PDF 未提取到文本层（可能是扫描件或图片型 PDF）。当前版本不支持扫描件或图片型 PDF，请上传可复制文字的 PDF，或改为 Word/文本文件。')
  }
  return { text: text.replace(/\f/g, '\n'), format: 'pdf', warnings: [] }
}


// ---------------------------------------------------------------------------

/**
 * Extract one file's text.
 * @param {string} absPath absolute path of the stored material
 * @param {string} displayName the original file name (extension drives the reader)
 * @returns {Promise<{text: string, format: string, warnings: string[]}>}
 */
export async function extractFile (absPath, displayName) {
  const ext = extensionOf(displayName)
  if (!ext) throw new Error('无法识别文件类型（缺少扩展名）')
  switch (ext) {
    case '.xlsx': return await extractXlsx(absPath)
    case '.docx': return await extractDocx(absPath)
    case '.csv': return await extractCsv(absPath)
    case '.pdf': return await extractPdf(absPath)
    case '.doc':
    case '.xls':
      throw new Error('暂不支持旧版 .doc/.xls，请用 Office/WPS 另存为 .docx/.xlsx 后再导入。')
    case '.md':
    case '.txt': {
      const buf = await fs.readFile(absPath)
      return { text: decodeBytes(buf).replace(/^\uFEFF/, ''), format: ext.slice(1), warnings: [] }
    }
    default:
      throw new Error(`暂不支持 ${ext} 格式（支持：xlsx、docx、csv、md、txt、pdf）`)
  }
}

/** Format label for a stored material. */
export function formatLabel (ext) {
  return FORMATS[ext] || ext.replace('.', '').toUpperCase()
}
