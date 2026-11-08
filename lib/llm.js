/**
 * Model access for the workbench.
 *
 * Every call goes through the Host `llm` service — the only supported path into
 * provider adapters. The target model is the configured override, else the
 * user's default model, else the first model any registered provider offers.
 */

const TARGET_TTL_MS = 5000

function failureMessage (failure) {
  if (!failure) return '模型调用失败'
  const code = failure.code ? `${failure.code}` : ''
  const status = failure.status ? ` HTTP ${failure.status}` : ''
  return `${failure.message || '模型调用失败'}${code || status ? `（${code}${status}）` : ''}`
}

/** Resolve the provider/model pair to use, with a short-lived cache. */
export function createModelResolver ({ getLlm, getDefaultSelection, getSavedSelection, config, logger = console }) {
  let cached = null
  let cachedAt = 0

  async function resolve () {
    const now = Date.now()
    if (cached !== null && now - cachedAt < TARGET_TTL_MS) return cached
    const llm = getLlm()
    if (!llm) throw new Error('Host 未提供 llm 服务，无法调用模型')
    const providers = llm.listProviders()
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new Error('当前 Host 没有可用的模型提供方，请先在设置中配置模型')
    }
    const configured = String(config.provider || '').trim()
    const configuredModel = String(config.model || '').trim()
    let selection = null
    try { selection = getDefaultSelection?.() ?? null } catch {}
    let saved = null
    try { saved = getSavedSelection?.() ?? null } catch {}
    const candidates = []
    if (saved?.provider) candidates.push({ provider: saved.provider, model: saved.model || '', origin: 'user-selection', reasoningEffort: saved.reasoningEffort })
    if (configured) candidates.push({ provider: configured, model: configuredModel, origin: 'plugin-config' })
    if (selection?.provider) candidates.push({ provider: selection.provider, model: selection.model || '', origin: 'host-default', reasoningEffort: selection.reasoningEffort })
    for (const provider of providers) candidates.push({ provider: provider.id, model: '', origin: 'first-provider' })

    let lastError = null
    for (const candidate of candidates) {
      const providerId = candidate.provider
      if (!providers.some(p => p.id === providerId)) {
        if (candidate.origin === 'plugin-config') lastError = new Error(`插件配置的 provider「${providerId}」未注册`)
        continue
      }
      try {
        const models = await llm.listModels(providerId)
        const list = Array.isArray(models) ? models : []
        if (list.length === 0) {
          if (candidate.origin === 'plugin-config') lastError = new Error(`provider「${providerId}」未返回可用模型`)
          continue
        }
        const wanted = candidate.model && list.find(m => m.id === candidate.model)
        const model = wanted || list[0]
        let info = null
        try { info = await llm.resolveModelInfo(providerId, model.id) } catch {}
        const providerName = providers.find(p => p.id === providerId)?.name || providerId
        const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
        const effortIds = efforts.map(effort => effort.id)
        let effort = candidate.reasoningEffort
        if (effort && !effortIds.includes(effort)) effort = undefined
        if (!effort && selection?.provider === providerId && effortIds.includes(selection.reasoningEffort)) {
          effort = selection.reasoningEffort
        }
        if (!effort) effort = info?.reasoning?.defaultEffort
        if (effort && !effortIds.includes(effort)) effort = undefined
        cached = {
          provider: providerId,
          providerName,
          model: model.id,
          modelName: model.name || model.id,
          reasoningEffort: effort,
          defaultMaxTokens: info?.defaultMaxTokens ?? undefined,
          contextWindow: info?.context?.contextWindow ?? undefined,
          efforts: effortIds,
          effortOptions: efforts.map(item => ({ id: item.id, name: item.name || item.id })),
          defaultEffort: info?.reasoning?.defaultEffort,
          leastEffort: efforts.length > 0 ? efforts[0].id : undefined,
          origin: candidate.origin,
        }
        cachedAt = now
        return cached
      } catch (error) {
        lastError = error
        logger.warn?.(`[infection-workbench] 解析模型失败（${providerId}）：${error?.message || error}`)
      }
    }
    throw lastError || new Error('没有可用的模型')
  }

  return { resolve, invalidate () { cached = null; cachedAt = 0 } }
}

/**
 * Stream one completion and return the assembled text.
 *
 * @param {object} params
 * @param {object} params.llm Host llm service
 * @param {{provider: string, model: string}} params.target resolved model target
 * @param {string} params.system system prompt
 * @param {Array<{role: string, content: Array<{type: string, text: string}>}>} params.messages
 * @param {number} [params.maxTokens]
 * @param {AbortSignal} [params.signal]
 * @param {(delta: string, full: string) => void} [params.onDelta]
 */
export async function complete ({
  llm,
  target,
  system,
  messages,
  maxTokens,
  signal,
  onDelta,
  onReasoning,
  reasoningEffort,
}) {
  const options = {
    provider: target.provider,
    model: target.model,
    messages,
  }
  if (system) options.system = system
  if (signal) options.signal = signal
  const effort = reasoningEffort ?? target.reasoningEffort
  if (effort) options.reasoningEffort = effort
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    options.maxTokens = Math.round(maxTokens)
  }
  let text = ''
  let reasoning = ''
  let usage = null
  let failure = null
  let finishKind = null
  const stream = llm.stream(options)
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta') {
      const delta = String(chunk.text ?? '')
      if (delta) {
        text += delta
        onDelta?.(delta, text)
      }
    } else if (chunk.type === 'reasoning-delta') {
      const delta = String(chunk.text ?? '')
      if (delta) {
        reasoning += delta
        onReasoning?.(delta, reasoning)
      }
    } else if (chunk.type === 'usage') {
      usage = {
        inputTokens: chunk.usage?.inputTokens ?? 0,
        outputTokens: chunk.usage?.outputTokens ?? 0,
        totalTokens: chunk.usage?.totalTokens ?? undefined,
        cacheReadTokens: chunk.usage?.cacheReadTokens ?? undefined,
      }
    } else if (chunk.type === 'finish') {
      finishKind = chunk.reason?.kind ?? null
      if (chunk.reason?.kind === 'error') failure = chunk.reason.failure
      if (chunk.reason?.kind === 'aborted') failure = chunk.reason.failure || { message: '已取消' }
    }
  }
  if (finishKind === 'error' || finishKind === 'aborted') {
    const error = new Error(failureMessage(failure))
    error.code = failure?.code || finishKind
    error.name = finishKind === 'aborted' ? 'AbortError' : 'ModelError'
    throw error
  }
  return { text, usage, finish: finishKind, reasoningChars: reasoning.length }
}

/** A minimal escaping helper for prompts built from clinical text. */
export function fence (text, lang = '') {
  const body = String(text ?? '')
  const longest = (body.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0)
  const ticks = '`'.repeat(Math.max(3, longest + 1))
  return `${ticks}${lang}\n${body}\n${ticks}`
}
