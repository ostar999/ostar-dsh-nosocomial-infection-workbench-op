/**
 * Markdown to standalone HTML, used for the report file the workbench writes
 * beside the markdown one. Deliberately small: headings, lists, tables, code,
 * quotes and inline emphasis are what the skill's report template needs.
 */

export function escapeHtml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function inlineMarkdown (text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return out
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

/** Render markdown to an HTML fragment. */
export function markdownToHtml (md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n')
  const html = []
  let i = 0
  const paragraph = []
  const flushParagraph = () => {
    if (paragraph.length === 0) return
    html.push(`<p>${inlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br />')}</p>`)
    paragraph.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*$/.test(line)) { flushParagraph(); i++; continue }
    const fence = /^```\s*([\w-]*)\s*$/.exec(line)
    if (fence) {
      flushParagraph()
      const body = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i++
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      html.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`)
      i++
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph()
      html.push('<hr />')
      i++
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph()
      const header = splitRow(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]))
      html.push('<table><thead><tr>' + header.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(row => '<tr>' + header.map((_, index) => `<td>${inlineMarkdown(row[index] ?? '')}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>')
      continue
    }
    if (/^\s*([-*+])\s+/.test(line)) {
      flushParagraph()
      const items = []
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim()
          i++
        }
      }
      html.push('<ul>' + items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('') + '</ul>')
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph()
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      html.push('<ol>' + items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('') + '</ol>')
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph()
      const quoted = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
      html.push(`<blockquote>${inlineMarkdown(quoted.join(' '))}</blockquote>`)
      continue
    }
    paragraph.push(line)
    i++
  }
  flushParagraph()
  return html.join('\n')
}

const REPORT_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 48px 24px 80px;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
  font-size: 15px; line-height: 1.75; color: #1f2329; background: #ffffff;
}
main { max-width: 900px; margin: 0 auto; }
h1 { font-size: 26px; line-height: 1.35; margin: 0 0 8px; padding-bottom: 14px; border-bottom: 2px solid #1b7fb3; }
h2 { font-size: 19px; margin: 34px 0 12px; padding-left: 11px; border-left: 4px solid #1b7fb3; }
h3 { font-size: 16px; margin: 22px 0 8px; }
p { margin: 10px 0; }
ul, ol { margin: 10px 0; padding-left: 26px; }
li { margin: 5px 0; }
strong { color: #0d2b45; }
code { background: #f1f4f8; border-radius: 4px; padding: 1px 5px; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
pre { background: #f1f4f8; border-radius: 8px; padding: 14px 16px; overflow: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 13.5px; }
th, td { border: 1px solid #dfe4ea; padding: 8px 10px; text-align: left; vertical-align: top; }
th { background: #f4f7fa; font-weight: 600; }
tbody tr:nth-child(even) { background: #fafbfc; }
blockquote { margin: 14px 0; padding: 8px 14px; border-left: 3px solid #c9d4de; color: #57606a; background: #f8fafb; }
hr { border: 0; border-top: 1px solid #e6eaef; margin: 26px 0; }
a { color: #1b7fb3; }
footer { max-width: 900px; margin: 40px auto 0; padding-top: 16px; border-top: 1px solid #e6eaef;
  color: #8a929c; font-size: 12px; }
@media print {
  body { padding: 0; }
  table, tr, h2, h3 { break-inside: avoid; }
  footer { display: none; }
}
@media (prefers-color-scheme: dark) {
  body { background: #14171c; color: #d7dde5; }
  strong { color: #eaf2fb; }
  h1 { border-bottom-color: #2f9ecb; }
  h2 { border-left-color: #2f9ecb; }
  code, pre { background: #1d222a; }
  th { background: #1b2028; }
  th, td { border-color: #2b333d; }
  tbody tr:nth-child(even) { background: #181c22; }
  blockquote { background: #191e25; border-left-color: #39434f; color: #98a2ae; }
  hr, footer { border-color: #262d36; }
}
`

/** Strip Markdown to readable plain text (tables stay tabular). */
export function markdownToText (markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let inCode = false
  for (const line of lines) {
    if (/^```/.test(line)) { inCode = !inCode; continue }
    if (inCode) { out.push('    ' + line); continue }
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue
    if (/^\s*\|/.test(line)) {
      let body = line.trim()
      if (body.startsWith('|')) body = body.slice(1)
      if (body.endsWith('|')) body = body.slice(0, -1)
      out.push(body.split('|').map(cell => cell.trim()).join('\t'))
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { out.push('────────────────────────'); continue }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const text = heading[2].trim()
      out.push('')
      out.push(heading[1].length <= 2 ? text : `■ ${text}`)
      out.push('')
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) { out.push('• ' + stripInline(bullet[1])); continue }
    const ordered = /^\s*(\d+[.)])\s+(.*)$/.exec(line)
    if (ordered) { out.push(`${ordered[1]} ${stripInline(ordered[2])}`); continue }
    if (/^\s*>\s?/.test(line)) { out.push('　' + stripInline(line.replace(/^\s*>\s?/, ''))); continue }
    out.push(stripInline(line))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function stripInline (text) {
  return String(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
}

/** Wrap a markdown report in a printable, self-contained HTML document. */
export function reportHtml ({ markdown, title, subtitle }) {
  const body = markdownToHtml(markdown)
  const heading = escapeHtml(title || '医院感染分析报告')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
${body}
</main>
<footer>${escapeHtml(subtitle || '由 AI 院感分析工作台生成 · 本报告为辅助分析结果，最终诊断由临床医师结合患者整体情况作出。')}</footer>
</body>
</html>
`
}
