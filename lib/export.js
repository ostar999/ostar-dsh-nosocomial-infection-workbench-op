/**
 * Report exports: Markdown, HTML, plain text, Word and PDF.
 *
 * PDF is produced by the Host's `officeToPdf` service from the generated DOCX,
 * so the PDF matches the Word layout and needs no extra tooling. When that
 * service is absent, a local LibreOffice is used; otherwise the report is still
 * exported in the other four formats and a warning is recorded.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { markdownToText, reportHtml } from './markdown.js'
import { markdownToDocx } from './docx.js'

const run = promisify(execFile)

export const REPORT_BASENAME = '院感分析报告'
export const REPORT_FORMATS = ['md', 'html', 'txt', 'docx', 'pdf']
export const REPORT_CONTENT_TYPES = {
  md: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
}

export function reportFile (dir, format) {
  return path.join(dir, `${REPORT_BASENAME}.${format}`)
}

async function convertWithLibreOffice (docxPath) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iw-pdf-'))
  try {
    await run('soffice', [
      '--headless', '--norestore', '--invisible',
      '--convert-to', 'pdf',
      '--outdir', dir,
      docxPath,
    ], { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 })
    const produced = path.join(dir, path.basename(docxPath).replace(/\.docx$/i, '.pdf'))
    return await fs.readFile(produced)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function toPdf ({ officeToPdf, docx, docxPath, taskId, signal }) {
  if (officeToPdf && typeof officeToPdf.convert === 'function') {
    const version = `${docx.length}-${Date.now()}`
    const result = await officeToPdf.convert({
      extension: 'docx',
      priority: 'foreground',
      source: {
        key: `infection-workbench/${taskId}`,
        version,
        bytes: docx.length,
        read: async () => ({ bytes: docx, version }),
      },
    }, signal)
    if (!result || !result.pdf || result.pdf.length === 0) throw new Error('转换服务未返回 PDF')
    return Buffer.from(result.pdf)
  }
  try {
    return await convertWithLibreOffice(docxPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('当前 Host 未提供 officeToPdf 服务，本机也没有 LibreOffice；请改用 Word/TXT/HTML')
    }
    throw error
  }
}

/**
 * Write every report format into the task directory.
 * @returns {Promise<{files: Record<string, {path: string, bytes: number}>, warnings: string[], pdf: boolean}>}
 */
export async function writeReportFiles ({
  dir,
  markdown,
  title,
  subtitle,
  taskId,
  officeToPdf,
  signal,
  formats = REPORT_FORMATS,
}) {
  await fs.mkdir(dir, { recursive: true })
  const files = {}
  const write = async (format, contents) => {
    const file = reportFile(dir, format)
    await fs.writeFile(file, contents)
    files[format] = { path: file, bytes: Buffer.byteLength(contents) }
  }

  const wanted = new Set(formats.filter(format => REPORT_FORMATS.includes(format)))
  if (wanted.has('md')) await write('md', markdown)
  if (wanted.has('html')) await write('html', reportHtml({ markdown, title, subtitle }))
  if (wanted.has('txt')) await write('txt', markdownToText(markdown))
  const docx = wanted.has('docx') || wanted.has('pdf') ? markdownToDocx(markdown, { title }) : null
  if (docx && wanted.has('docx')) await write('docx', docx)

  const warnings = []
  let pdf = false
  if (docx && wanted.has('pdf')) {
    if (!files.docx) await write('docx', docx)
    try {
      const bytes = await toPdf({ officeToPdf, docx, docxPath: files.docx.path, taskId, signal })
      await write('pdf', bytes)
      pdf = true
    } catch (error) {
      warnings.push(`PDF 导出失败：${error?.message || error}`)
    }
  }
  return { files, warnings, pdf }
}
