/**
 * Citation trace cards.
 *
 * Cards contain only the official identifier, a short summary written for the
 * workbench, and an official link. No full text of standards or journal
 * articles is stored or served here.
 */

function normalizeName (value) {
  return String(value || '')
    .replace(/[\s_]/g, '')
    .replace(/[（）]/g, m => (m === '（' ? '(' : ')'))
    .replace(/[〔\[]/g, '[')
    .replace(/[〕\]]/g, ']')
    .toLowerCase()
}

function normalizeClause (value) {
  return String(value || '')
    .replace(/^§\s*/, '')
    .replace(/\s+/g, '')
}

export function createCitationLookup (cards = []) {
  const entries = cards.map(card => ({
    card,
    keys: [card.name, ...(card.aliases || [])].map(normalizeName).filter(Boolean),
  }))

  return function lookup (name, clause) {
    const requested = String(name || '').trim()
    const requestedClause = normalizeClause(clause)
    const entry = entries.find(item => item.keys.includes(normalizeName(requested)))
    if (!entry) {
      return {
        matched: false,
        officialName: requested,
        clause: clause || '',
        summary: '请以官方发布文本为准。',
        sourceType: null,
        url: null,
        clauseMatched: false,
        note: '',
      }
    }
    const card = entry.card
    const clauses = card.clauses || {}
    const clauseKey = Object.keys(clauses).find(key => normalizeClause(key) === requestedClause)
    return {
      matched: true,
      officialName: card.name,
      clause: clause || '',
      summary: clauseKey ? clauses[clauseKey] : card.summary,
      sourceType: card.sourceType || 'standard',
      url: card.url || null,
      urlLabel: card.urlLabel || '查看官方原文',
      urlAlt: card.urlAlt || null,
      urlAltLabel: card.urlAltLabel || '备用链接',
      catalogUrl: card.catalogUrl || null,
      catalogLabel: card.catalogLabel || '标准目录',
      clauseMatched: Boolean(clauseKey),
      localized: card.sourceType === 'government' || card.sourceType === 'data',
      note: card.sourceType === 'government'
        ? '政府文件'
        : card.sourceType === 'data'
          ? '数据表'
          : '解读分析',
    }
  }
}
