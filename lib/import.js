/**
 * Material import: copy a file into the task's storage, extract its text, and
 * record the material. Shared by the HTTP upload route, the folder import, and
 * the agent tool so all three behave identically.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ACCEPTED_EXTENSIONS, extensionOf, extractFile, formatLabel } from './extract.js'

const MAX_FOLDER_FILES = 400
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__MACOSX', '.Trash'])
const MAX_FILE_BYTES = 120 * 1024 * 1024

function storedNameFor (ext) {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`
}

/**
 * Import one buffer as a material.
 * @returns {Promise<{material: object}>} the material, possibly with status 'error'
 */
export async function importBuffer (store, taskId, { name, rel = '', buffer }) {
  const task = store.get(taskId)
  if (!task) throw new Error('任务不存在或已被删除')
  const displayName = path.basename(String(name || 'material'))
  const ext = extensionOf(displayName)
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    const error = new Error(`不支持的格式 ${ext || '（无扩展名）'}：仅支持 ${ACCEPTED_EXTENSIONS.join('、')}`)
    error.status = 415
    throw error
  }
  if (buffer.length === 0) throw new Error('文件内容为空')
  const storedName = storedNameFor(ext)
  const filesDir = store.filesDir(taskId)
  await fs.mkdir(filesDir, { recursive: true })
  const absPath = path.join(filesDir, storedName)
  await fs.writeFile(absPath, buffer)
  try {
    const result = await extractFile(absPath, displayName)
    const text = String(result.text || '')
    if (!text.trim()) {
      const material = await store.addMaterial(taskId, {
        name: displayName,
        rel,
        ext,
        bytes: buffer.length,
        chars: 0,
        status: 'error',
        error: '未提取到文本内容（可能为扫描件或空文档）',
        warnings: result.warnings || [],
        storedName,
      })
      return { material: { ...material, formatLabel: formatLabel(ext) } }
    }
    const material = await store.addMaterial(taskId, {
      name: displayName,
      rel,
      ext,
      bytes: buffer.length,
      chars: text.length,
      status: 'parsed',
      warnings: result.warnings || [],
      storedName,
    })
    await store.writeText(taskId, material, text)
    return { material: { ...material, formatLabel: formatLabel(ext) } }
  } catch (error) {
    const material = await store.addMaterial(taskId, {
      name: displayName,
      rel,
      ext,
      bytes: buffer.length,
      chars: 0,
      status: 'error',
      error: String(error?.message || error),
      storedName,
    })
    return { material: { ...material, formatLabel: formatLabel(ext) } }
  }
}

async function walk (dir, base, out, limit) {
  if (out.length >= limit) return out
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  for (const entry of entries) {
    if (out.length >= limit) return out
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(full, base, out, limit)
      continue
    }
    if (!entry.isFile()) continue
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(entry.name))) continue
    out.push({ abs: full, rel: path.relative(base, full) })
  }
  return out
}

/**
 * Import every supported file under a folder (recursively).
 * @returns {Promise<{added: object[], failed: {name: string, error: string}[], scanned: number}>}
 */
export async function importFolder (store, taskId, dir) {
  const task = store.get(taskId)
  if (!task) throw new Error('任务不存在或已被删除')
  if (!path.isAbsolute(dir)) throw new Error('请提供文件夹的绝对路径')
  let stat
  try {
    stat = await fs.stat(dir)
  } catch {
    throw new Error('文件夹不存在或不可访问')
  }
  if (!stat.isDirectory()) throw new Error('该路径不是文件夹')
  const files = await walk(dir, dir, [], MAX_FOLDER_FILES)
  if (files.length === 0) {
    throw new Error(`文件夹内没有可导入的材料（支持 ${ACCEPTED_EXTENSIONS.join('、')}）`)
  }
  const added = []
  const failed = []
  for (const file of files) {
    try {
      const fileStat = await fs.stat(file.abs)
      if (fileStat.size > MAX_FILE_BYTES) {
        failed.push({ name: path.basename(file.abs), error: '文件超过 120MB' })
        continue
      }
      const buffer = await fs.readFile(file.abs)
      const { material } = await importBuffer(store, taskId, {
        name: path.basename(file.abs),
        rel: file.rel,
        buffer,
      })
      if (material.status === 'parsed') added.push({ id: material.id, name: material.name, rel: material.rel, chars: material.chars })
      else failed.push({ name: material.name, error: material.error })
    } catch (error) {
      failed.push({ name: path.basename(file.abs), error: String(error?.message || error) })
    }
  }
  return { added, failed, scanned: files.length }
}

/**
 * Scan a parent folder whose immediate subfolders are one case each.
 * Only folders containing at least one supported file are returned.
 */
export async function scanCaseFolders (root) {
  const dir = String(root || '').trim()
  if (!dir) throw new Error('请选择包含病例文件夹的上级目录')
  if (!path.isAbsolute(dir)) throw new Error('请提供文件夹的绝对路径')
  let stat
  try { stat = await fs.stat(dir) } catch { throw new Error('文件夹不存在或不可访问') }
  if (!stat.isDirectory()) throw new Error('该路径不是文件夹')
  let entries = []
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { throw new Error('文件夹不可读取') }
  const cases = []
  const ignored = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) { ignored.push(entry.name); continue }
    const full = path.join(dir, entry.name)
    let real
    try { real = await fs.realpath(full) } catch { ignored.push(entry.name); continue }
    if (!real.startsWith(await fs.realpath(dir) + path.sep)) { ignored.push(entry.name); continue }
    const files = await walk(full, full, [], MAX_FOLDER_FILES)
    if (files.length === 0) { ignored.push(entry.name); continue }
    cases.push({ name: entry.name, dir: full, files: files.length })
    if (cases.length >= 200) break
  }
  if (cases.length === 0) throw new Error('没有找到含可导入材料的病例文件夹；请确认每个病例单独放一个子文件夹')
  return { root: dir, cases, ignored }
}

/**
 * Create one task per selected case folder and import its materials.
 */
export async function importCaseFolders (store, root, selected = [], group = '') {
  const scan = await scanCaseFolders(root)
  const wanted = new Set((Array.isArray(selected) ? selected : []).map(String))
  const targets = scan.cases.filter(item => wanted.has(item.name))
  if (targets.length === 0) throw new Error('请至少选择一个病例文件夹')
  const tasks = []
  const errors = []
  for (const item of targets) {
    try {
      const task = await store.create({ title: item.name, group: String(group || '').trim() || path.basename(scan.root) })
      const result = await importFolder(store, task.id, item.dir)
      tasks.push({ id: task.id, title: task.title, added: result.added.length, failed: result.failed.length, scanned: result.scanned })
    } catch (error) {
      errors.push({ name: item.name, error: String(error?.message || error) })
    }
  }
  return { root: scan.root, tasks, errors }
}
