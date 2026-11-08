/**
 * Markdown → WordprocessingML (.docx), dependency-free.
 *
 * The report template is deliberately simple (headings, paragraphs, lists,
 * tables, quotes, code), so this converter covers exactly that subset and
 * emits a valid OOXML package through the local ZIP writer.
 */
import { createZip } from './zipwrite.js'

const PAGE_WIDTH = 9026 // A4 (11906 twips) minus 2 × 1440 margins
const BODY_FONT = '宋体'
const HEADING_FONT = '黑体'
const MONO_FONT = 'Consolas'

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function run (text, { bold = false, italic = false, code = false } = {}) {
  const props = []
  if (code) {
    props.push(`<w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:eastAsia="${BODY_FONT}"/>`)
    props.push('<w:sz w:val="18"/>')
  }
  if (bold) props.push('<w:b/>')
  if (italic) props.push('<w:i/>')
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

/** Split one line of markdown into formatted runs. */
function inlineRuns (text, base = {}) {
  const out = []
  let rest = String(text ?? '')
  while (rest.length > 0) {
    const bold = /^\*\*([^*]+)\*\*/.exec(rest)
    if (bold) { out.push(run(bold[1], { ...base, bold: true })); rest = rest.slice(bold[0].length); continue }
    const code = /^`([^`]+)`/.exec(rest)
    if (code) { out.push(run(code[1], { ...base, code: true })); rest = rest.slice(code[0].length); continue }
    const italic = /^\*([^*\n]+)\*/.exec(rest)
    if (italic) { out.push(run(italic[1], { ...base, italic: true })); rest = rest.slice(italic[0].length); continue }
    const next = rest.slice(1).search(/[`*]/)
    if (next < 0) { out.push(run(rest, base)); rest = '' } else { out.push(run(rest.slice(0, next + 1), base)); rest = rest.slice(next + 1) }
  }
  return out.join('')
}

function paragraph (content, { style, align, spacing, indent, border, shading, keepNext } = {}) {
  const props = []
  if (style) props.push(`<w:pStyle w:val="${style}"/>`)
  if (keepNext) props.push('<w:keepNext/>')
  if (border) props.push(`<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="${border}"/></w:pBdr>`)
  if (shading) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`)
  if (spacing) props.push(`<w:spacing ${spacing}/>`)
  if (indent) props.push(`<w:ind ${indent}/>`)
  if (align) props.push(`<w:jc w:val="${align}"/>`)
  const pPr = props.length ? `<w:pPr>${props.join('')}</w:pPr>` : ''
  return `<w:p>${pPr}${content}</w:p>`
}

function table (rows) {
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (columns === 0) return ''
  const width = Math.floor(PAGE_WIDTH / columns)
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join('')
  const borders = '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFC8D2"/>`)
      .join('') + '</w:tblBorders>'
  const body = rows.map((row, index) => {
    const headerRow = index === 0
    const cells = Array.from({ length: columns }, (_, column) => {
      const value = row[column] ?? ''
      const shading = headerRow ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F4F8"/>' : ''
      const content = inlineRuns(value, { bold: headerRow })
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}<w:vAlign w:val="center"/></w:tcPr>` +
        paragraph(content, { spacing: 'w:before="40" w:after="40"', align: 'left' }) +
        '</w:tc>'
    }).join('')
    return `<w:tr><w:trPr><w:cantSplit/>${headerRow ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>` +
    paragraph('', { spacing: 'w:before="0" w:after="80"' })
}

function isTableSeparator (line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
}

function splitRow (line) {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|')) body = body.slice(0, -1)
  return body.split('|').map(cell => cell.trim())
}

function bodyXml (markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let i = 0
  let inCode = false
  let codeBuffer = []
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      if (inCode) {
        for (const codeLine of codeBuffer) {
          out.push(paragraph(run(codeLine || ' ', { code: true }), { spacing: 'w:before="0" w:after="0"', shading: 'F5F7FA' }))
        }
        codeBuffer = []
        inCode = false
      } else {
        inCode = true
      }
      i++
      continue
    }
    if (inCode) { codeBuffer.push(line); i++; continue }
    if (/^\s*$/.test(line)) { i++; continue }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const style = level === 1 ? 'Title' : `Heading${Math.min(4, level - 1)}`
      out.push(paragraph(inlineRuns(heading[2].trim()), { style, keepNext: true }))
      i++
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push(paragraph('', { border: 'C9D4DE', spacing: 'w:before="120" w:after="120"' }))
      i++
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows = [splitRow(line)]
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]))
      out.push(table(rows))
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      out.push(paragraph(run('• ') + inlineRuns(bullet[1]), { indent: 'w:left="360" w:hanging="220"' }))
      i++
      continue
    }
    const ordered = /^\s*(\d+[.)])\s+(.*)$/.exec(line)
    if (ordered) {
      out.push(paragraph(run(`${ordered[1]} `) + inlineRuns(ordered[2]), { indent: 'w:left="360" w:hanging="260"' }))
      i++
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(paragraph(inlineRuns(quoted.join(' '), { italic: true }), { indent: 'w:left="360"', border: 'D5DBE3' }))
      continue
    }
    // Paragraph: collect until a blank line or a block-level start.
    const buffer = [line]
    i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) && !/^```/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) && !/^\s*>\s?/.test(lines[i])) {
      buffer.push(lines[i])
      i++
    }
    out.push(paragraph(inlineRuns(buffer.join('\n').replace(/\n/g, ' '))))
  }
  if (inCode) {
    for (const codeLine of codeBuffer) {
      out.push(paragraph(run(codeLine || ' ', { code: true }), { spacing: 'w:before="0" w:after="0"', shading: 'F5F7FA' }))
    }
  }
  return out.join('')
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${BODY_FONT}" w:cs="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="1F2329"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}"/><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}"/><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}"/><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
</w:styles>`

const CORE = (title, iso) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>AI 院感分析工作台</dc:creator><cp:lastModifiedBy>AI 院感分析工作台</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AI 院感分析工作台</Application></Properties>`

/**
 * Render a markdown report as a .docx document.
 * @param {string} markdown
 * @param {{title?: string, generatedAt?: Date}} options
 * @returns {Buffer}
 */
export function markdownToDocx (markdown, { title = '医院感染分析报告', generatedAt = new Date() } = {}) {
  const iso = generatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${bodyXml(markdown)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1418" w:bottom="1440" w:left="1418" w:header="851" w:footer="992" w:gutter="0"/><w:docGrid w:type="lines" w:linePitch="312"/></w:sectPr></w:body></w:document>`
  return createZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: CORE(title, iso) },
    { name: 'docProps/app.xml', data: APP },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/_rels/document.xml.rels', data: DOCUMENT_RELS },
  ])
}
