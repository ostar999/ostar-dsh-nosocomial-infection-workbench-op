/**
 * Persistent sessions for the general infection-control assistant.
 *
 * The assistant never receives case materials or reports. Sessions are stored
 * independently from case tasks so they can be renamed/deleted/exported
 * without touching any case data.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

function newSessionId () {
  return `asst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function newMessageId () {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function cleanTitle (value, fallback = '新对话') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function makeSession (title = '新对话') {
  const now = Date.now()
  return {
    id: newSessionId(),
    title: cleanTitle(title),
    createdAt: now,
    updatedAt: now,
    messages: [],
    summary: '',
    summaryAt: null,
    summaryCount: 0,
    compactions: 0,
    context: null,
  }
}

function summary (session) {
  const last = [...(session.messages || [])].reverse().find(message => String(message.content || '').trim())
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    preview: last ? String(last.content).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    lastError: Boolean(last && last.role === 'assistant' && last.error),
    hasSummary: Boolean(session.summary),
    compactions: session.compactions || 0,
  }
}

export async function createAssistantStore ({ dataDir }) {
  const dir = path.join(dataDir, 'assistant')
  const file = path.join(dir, 'sessions.json')
  const oldFile = path.join(dir, 'chat.json')
  await fs.mkdir(dir, { recursive: true })
  let state = { version: 2, activeId: null, sessions: [] }
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'))
    if (raw && Array.isArray(raw.sessions)) state = raw
  } catch {
    // Migrate the single-conversation format written before 2.8.1.
    try {
      const old = JSON.parse(await fs.readFile(oldFile, 'utf8'))
      if (old && Array.isArray(old.messages) && old.messages.length > 0) {
        const session = makeSession('历史对话')
        session.messages = old.messages.map(message => ({
          id: newMessageId(),
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content || ''),
          createdAt: message.createdAt || Date.now(),
          pending: false,
          error: String(message.error || ''),
        }))
        session.updatedAt = session.messages[session.messages.length - 1].createdAt || Date.now()
        state.sessions = [session]
        state.activeId = session.id
      }
    } catch {}
  }
  state.sessions = (state.sessions || []).map(session => ({
    ...session,
    title: cleanTitle(session.title),
    messages: (session.messages || []).map(message => ({ ...message, pending: false })),
    summary: String(session.summary || ''),
    summaryAt: session.summaryAt || null,
    summaryCount: Number(session.summaryCount) || 0,
    compactions: Number(session.compactions) || 0,
    context: session.context || null,
  }))
  if (state.sessions.length === 0) {
    const session = makeSession()
    state.sessions.push(session)
    state.activeId = session.id
  }
  if (!state.sessions.some(session => session.id === state.activeId)) state.activeId = state.sessions[0].id

  let writing = Promise.resolve()
  const persist = () => {
    writing = writing.then(async () => {
      const tmp = `${file}.tmp-${process.pid}`
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
      await fs.rename(tmp, file)
    }).catch(() => {})
    return writing
  }
  await persist()

  const find = (id) => state.sessions.find(session => session.id === id)
  const active = () => find(state.activeId) || state.sessions[0]

  return {
    state,
    summaries () {
      return [...state.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(summary)
    },
    activeId () {
      return state.activeId
    },
    session (id) {
      return find(id)
    },
    contextSummary (id) {
      const session = find(id) || active()
      return session
        ? { summary: session.summary || '', at: session.summaryAt || null, count: session.summaryCount || 0, compactions: session.compactions || 0 }
        : { summary: '', at: null, count: 0, compactions: 0 }
    },
    async setSummary (id, summaryText, { compactions, count } = {}) {
      const session = find(id) || active()
      if (!session) return false
      session.summary = String(summaryText || '')
      session.summaryAt = session.summary ? Date.now() : null
      if (Number.isFinite(count)) session.summaryCount = count
      if (Number.isFinite(compactions)) session.compactions = compactions
      session.updatedAt = Date.now()
      await persist()
      return true
    },
    context (id) {
      const session = find(id) || active()
      return session?.context || null
    },
    async setContext (id, context) {
      const session = find(id) || active()
      if (!session) return false
      session.context = context || null
      await persist()
      return true
    },
    messages (id) {
      const session = find(id || state.activeId) || active()
      return session ? session.messages.slice(-100) : []
    },
    async create (title = '新对话') {
      const session = makeSession(title)
      state.sessions.push(session)
      state.activeId = session.id
      await persist()
      return summary(session)
    },
    async select (id) {
      if (!find(id)) return false
      state.activeId = id
      await persist()
      return true
    },
    async rename (id, title) {
      const session = find(id)
      if (!session) return false
      session.title = cleanTitle(title)
      session.updatedAt = Date.now()
      await persist()
      return true
    },
    async remove (id) {
      const index = state.sessions.findIndex(session => session.id === id)
      if (index < 0) return false
      state.sessions.splice(index, 1)
      if (state.sessions.length === 0) state.sessions.push(makeSession())
      if (state.activeId === id || !find(state.activeId)) state.activeId = state.sessions[Math.min(index, state.sessions.length - 1)].id
      await persist()
      return true
    },
    async removeMany (ids = []) {
      const targets = new Set((ids || []).map(String))
      if (targets.size === 0) return 0
      const before = state.sessions.length
      state.sessions = state.sessions.filter(session => !targets.has(session.id))
      if (state.sessions.length === 0) state.sessions.push(makeSession())
      if (!find(state.activeId)) state.activeId = state.sessions[0].id
      await persist()
      return before - state.sessions.length
    },

    async append (sessionId, message = {}) {
      const session = find(sessionId || state.activeId) || active()
      if (!session) throw new Error('会话不存在')
      const item = {
        id: newMessageId(),
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: String(message.content || ''),
        createdAt: Date.now(),
        pending: Boolean(message.pending),
        error: String(message.error || ''),
      }
      session.messages.push(item)
      if (session.messages.length > 200) session.messages = session.messages.slice(-200)
      if (item.role === 'user' && (session.title === '新对话' || session.title === '历史对话')) {
        session.title = cleanTitle(item.content)
      }
      session.updatedAt = Date.now()
      await persist()
      return item
    },
    async update (sessionId, messageId, patch = {}) {
      const session = find(sessionId)
      if (!session) return undefined
      const item = session.messages.find(message => message.id === messageId)
      if (!item) return undefined
      Object.assign(item, patch)
      session.updatedAt = Date.now()
      await persist()
      return item
    },
    async clear (sessionId) {
      const session = find(sessionId || state.activeId)
      if (!session) return false
      session.messages = []
      session.summary = ''
      session.summaryAt = null
      session.summaryCount = 0
      session.compactions = 0
      session.context = null
      session.updatedAt = Date.now()
      await persist()
      return true
    },
    flush: persist,
  }
}
