/**
 * AI 院感分析工作台 — Host half.
 *
 * Registers one HTTP prefix route that serves the workbench panel, owns the
 * durable task store, extracts imported materials, and runs the analysis /
 * Q&A pipeline against the Host `llm` service. The Client half renders the
 * panel and talks to this route with same-origin fetches.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createStore } from './lib/store.js'
import { loadSkill, createStandardReader } from './lib/prompt.js'
import { createModelResolver } from './lib/llm.js'
import { createModelSettings } from './lib/settings.js'
import { createCitationLookup } from './lib/citation-cards.js'
import { createAssistantStore } from './lib/assistant.js'
import { createEngine } from './lib/analysis.js'
import { createHandler, API_PREFIX } from './lib/server.js'
import { createEnvironment } from './lib/environment.js'
import { importFolder } from './lib/import.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VERSION = '2.17.4'

const DEFAULTS = {
  dataDir: '',
  provider: '',
  model: '',
  materialChars: 260_000,
  standardsChars: 420_000,
  chatChars: 420_000,
  standardsMode: 'full',
}

function normalizeConfig (input) {
  const config = { ...DEFAULTS, ...(input && typeof input === 'object' ? input : {}) }
  const clamp = (value, min, max, fallback) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  }
  config.dataDir = String(config.dataDir || '').trim()
  config.provider = String(config.provider || '').trim()
  config.model = String(config.model || '').trim()
  config.materialChars = clamp(config.materialChars, 20_000, 900_000, DEFAULTS.materialChars)
  config.standardsChars = clamp(config.standardsChars, 20_000, 900_000, DEFAULTS.standardsChars)
  config.chatChars = clamp(config.chatChars, 20_000, 900_000, DEFAULTS.chatChars)
  config.standardsMode = config.standardsMode === 'full' ? 'full' : 'core'
  return config
}

function resolveDataDir (configured) {
  if (configured) return path.resolve(configured)
  const profile = process.env.DSH_PROFILE_DIR
  if (profile) return path.join(profile, 'data', 'infection-workbench')
  return path.join(os.homedir(), '.dsh', 'data', 'infection-workbench')
}

/** Host plugin entry. */
export function apply (ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const logger = console
  let services = null
  let ready = null
  let modelSettings = null

  const getLlm = () => ctx.get('llm')
  const getDefaultSelection = () => {
    const service = ctx.get('agentDefaultModel')
    if (!service || typeof service.currentSelection !== 'function') return null
    try { return service.currentSelection() } catch { return null }
  }
  const getConnection = () => ctx.get('connection')

  const resolver = createModelResolver({ getLlm, getDefaultSelection, getSavedSelection: () => modelSettings?.get() ?? null, config, logger })

  let catalogCache = { at: 0, value: null }

  /** Provider/model catalog advertised by the Host, plus the active selection. */
  async function getModelCatalog ({ force = false } = {}) {
    const now = Date.now()
    if (!force && catalogCache.value && now - catalogCache.at < 30_000) return catalogCache.value
    const llm = getLlm()
    if (!llm) throw new Error('Host 未提供 llm 服务，无法读取模型列表')
    const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : []
    const out = []
    for (const provider of providers) {
      let models = []
      try {
        models = await llm.listModels(provider.id)
      } catch (error) {
        logger.warn?.(`[infection-workbench] 读取模型列表失败（${provider.id}）：${error?.message || error}`)
        continue
      }
      const entries = []
      for (const model of Array.isArray(models) ? models : []) {
        let info = null
        try { info = await llm.resolveModelInfo(provider.id, model.id) } catch {}
        const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
        entries.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: info?.context?.contextWindow ?? undefined,
          defaultMaxTokens: info?.defaultMaxTokens ?? undefined,
          efforts: efforts.map(effort => ({ id: effort.id, name: effort.name || effort.id })),
          defaultEffort: info?.reasoning?.defaultEffort,
        })
      }
      out.push({ id: provider.id, name: provider.name || provider.id, models: entries })
    }
    const value = { providers: out, selection: await resolver.resolve() }
    catalogCache = { at: now, value }
    return value
  }

  /** Persist the user's model/effort choice for this profile. */
  async function selectModel (input) {
    const providerId = String(input?.provider || '').trim()
    const modelId = String(input?.model || '').trim()
    const effort = String(input?.reasoningEffort || '').trim()
    if (!providerId || !modelId) throw Object.assign(new Error('请选择模型'), { status: 400 })
    const catalog = await getModelCatalog({ force: true })
    const provider = catalog.providers.find(item => item.id === providerId)
    if (!provider) throw Object.assign(new Error('该模型提供方当前不可用'), { status: 400 })
    const model = provider.models.find(item => item.id === modelId)
    if (!model) throw Object.assign(new Error('该模型当前不可用'), { status: 400 })
    const allowed = model.efforts.map(item => item.id)
    if (effort && !allowed.includes(effort)) throw Object.assign(new Error('该模型不支持所选思考等级'), { status: 400 })
    const next = { provider: providerId, model: modelId }
    if (effort) next.reasoningEffort = effort
    else if (model.defaultEffort) next.reasoningEffort = model.defaultEffort
    await modelSettings.save(next)
    resolver.invalidate()
    catalogCache = { at: 0, value: null }
    return resolver.resolve()
  }

  async function init () {
    const dataDir = resolveDataDir(config.dataDir)
    await fs.mkdir(dataDir, { recursive: true })
    modelSettings = await createModelSettings({ dataDir, logger })
    const skillDir = path.join(HERE, 'skill')
    const skill = await loadSkill(skillDir)
    if (skill.warnings.length > 0) {
      logger.warn?.(`[infection-workbench] skill 资源不完整：${skill.warnings.join('；')}`)
    }
    const store = await createStore({ dataDir, logger })
    const readStandard = createStandardReader(skill)
    const lookupCitation = createCitationLookup(skill.citationCards || [])
    const assistantStore = await createAssistantStore({ dataDir })
    const engine = createEngine({
      store,
      assistantStore,
      skill,
      readStandard,
      config,
      resolveTarget: () => resolver.resolve(),
      getLlm,
      getWeb: () => ctx.get('web'),
      getOfficeToPdf: () => ctx.get('officeToPdf'),
      logger,
    })
    const environment = createEnvironment({
      pluginRoot: HERE,
      getOfficeToPdf: () => ctx.get('officeToPdf'),
      version: VERSION,
    })
    services = { dataDir, skill, store, engine, readStandard, environment }
    const handler = createHandler({
      store,
      engine,
      getConnection,
      getModelTarget: () => resolver.resolve(),
      getModelCatalog,
      selectModel,
      lookupCitation,
      skill,
      version: VERSION,
      getOfficeToPdf: () => ctx.get('officeToPdf'),
      environment,
    })
    return { ...services, handler }
  }

  function ensure () {
    if (ready === null) {
      ready = init().catch((error) => {
        ready = null
        throw error
      })
    }
    return ready
  }

  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer
    const dispose = webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req, res) => {
        ensure()
          .then(({ handler }) => handler(req, res))
          .catch((error) => {
            logger.error?.(`[infection-workbench] 初始化失败：${error?.message || error}`)
            if (!res.headersSent) {
              res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            }
            res.end(JSON.stringify({ error: `工作台初始化失败：${String(error?.message || error)}` }))
          })
      },
    })
    return () => {
      dispose()
      if (services) {
        services.engine.dispose()
        void services.store.flush()
      }
    }
  })

  // Expose the same operations to the agent, so a chat can drive the workbench
  // without the panel.
  ctx.inject(['tools'], (scoped) => {
    const dispose = scoped.tools.register({
      name: 'infection_workbench',
      description: 'AI 院感分析工作台：按病例管理任务，导入诊疗材料，运行院感分析并读取报告。'
        + ' action=list_tasks 列出全部任务；create_task 新建任务；import_folder 从本机文件夹批量导入材料；'
        + ' analyze 启动一次综合分析（异步，返回 jobId）；job 查询分析/问答进度；get_task 读取任务详情与报告；'
        + ' ask 就某个病例提问（异步，返回 jobId）；export 导出报告（md/html/txt/docx/pdf）。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_tasks', 'create_task', 'import_folder', 'analyze', 'job', 'get_task', 'ask', 'export', 'diagnostics'],
            description: '要执行的操作',
          },
          taskId: { type: 'string', description: '任务 id（list_tasks 返回）' },
          title: { type: 'string', description: 'create_task：任务标题（通常是患者/病例标识）' },
          patientName: { type: 'string', description: 'create_task：患者姓名或住院号' },
          dir: { type: 'string', description: 'import_folder：材料所在文件夹的绝对路径' },
          focus: { type: 'string', description: 'analyze：本次分析特别关注的问题（可选）' },
          jobId: { type: 'string', description: 'job：要查询的 job id' },
          question: { type: 'string', description: 'ask：要追问的问题' },
          formats: {
            type: 'array',
            items: { type: 'string', enum: ['md', 'html', 'txt', 'docx', 'pdf'] },
            description: 'export：要导出的格式，默认全部',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{
          type: 'text',
          text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        }],
      },
      async execute (args) {
        const input = args && typeof args === 'object' ? args : {}
        const action = String(input.action || '')
        const servicesNow = await ensure()
        const { store, engine } = servicesNow
        switch (action) {
          case 'list_tasks':
            return { tasks: store.list() }
          case 'create_task': {
            const task = await store.create({ title: input.title, patientName: input.patientName })
            return { task: { id: task.id, title: task.title, patientName: task.patientName } }
          }
          case 'import_folder': {
            const taskId = String(input.taskId || '')
            const task = store.get(taskId)
            if (!task) return { error: `任务不存在：${taskId}` }
            const dir = String(input.dir || '').trim()
            if (!path.isAbsolute(dir)) return { error: 'dir 必须是绝对路径' }
            return await importFolder(store, taskId, dir)
          }
          case 'analyze': {
            const job = engine.startAnalysis(String(input.taskId || ''), { focus: input.focus })
            return { jobId: job.id, status: job.status, hint: '分析在后台运行，用 action=job 与 jobId 查询进度，完成后用 get_task 读取报告' }
          }
          case 'job': {
            const job = engine.job(String(input.jobId || ''))
            if (!job) return { error: '没有该 job（可能已过期或任务已结束）' }
            return { job: { id: job.id, status: job.status, stage: job.stage, stages: job.stages, error: job.error, chars: (job.text || '').length } }
          }
          case 'get_task': {
            const task = store.get(String(input.taskId || ''))
            if (!task) return { error: '任务不存在' }
            let report = ''
            try { report = await fs.readFile(store.reportPath(task.id, 'md'), 'utf8') } catch {}
            return {
              task: { id: task.id, title: task.title, patientName: task.patientName, note: task.note },
              materials: task.materials.map(m => ({ id: m.id, name: m.name, chars: m.chars, status: m.status, error: m.error })),
              analysis: task.analysis,
              report,
              chat: task.chat.slice(-8),
            }
          }
          case 'export': {
            const taskId = String(input.taskId || '')
            const task = store.get(taskId)
            if (!task) return { error: `任务不存在：${taskId}` }
            const formats = Array.isArray(input.formats) && input.formats.length > 0
              ? input.formats.map(String)
              : ['md', 'html', 'txt', 'docx', 'pdf']
            const files = []
            const warnings = []
            for (const format of formats) {
              try {
                const file = await engine.ensureExport(taskId, format)
                const stat = await fs.stat(file)
                files.push({ format, path: file, bytes: stat.size })
              } catch (error) {
                warnings.push(`${format}: ${String(error?.message || error)}`)
              }
            }
            return { files, warnings }
          }
          case 'diagnostics': {
            let model = null
            try {
              // Optional model fields can be undefined; strip them so the tool
              // payload stays valid JSON for every provider.
              model = JSON.parse(JSON.stringify(await resolver.resolve()))
            } catch (error) { model = { error: String(error?.message || error) } }
            let client = null
            try {
              const modules = ctx.get('clientModules')
              if (modules) {
                const id = 'ostar-dsh-nosocomial-infection-workbench-op'
                client = {
                  bundlePath: typeof modules.clientPath === 'function' ? modules.clientPath(id) ?? null : null,
                  rebuiltRevision: typeof modules.rebuilt === 'function' ? modules.rebuilt(id) ?? null : null,
                }
              }
            } catch (error) {
              client = { error: String(error?.message || error) }
            }
            return {
              version: VERSION,
              model,
              client,
              dataDir: servicesNow.dataDir,
              skill: {
                name: servicesNow.skill.name,
                version: servicesNow.skill.version,
                standards: servicesNow.skill.standards.length,
                displayNames: Object.keys(servicesNow.skill.displayNames || {}).length,
                citations: (servicesNow.skill.citationCards || []).length,
                warnings: servicesNow.skill.warnings,
              },
              config: { materialChars: config.materialChars, standardsChars: config.standardsChars, chatChars: config.chatChars, standardsMode: config.standardsMode },
            }
          }
          case 'ask': {
            const job = engine.startChat(String(input.taskId || ''), input.question)
            return { jobId: job.id, status: job.status, hint: '回答在后台生成，用 action=job 查询进度，完成后用 get_task 读取 chat' }
          }
          default:
            return { error: `未知操作：${action}` }
        }
      },
    })
    return dispose
  })

}
