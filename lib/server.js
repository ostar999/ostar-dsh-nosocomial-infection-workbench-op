/**
 * The workbench HTTP API.
 *
 * One prefix route on the Host web server serves the panel: JSON for state and
 * commands, raw bodies for uploads, plain text for downloads. Every request is
 * admitted by the Host's own browser/API credential check before anything is
 * read or written, so a page on another origin cannot drive the workbench.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { formatLabel } from './extract.js'
import { importBuffer, importFolder, importCaseFolders, scanCaseFolders } from './import.js'
import { REPORT_CONTENT_TYPES, REPORT_FORMATS, writeReportFiles } from './export.js'
import { buildTimeline, parseFacts } from './timeline.js'
import { normalizeReportHeader } from './citations.js'

export const API_PREFIX = '/infection-workbench'

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024
const MAX_JSON_BYTES = 4 * 1024 * 1024

function sendJson (res, status, payload) {
  if (res.headersSent) { res.end(); return }
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendText (res, status, text, type = 'text/plain; charset=utf-8', extra = {}) {
  if (res.headersSent) { res.end(); return }
  const body = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8')
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': body.length,
    ...extra,
  })
  res.end(body)
}

function readBody (req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        fail(new Error(`请求体超过 ${Math.round(limit / 1024 / 1024)}MB 上限`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', fail)
    req.on('aborted', () => fail(new Error('请求被中断')))
  })
}

async function readJson (req) {
  const buf = await readBody(req, MAX_JSON_BYTES)
  if (buf.length === 0) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

function isLoopbackHost (hostHeader) {
  const host = String(hostHeader || '').split(':')[0].toLowerCase()
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
}

function safeFileName (name) {
  return String(name || 'download')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 160)
}

function contentDisposition (name) {
  return `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Build the request handler.
 * @param {object} deps
 * @param {object} deps.store task store
 * @param {object} deps.engine analysis engine
 * @param {() => object|undefined} deps.getConnection Host connection service (optional)
 * @param {() => object|undefined} deps.getModelTarget resolves the model descriptor
 * @param {object} deps.skill loaded skill
 * @param {string} deps.version plugin version
 */
