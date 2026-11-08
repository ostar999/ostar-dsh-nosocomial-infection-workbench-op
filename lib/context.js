/**
 * Lightweight context accounting for the standalone workbench.
 *
 * The provider tokenizer is not available in the browser build, so we use a
 * conservative character-based estimate: CJK text is treated as roughly one
 * token per character and Latin text as one token per four characters. This is
 * intentionally pessimistic; it makes compaction happen before the provider
 * rejects an over-long request.
 */

export function estimateTokens (value) {
  const text = String(value || '')
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (/[\u2e80-\u9fff\uf900-\ufaff]/u.test(char)) cjk += 1
    else other += 1
  }
  return Math.max(1, Math.ceil(cjk * 1.05 + other / 3.6))
}

export function contextWindowOf (target, fallback = 131072) {
  const window = Number(target?.contextWindow)
  return Number.isFinite(window) && window > 0 ? window : fallback
}

export function inputTokenBudget (target) {
  const window = contextWindowOf(target)
  const outputReserve = Math.min(Number(target?.defaultMaxTokens) || 8192, 32768)
  return Math.max(8192, window - outputReserve - 2048)
}

/** Convert a token budget to a conservative character budget. */
export function inputCharBudget (target, cap) {
  const budget = Math.floor(inputTokenBudget(target) / 1.05)
  return Math.max(12000, Math.min(Number(cap) || budget, budget))
}

export function contextReport ({ target, sections, outputTokens = 0 }) {
  const contextWindow = contextWindowOf(target)
  const items = sections
    .filter(section => Number(section.tokens) > 0)
    .map(section => ({ key: section.key, label: section.label, tokens: Math.round(section.tokens) }))
  const usedTokens = items.reduce((sum, item) => sum + item.tokens, 0)
  return {
    contextWindow,
    usedTokens,
    remainingTokens: Math.max(0, contextWindow - usedTokens),
    percent: Math.min(100, Math.round((usedTokens / contextWindow) * 1000) / 10),
    outputTokens: Math.round(outputTokens || 0),
    sections: items,
    estimated: true,
  }
}

export function joinSummary (existing, addition) {
  const parts = [String(existing || '').trim(), String(addition || '').trim()].filter(Boolean)
  return parts.join('\n\n')
}