export function createHandler ({ store, engine, getConnection, getModelTarget, getModelCatalog, selectModel, lookupCitation, skill, version, getOfficeToPdf, environment }) {
  function rejectUnadmitted (req, res) {
    const connection = getConnection()
    if (connection && typeof connection.requestRejection === 'function') {
      let status
      try { status = connection.requestRejection({ headers: req.headers }) } catch { status = 403 }
      if (status !== undefined) {
        sendJson(res, status, { error: status === 401 ? '需要先登录 DSH，请重新打开启动时打印的网址' : '请求来自不受信任的来源，已拒绝' })
        return true
      }
      return false
    }
    // Older Hosts without the connection service: loopback only.
    if (!isLoopbackHost(req.headers.host)) {
      sendJson(res, 403, { error: '请求来自不受信任的来源，已拒绝' })
      return true
    }
    return false
  }

  async function detail (taskId) {
    const task = store.get(taskId)
    if (!task) throw new Error('任务不存在或已被删除')
    let report = ''
    try { report = normalizeReportHeader(await fs.readFile(store.reportPath(taskId, 'md'), 'utf8')) } catch { report = '' }
    const materials = []
    for (const material of task.materials) {
      let excerpt = ''
      if (material.status === 'parsed') {
        const text = await store.readText(taskId, material)
        excerpt = text.slice(0, 1200)
      }
      materials.push({
        ...material,
        formatLabel: formatLabel(material.ext),
        excerpt,
      })
    }
    return {
      task: {
        id: task.id,
        title: task.title,
        patientName: task.patientName,
        sex: task.sex,
        age: task.age,
        note: task.note,
        group: task.group || '',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      materials,
      analysis: task.analysis,
      report,
      chat: task.chat.map(message => ({
        id: message.id,
        at: message.at,
        role: message.role,
        content: message.content,
        pending: Boolean(message.pending),
        error: message.error || '',
      })),
      chatContext: task.chatContext || null,
      chatCompactions: task.chatCompactions || 0,
      job: engine.activeFor(taskId),
    }
  }

  async function state () {
    let model = null
    try {
      model = await getModelTarget()
    } catch (error) {
      model = { error: String(error?.message || error), unconfigured: Boolean(error?.unconfigured) }
    }
    return {
      version,
      skill: { name: skill.name, version: skill.version, warnings: skill.warnings, standards: skill.standards.length },
      model,
      tasks: store.list(),
    }
  }

  return async function handler (req, res) {
    try {
      if (rejectUnadmitted(req, res)) return
      const url = new URL(req.url || '/', 'http://workbench.local')
      if (!url.pathname.startsWith(API_PREFIX)) {
        sendJson(res, 404, { error: '未知接口' })
        return
      }
      const route = url.pathname.slice(API_PREFIX.length) || '/'
      const method = req.method || 'GET'
      const query = url.searchParams

      if (method === 'GET' && route === '/health') {
        sendJson(res, 200, { ok: true, version, skill: skill.name })
        return
      }
      if (method === 'GET' && route === '/state') {
        sendJson(res, 200, await state())
        return
      }
      if (method === 'GET' && route === '/environment') {
        if (!environment) throw new Error('当前 Host 未提供环境检查服务')
        sendJson(res, 200, await environment.check())
        return
      }
      if (method === 'POST' && route === '/environment/install') {
        if (!environment) throw new Error('当前 Host 未提供环境安装服务')
        const body = await readJson(req)
        sendJson(res, 200, environment.startInstall(String(body.target || '')))
        return
      }
      if (method === 'GET' && route === '/environment/job') {
        if (!environment) throw new Error('当前 Host 未提供环境检查服务')
        const job = environment.getJob(String(query.get('id') || ''))
        if (!job) { sendJson(res, 404, { error: '安装任务不存在或已过期' }); return }
        sendJson(res, 200, job)
        return
      }
      if (method === 'GET' && route === '/assistant') {
        sendJson(res, 200, engine.assistantState(String(query.get('sessionId') || '')))
        return
      }
      if (method === 'POST' && route === '/assistant/sessions') {
        const body = await readJson(req)
        const session = await engine.createAssistantSession(String(body.title || '新对话'))
        sendJson(res, 200, { session, ...engine.assistantState(session?.id || '') })
        return
      }
      if (method === 'POST' && route === '/assistant/select') {
        const body = await readJson(req)
        const ok = await engine.selectAssistantSession(String(body.id || ''))
        sendJson(res, ok ? 200 : 404, ok ? engine.assistantState(String(body.id || '')) : { error: '会话不存在' })
        return
      }
      if (method === 'POST' && route === '/assistant/rename') {
        const body = await readJson(req)
        const ok = await engine.renameAssistantSession(String(body.id || ''), String(body.title || ''))
        sendJson(res, ok ? 200 : 404, ok ? engine.assistantState(String(body.id || '')) : { error: '会话不存在' })
        return
      }
      if (method === 'POST' && route === '/assistant/delete') {
        const body = await readJson(req)
        const ok = await engine.deleteAssistantSession(String(body.id || ''))
        sendJson(res, ok ? 200 : 404, ok ? engine.assistantState() : { error: '会话不存在' })
        return
      }
      if (method === 'POST' && route === '/assistant/delete-many') {
        const body = await readJson(req)
        const removed = await engine.deleteAssistantSessions(Array.isArray(body.ids) ? body.ids : [])
        sendJson(res, 200, { removed, ...engine.assistantState() })
        return
      }
      if (method === 'POST' && route === '/assistant/chat') {
        const body = await readJson(req)
        const job = await engine.startAssistantChat(String(body.message || ''), String(body.sessionId || ''))
        sendJson(res, 200, { job, ...engine.assistantState(job.sessionId || '') })
        return
      }
      if (method === 'GET' && route === '/assistant/export') {
        const sessionId = String(query.get('sessionId') || '')
        const state = engine.assistantState(sessionId)
        const session = state.sessions.find(item => item.id === state.activeId)
        const title = session?.title || '院感助手对话'
        const messages = state.messages || []
        const lines = [
          `# ${title}`,
          '',
          '> 由欧星星·AI院感工作台 · 院感助手生成；通用知识参考，不包含病例材料。',
          '',
        ]
        for (const message of messages) {
          lines.push(`## ${message.role === 'user' ? '用户' : '助手'}`)
          lines.push('')
          lines.push(String(message.content || '').trim() || '（空）')
          lines.push('')
        }
        const format = String(query.get('format') || 'md').toLowerCase()
        if (!REPORT_FORMATS.includes(format)) {
          sendJson(res, 400, { error: `不支持的导出格式：${format}` })
          return
        }
        const markdown = lines.join('\n')
        const safe = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '院感助手对话'
        const disposition = `attachment; filename="assistant-chat.${format}"; filename*=UTF-8''${encodeURIComponent(`${safe}.${format}`)}`
        if (format === 'md') {
          sendText(res, 200, markdown, REPORT_CONTENT_TYPES.md, { 'content-disposition': disposition })
          return
        }
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iw-assistant-export-'))
        try {
          const exported = await writeReportFiles({
            dir: tempDir,
            markdown,
            title,
            subtitle: '由欧星星·AI院感工作台 · 院感助手生成',
            taskId: `assistant-${sessionId || 'active'}`,
            formats: [format],
            officeToPdf: typeof getOfficeToPdf === 'function' ? getOfficeToPdf() : null,
          })
          const file = exported.files?.[format]
          if (!file) {
            sendJson(res, 500, { error: exported.warnings?.[0] || `导出 ${format} 失败` })
            return
          }
          sendText(res, 200, await fs.readFile(file.path), REPORT_CONTENT_TYPES[format], { 'content-disposition': disposition })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
        return
      }
      if (method === 'POST' && route === '/assistant/cancel') {
        sendJson(res, 200, { cancelled: engine.cancelAssistant() })
        return
      }
      if (method === 'POST' && route === '/assistant/clear') {
        const body = await readJson(req)
        await engine.clearAssistant(String(body.sessionId || ''))
        sendJson(res, 200, engine.assistantState(String(body.sessionId || '')))
        return
      }
      if (method === 'GET' && route === '/citations/lookup') {
        if (typeof lookupCitation !== 'function') { sendJson(res, 501, { error: '引用追溯不可用' }); return }
        const name = String(query.get('name') || '')
        const clause = String(query.get('clause') || '')
        sendJson(res, 200, lookupCitation(name, clause))
        return
      }
      if (method === 'GET' && route === '/tasks/timeline') {
        const taskId = String(query.get('id') || '')
        if (!store.get(taskId)) { sendJson(res, 404, { error: '任务不存在' }); return }
        let detail = null
        try {
          detail = JSON.parse(await fs.readFile(path.join(store.taskDir(taskId), '分析明细.json'), 'utf8'))
        } catch {
          sendJson(res, 404, { error: '请先完成一次综合分析，时间线依赖分析明细中的结构化事实' })
          return
        }
        sendJson(res, 200, { timeline: buildTimeline(parseFacts(detail.facts)) })
        return
      }
      if (method === 'GET' && route === '/models') {
        if (typeof getModelCatalog !== 'function') { sendJson(res, 501, { error: '模型目录不可用' }); return }
        sendJson(res, 200, await getModelCatalog())
        return
      }
      if (method === 'POST' && route === '/models/select') {
        if (typeof selectModel !== 'function') { sendJson(res, 501, { error: '模型选择不可用' }); return }
        const body = await readJson(req)
        sendJson(res, 200, { model: await selectModel(body) })
        return
      }
      if (method === 'GET' && route === '/tasks/detail') {
        sendJson(res, 200, await detail(String(query.get('id') || '')))
        return
      }
      if (method === 'POST' && route === '/tasks/create') {
        const body = await readJson(req)
        const task = await store.create(body)
        sendJson(res, 200, await detail(task.id))
        return
      }
      if (method === 'POST' && route === '/tasks/update') {
        const body = await readJson(req)
        const id = String(body.id || '')
        await store.update(id, body)
        sendJson(res, 200, await detail(id))
        return
      }
      if (method === 'POST' && route === '/tasks/delete') {
        const body = await readJson(req)
        const id = String(body.id || '')
        engine.cancel(id)
        const removed = await store.remove(id)
        sendJson(res, 200, { ok: removed, tasks: store.list() })
        return
      }
      if (method === 'POST' && route === '/tasks/import') {
        const taskId = String(query.get('id') || '')
        const name = path.basename(String(query.get('name') || 'material'))
        const rel = String(query.get('rel') || '')
        const buffer = await readBody(req, MAX_UPLOAD_BYTES)
        if (buffer.length === 0) throw new Error('上传内容为空')
        const result = await importBuffer(store, taskId, { name, rel, buffer })
        sendJson(res, 200, result)
        return
      }
      if (method === 'POST' && route === '/batches/scan') {
        const body = await readJson(req)
        sendJson(res, 200, await scanCaseFolders(String(body.root || '').trim()))
        return
      }
      if (method === 'POST' && route === '/batches/import') {
        const body = await readJson(req)
        sendJson(res, 200, await importCaseFolders(store, String(body.root || '').trim(), body.selected, body.group))
        return
      }
      if (method === 'POST' && route === '/groups/rename') {
        const body = await readJson(req)
        const result = await store.renameGroup(String(body.from || ''), String(body.to || ''))
        sendJson(res, 200, result)
        return
      }
      if (method === 'POST' && route === '/tasks/import-folder') {
        const body = await readJson(req)
        const result = await importFolder(store, String(body.id || ''), String(body.dir || '').trim())
        sendJson(res, 200, result)
        return
      }
      if (method === 'POST' && route === '/tasks/materials/delete') {
        const body = await readJson(req)
        const ok = await store.removeMaterial(String(body.id || ''), String(body.materialId || ''))
        sendJson(res, 200, { ok })
        return
      }
      if (method === 'GET' && route === '/tasks/material') {
        const taskId = String(query.get('id') || '')
        const materialId = String(query.get('materialId') || '')
        const task = store.get(taskId)
        const material = task?.materials.find(m => m.id === materialId)
        if (!material) { sendJson(res, 404, { error: '材料不存在' }); return }
        if (query.get('mode') === 'file') {
          const buffer = await fs.readFile(path.join(store.filesDir(taskId), material.storedName))
          res.writeHead(200, {
            'content-type': 'application/octet-stream',
            'content-disposition': contentDisposition(material.name),
            'content-length': buffer.length,
          })
          res.end(buffer)
          return
        }
        const text = await store.readText(taskId, material)
        sendText(res, 200, text || material.error || '（无可读取文本）')
        return
      }
      if (method === 'POST' && route === '/tasks/analyze') {
        const body = await readJson(req)
        const job = engine.startAnalysis(String(body.id || ''), { focus: body.focus })
        sendJson(res, 200, { job })
        return
      }
      if (method === 'POST' && route === '/tasks/chat') {
        const body = await readJson(req)
        const job = engine.startChat(String(body.id || ''), body.message)
        sendJson(res, 200, { job, detail: await detail(String(body.id || '')) })
        return
      }
      if (method === 'POST' && route === '/tasks/chat/clear') {
        const body = await readJson(req)
        const ok = await store.clearChat(String(body.id || ''))
        sendJson(res, 200, { ok })
        return
      }
      if (method === 'GET' && route === '/tasks/chat/export') {
        const taskId = String(query.get('id') || '')
        const task = store.get(taskId)
        if (!task) { sendJson(res, 404, { error: '任务不存在' }); return }
        const format = String(query.get('format') || 'md').toLowerCase()
        if (!REPORT_FORMATS.includes(format)) {
          sendJson(res, 400, { error: `不支持的导出格式：${format}` })
          return
        }
        const title = `${task.title} · 病例问答`
        const lines = [
          `# ${title}`,
          '',
          `> 由欧星星·AI院感工作台导出；病例：${task.title}${task.patientName ? `（${task.patientName}）` : ''}。`,
          '',
        ]
        for (const message of task.chat || []) {
          lines.push(`## ${message.role === 'user' ? '用户' : '分析助手'}`)
          if (message.at) lines.push(`时间：${new Date(message.at).toLocaleString('zh-CN')}`)
          lines.push('')
          lines.push(String(message.content || '').trim() || (message.pending ? '（生成中）' : '（空）'))
          if (message.error) lines.push('', `错误：${message.error}`)
          lines.push('')
        }
        const markdown = lines.join('\n')
        const safe = String(task.title || '病例问答').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '病例问答'
        const disposition = `attachment; filename="case-chat.${format}"; filename*=UTF-8''${encodeURIComponent(`${safe}-病例问答.${format}`)}`
        if (format === 'md') {
          sendText(res, 200, markdown, REPORT_CONTENT_TYPES.md, { 'content-disposition': disposition })
          return
        }
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iw-chat-export-'))
        try {
          const exported = await writeReportFiles({
            dir: tempDir,
            markdown,
            title,
            subtitle: '由欧星星·AI院感工作台导出',
            taskId: `chat-${taskId}`,
            formats: [format],
            officeToPdf: typeof getOfficeToPdf === 'function' ? getOfficeToPdf() : null,
          })
          const file = exported.files?.[format]
          if (!file) {
            sendJson(res, 500, { error: exported.warnings?.[0] || `导出 ${format} 失败` })
            return
          }
          sendText(res, 200, await fs.readFile(file.path), REPORT_CONTENT_TYPES[format], { 'content-disposition': disposition })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
        return
      }
      if (method === 'POST' && route === '/tasks/cancel') {
        const body = await readJson(req)
        const cancelled = engine.cancel(String(body.id || ''))
        sendJson(res, 200, { cancelled })
        return
      }
      if (method === 'GET' && route === '/jobs') {
        const taskId = String(query.get('taskId') || '')
        const jobId = String(query.get('jobId') || '')
        const job = jobId ? engine.job(jobId) : engine.activeFor(taskId)
        if (!job) { sendJson(res, 404, { error: '没有正在运行的任务' }); return }
        const payload = { job }
        if (job.kind === 'chat') payload.chat = store.get(taskId)?.chat?.slice(-2) ?? []
        sendJson(res, 200, payload)
        return
      }
      if (method === 'GET' && route === '/tasks/report') {
        const taskId = String(query.get('id') || '')
        const format = String(query.get('format') || 'md').toLowerCase()
        if (!REPORT_FORMATS.includes(format)) {
          sendJson(res, 400, { error: `不支持的导出格式：${format}（可选 ${REPORT_FORMATS.join('、')}）` })
          return
        }
        const file = await engine.ensureExport(taskId, format)
        const content = await fs.readFile(file)
        res.writeHead(200, {
          'content-type': REPORT_CONTENT_TYPES[format],
          'content-disposition': contentDisposition(`院感分析报告.${format}`),
          'cache-control': 'no-store',
          'content-length': content.length,
        })
        res.end(content)
        return
      }

      sendJson(res, 404, { error: `未知接口 ${method} ${route}` })
    } catch (error) {
      const status = error?.status || (error?.code === 'ENOENT' ? 404 : 400)
      sendJson(res, status, { error: String(error?.message || error) })
    }
  }
}
