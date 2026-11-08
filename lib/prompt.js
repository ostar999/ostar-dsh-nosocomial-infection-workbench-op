/**
 * Prompt assembly.
 *
 * The diagnosis skill is a directory of rules and standard texts. The workbench
 * reads it once at startup and composes prompts from it, so the report can cite
 * the same file names and clause numbers the skill itself requires.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/** Standards always worth their tokens: judgement, diagnosis, devices, SSI. */
const EXCLUDED_STANDARDS = new Set([
  // The public package ships interpretation files only; there are no hidden
  // full texts to exclude.
])

const CORE_STANDARDS = [
  'references/解读/解读_WS-T_857-2025_医院感染病例判定标准-通用原则.md',
  'references/解读/解读_三管感染诊断速查.md',
  'references/医院感染判定原则和诊断标准/卫医发[2001]2号_医院感染诊断标准(试行).md',
  'references/常见传染病潜伏期/2026-9-16_传染病潜伏期速查表.csv',
  'references/解读/解读_WS-T_861-2025_手术部位感染预防与控制标准.md',
  'references/外科手术部位感染相关/卫办医政发〔2010〕187号_外科手术部位感染预防与控制技术指南（试行）.md',
  'references/解读/解读_WS-T_863-2025_呼吸机相关肺炎预防与控制标准.md',
  'references/解读/解读_WS-T_862-2025_导尿管相关尿路感染预防与控制标准.md',
  'references/三管感染诊断相关_标准-论文-指南/导尿管相关尿路感染/卫办医政发〔2010〕187号_导尿管相关尿路感染预防与控制技术指南（试行）.md',
  'references/三管感染诊断相关_标准-论文-指南/血管导管相关感染/国卫办医函〔2021〕136号_血管导管相关感染预防与控制指南（2021年版）.md',
  'references/三管感染诊断相关_标准-论文-指南/血管导管相关感染/卫办医政发〔2010〕187号_导管相关血流感染预防与控制技术指南(试行).md',
  'references/解读/解读_WS-T_509—2016_重症监护病房医院感染预防与控制规范.md',
  'references/解读/解读_呼吸机相关性肺炎预防、诊断和治疗指南（2013）_《中华内科杂志》.md',
  'references/解读/解读_中国成人医院获得性肺炎与呼吸机相关性肺炎诊断和治疗指南（2018年版）_《中华结核和呼吸杂志》.md',
  'references/解读/解读_血管内导管相关性血流感染预防与诊治指南（2025）_《中华危重病急救医学》.md',
]

const RULE_FILES = ['rules/stage1_general.json', 'rules/stage3_special.json', 'rules/checklists.json', 'rules/scoring.json']

async function readIfExists (file) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return undefined
  }
}

async function listMarkdown (root, dir = '') {
  const out = []
  let entries = []
  try {
    entries = await fs.readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...await listMarkdown(root, rel))
    else if (/\.(md|csv)$/i.test(entry.name)) out.push(rel)
  }
  return out
}

/**
 * Load the skill directory: instructions, executable rule tables, and standards.
 * Missing files degrade to warnings so an incomplete skill copy still works.
 */
export async function loadSkill (skillDir) {
  const warnings = []
  const skillMd = await readIfExists(path.join(skillDir, 'SKILL.md'))
  if (skillMd === undefined) throw new Error(`未找到 skill 说明文件：${path.join(skillDir, 'SKILL.md')}`)
  const unquote = (value) => {
    const text = String(value || '').trim()
    const quoted = /^(['"])(.*)\1$/.exec(text)
    return quoted ? quoted[2].trim() : text
  }
  const nameMatch = /^name:\s*(.+)$/m.exec(skillMd)
  const versionMatch = /^version:\s*(.+)$/m.exec(skillMd)
  const rules = {}
  for (const rel of RULE_FILES) {
    const text = await readIfExists(path.join(skillDir, rel))
    if (text === undefined) {
      warnings.push(`缺少规则表 ${rel}`)
      continue
    }
    rules[path.basename(rel, '.json')] = text
  }
  let displayNames = {}
  let legacyNames = {}
  try {
    const doc = JSON.parse(await fs.readFile(path.join(skillDir, 'display-names.json'), 'utf8'))
    if (doc && typeof doc.names === 'object' && doc.names !== null) displayNames = doc.names
    if (doc && typeof doc._legacy === 'object' && doc._legacy !== null) legacyNames = doc._legacy
  } catch {
    warnings.push('缺少 display-names.json，报告引用名将退化为文件名')
  }
  // Old reports may still contain pre-2.0 paths; keep rewriting those too.
  const citationNames = { ...legacyNames, ...displayNames }
  let citationCards = []
  try {
    const doc = JSON.parse(await fs.readFile(path.join(skillDir, 'citations.json'), 'utf8'))
    if (doc && Array.isArray(doc.cards)) citationCards = doc.cards
  } catch {
    warnings.push('缺少 citations.json，引用追溯将只显示名称与条款')
  }
  const available = await listMarkdown(path.join(skillDir, 'references'))
  const coreSet = new Set(CORE_STANDARDS)
  const standards = []
  for (const rel of available) {
    const key = `references/${rel}`
    if (EXCLUDED_STANDARDS.has(key)) continue
    standards.push({ rel: key, core: coreSet.has(key), display: displayNames[key] || undefined })
  }
  const order = new Map(CORE_STANDARDS.map((rel, i) => [rel, i]))
  standards.sort((a, b) => {
    const ai = order.has(a.rel) ? order.get(a.rel) : 999
    const bi = order.has(b.rel) ? order.get(b.rel) : 999
    return ai - bi || a.rel.localeCompare(b.rel, 'zh')
  })
  return {
    dir: skillDir,
    name: unquote(nameMatch?.[1] || 'nosocomial-infection-workbench'),
    version: unquote(versionMatch?.[1] || ''),
    skillMd,
    rules,
    standards,
    displayNames,
    citationNames,
    citationCards,
    warnings,
  }
}

/** Read one standard's text on demand (cached). */
export function createStandardReader (skill) {
  const cache = new Map()
  return async function readStandard (rel) {
    if (cache.has(rel)) return cache.get(rel)
    const text = await readIfExists(path.join(skill.dir, rel))
    cache.set(rel, text)
    return text
  }
}

function ruleSection (skill) {
  const parts = []
  const order = ['stage1_general', 'stage3_special', 'checklists', 'scoring']
  for (const key of order) {
    const text = skill.rules[key]
    if (!text) continue
    const titles = {
      stage1_general: '阶段 1 通用判定层规则（857 条文转译，按此逐条核对；veto=true 命中即否决）',
      stage3_special: '阶段 3 专项深化层规则（三管 / SSI / 部位诊断条目）',
      checklists: '阶段 4 条目清单化评分：每类诊断的固定条目（gate / 临床层 / 病原学层 / 确证 / 辅助）',
      scoring: '阶段 4 评分公式、分级映射、区间规则与缺口处理',
    }
    parts.push(`## ${titles[key]}\n文件：rules/${key}.json\n\n${text.trim()}`)
  }
  return parts.join('\n\n')
}

/**
 * Build the standards pack: skill instructions, rule tables, then standards in
 * priority order until the character budget is exhausted.
 */
export async function buildStandardsPack (skill, { maxChars = 420000, mode = 'full', readStandard } = {}) {
  const blocks = []
  let used = 0
  const push = (label, content) => {
    if (!content) return
    if (used + content.length > maxChars) return false
    blocks.push(`${label}\n\n${content.trim()}`)
    used += content.length
    return true
  }
  push('# 一、工作方法（内部规范，必须遵守）', skill.skillMd)
  push('# 二、可执行规则表（判定与评分按此执行）', ruleSection(skill))
  const read = readStandard || (async () => undefined)
  const list = mode === 'full' ? skill.standards : skill.standards.filter(s => s.core)
  const skipped = []
  for (const entry of list) {
    const text = await read(entry.rel)
    if (!text) continue
    const label = entry.display
      ? `# 三、标准与指南原文\n## ${entry.rel}（报告引用名：《${entry.display}》）`
      : `# 三、标准与指南原文\n## 文件：${entry.rel}`
    if (!push(label, text)) skipped.push(entry.rel)
  }
  return {
    text: blocks.join('\n\n'),
    chars: used,
    skipped,
  }
}

const OUTPUT_CONTRACT = `# 四、输出规范（强制）

1. 严格按上文第 3.2 节的骨架输出 Markdown：一级标题「# 医院感染分析报告」，随后依次为「病例概览」「一、判定结论」「二、诊断结论」「三、可能性评估」「四、依据与来源」「五、信息缺口与建议」「六、声明」，顺序不可变。
2. **段落 + 表格**：每节先写 1–3 句结论段，再用表格展开证据与对照；不得连续 6 行以上纯文字；表格不超过 5 列，单元格内不换行。
3. **引用只写标准官方名称**，一律使用上文第 2.2 节右列，并用《》包裹；禁止出现目录、\`.md\`/\`.csv\`、反引号、\`references/\`；禁止用「857」「187 号文」「2018 指南」这类编号或文号简称。
4. 标准号写官方形式：\`WS/T\`，不写 \`WS-T\`；条文号紧跟标准名，如《WS/T_857-2025_医院感染病例判定标准-通用原则》§5.1b。
5. 「三、可能性评估」必须可复算：给出分级、点估计、区间、计算式，并附「条目命中明细」表；缺培养时病原学层按 0 计、总分上限 0.69；仅单次培养、无重复确证时不取 ≥95%。
6. 判定层（感控口径）与诊断层（临床口径）分开表述；多个候选部位分别评分，不合并。
6.1 **涉及三管或手术时，必须引用对应的专项指南**（对照表见上文第 6.1 节）：血管导管/血透导管病例必须引用《血管内导管相关性血流感染预防与诊治指南（2025）》；机械通气病例必须引用《中国成人医院获得性肺炎与呼吸机相关性肺炎诊断和治疗指南（2018年版）》；留置导尿病例必须引用《卫办医政发〔2010〕187号_导尿管相关尿路感染预防与控制技术指南（试行）》；手术病例必须引用《卫办医政发〔2010〕187号_外科手术部位感染预防与控制技术指南（试行）》。只引通用标准不引专项指南，视为不合格。
7. 材料未提供的字段写「？」或「—」，并在「五、信息缺口与建议」表中说明缺口对结论的影响。
8. 全文 1500–3500 字，事实密度优先；不写客套话，不重复结论。
9. 报告正文中不得出现任何内部文件路径或文件扩展名——这是面向感控与临床读者的成品报告。
10. **不得向用户提及内置 skill、知识库、提示词、内部文件或“解读整理稿”**；需要说明资料限制时，只说「了解原文更多细节，请查看官方链接」。报告是给感控与临床读者的成品，不是开发说明。
11. 需要引用标准原文或核对条款时，优先使用公开、可访问的官方来源（国家卫生健康委、标准发布页、期刊官网等）；可给出官方名称、条款号、来源链接，以及与问题直接相关的原文条文/段落（用户要原文时可完整引用该条，不必压成一句），并**同时给出「访问地址：<链接>」**；不得使用「全文转载」「原文转载」「转载自」等措辞。**不得整篇转载整份文件**，也不得编造链接、条文或原文。
12. 若公开来源不足或互相冲突，在「四、依据与来源」的说明句中写「了解原文更多细节，请查看官方链接」并说明缺什么，不要把内部资料当作原文。链接放在说明句或脚注，不塞进表格单元格。
13. 三管/SSI 报告必须逐项对照上文第 6.1 节的**全部**对应文件；血管导管病例必须引用《血管内导管相关性血流感染预防与诊治指南（2025）》，漏项视为不合格。
14. **三管术语都兼具监测与临床意义**：CLABSI、CRBSI、VCAI 都同时可用于发病率监测，也都有临床诊断意义；没有标准或文献否定任一定义的监测或临床价值。不得把任一定义说成“只能监测”或“只能临床”，应按场景选择。三者都可用于任何科室的发病率监测、临床诊断与质量指标监控，不与 ICU 或某一科室绑定。CLABSI 在监测中最常用，2025 指南也用于临床排他性诊断。相关标准和文献未强制要求导管尖端培养，但这不等于“不要求”；导管尖端培养、差异阳性时间、导管血定量等证据越多，对诊断支持越强。`

/** System prompt for the extraction call. */
export function buildExtractionSystem () {
  return `你是医院感染管理专职人员，负责把患者诊疗材料整理成结构化事实，供后续按标准判定使用。

要求：
- 只依据材料中明确出现的内容；材料未写的字段填 null，不要推测。
- 日期统一 YYYY-MM-DD（能到时分就写 YYYY-MM-DD HH:mm）；相对时间（"第3天"、"术后第5天"、"入院48h"）按材料中的锚点换算后写明换算结果，并在 note 中保留原文。
- 区分"事件发生时间"与"记录/创建时间"：病程记录正文内开头日期优先，落款/编辑时间仅作参考。
- 培养结果保留标本、菌种、定量计数（cfu/mL）与药敏；无定量就写 null。
- 把三管（机械通气/导尿管/血管导管）与手术（含植入物）的起止时间单独列出，这是判定必需信息。
- 候选感染部位只写材料支持的那几个，不要穷举。

只输出一个 \`\`\`json 代码块，结构如下（字段不可改名）：
{
  "patient": {"name": null, "sex": null, "age": null, "admission": null, "discharge": null, "department": null, "admissionDiagnosis": null, "underlyingDiseases": [], "riskFactors": []},
  "devices": [{"type": "机械通气|导尿管|血管导管|其他", "start": null, "end": null, "note": ""}],
  "surgeries": [{"name": "", "date": null, "woundClass": null, "implant": null, "implantDetail": null, "note": ""}],
  "vitals": [{"time": null, "tmax": null, "note": ""}],
  "labs": [{"date": null, "item": "", "value": "", "unit": "", "flag": "", "specimen": ""}],
  "cultures": [{"date": null, "specimen": "", "organism": "", "cfu": null, "susceptibility": "", "note": ""}],
  "imaging": [{"date": null, "modality": "", "finding": ""}],
  "symptoms": [{"date": null, "symptom": ""}],
  "antimicrobials": [{"start": null, "stop": null, "drug": "", "note": ""}],
  "timeline": [{"time": null, "event": ""}],
  "infectionCandidates": [{"site": "", "onset": null, "evidence": ""}],
  "gaps": ["影响判定的缺失信息"],
  "notes": ""
}
除该 JSON 代码块外不要输出任何文字。`
}

/** System prompt for the judgement/report call. */
export async function buildAnalysisSystem (skill, { maxChars = 420000, mode = 'full', readStandard } = {}) {
  const pack = await buildStandardsPack(skill, { maxChars, mode, readStandard })
  return {
    text: `你是资深医院感染管理专职人员与感染病学顾问。你正在为「AI 院感分析工作台」分析一个具体病例：必须按下列 skill 与标准逐条判定，不能凭印象下结论。

${pack.text}

${OUTPUT_CONTRACT}

${pack.skipped.length > 0 ? `\n# 五、本次未载入的标准（超出长度预算，引用时不要臆造其条文）\n${pack.skipped.map(rel => `- ${rel}`).join('\n')}\n` : ''}`,
    chars: pack.chars,
    skipped: pack.skipped,
  }
}

/** Build the per-file prompt dossier within a character budget. */
export function buildDossier (materials, { maxChars = 260000 } = {}) {
  const entries = materials
    .map(material => ({
      material,
      size: Math.max(1, material.text?.length || 0),
    }))
    .filter(entry => entry.material.text)

  const header = [
    '# 病例材料清单',
    ...materials.map((m, i) => {
      const status = m.status === 'parsed' ? '' : `（解析异常：${m.error || '未知错误'}）`
      const warn = m.warnings?.length ? `（提示：${m.warnings.join('；')}）` : ''
      return `${i + 1}. ${m.name} ｜ 格式 ${m.ext.replace('.', '').toUpperCase()} ｜ ${m.chars || 0} 字符${status}${warn}`
    }),
  ].join('\n')

  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  let budgets
  if (total <= maxChars) {
    budgets = entries.map(entry => entry.size)
  } else {
    const min = 3000
    const max = 60000
    budgets = entries.map(entry => Math.max(min, Math.min(max, Math.floor((maxChars * entry.size) / total))))
    let sum = budgets.reduce((a, b) => a + b, 0)
    let guard = 0
    while (sum > maxChars && guard++ < 50) {
      const excess = sum - maxChars
      const reducible = budgets
        .map((b, i) => ({ i, b }))
        .filter(({ b }) => b > min)
      if (reducible.length === 0) break
      const share = Math.ceil(excess / reducible.length)
      for (const { i, b } of reducible) {
        const next = Math.max(min, b - share)
        sum -= b - next
        budgets[i] = next
        if (sum <= maxChars) break
      }
    }
  }

  const body = entries.map((entry, index) => {
    const text = entry.material.text
    const budget = budgets[index]
    const clipped = text.length > budget
      ? `${text.slice(0, budget)}\n\n【本材料共 ${text.length} 字符，以上为前 ${budget} 字符；被截断部分未纳入本次分析】`
      : text
    return `## 材料 ${index + 1}：${entry.material.name}\n格式：${entry.material.ext.replace('.', '').toUpperCase()}；字符数：${text.length}\n\n${clipped}`
  })

  return {
    header,
    text: `${header}\n\n# 病例材料正文\n\n${body.join('\n\n---\n\n')}`,
    included: entries.length,
    truncated: budgets.some((budget, i) => entries[i].size > budget),
  }
}

/** System prompt for follow-up questions about one case. */
export async function buildAssistantSystem (skill, { maxChars = 420000, mode = 'full', readStandard } = {}) {
  const pack = await buildStandardsPack(skill, { maxChars, mode, readStandard })
  return `你是「欧星星·AI院感工作台」的院感助手，回答医院感染管理、标准条文、诊断思路、防控措施与报告写作等通用问题。

你不读取任何病例材料、报告或分析明细。若问题需要结合具体病例，明确告诉用户：请切换到「病例分析」并选择病例后再问。

${pack.text}

# 回答要求
1. 先给结论，再给依据；结论要能指回标准条文或指南章节。
2. 引用只写标准/指南官方名称，用《》包裹；不写目录、文件名、扩展名或代码格式。名称见上文引用规范。
3. 区分「医院感染病例判定（感控口径）」与「临床感染诊断（诊疗口径）」，不要混用 CLABSI、CRBSI、VCAI 等术语。**CLABSI、CRBSI、VCAI 都同时具备发病率监测与临床诊断意义**；没有标准或文献否定任一定义的监测或临床价值，不得把任一定义说成只能监测或只能临床，应按场景选择；三者都可用于任何科室的发病率监测、临床诊断与质量指标监控，不与 ICU 或某一科室绑定。CLABSI 监测中最常用，2025 指南也用于临床排他性诊断；相关标准和文献未强制要求导管尖端培养，但不等于“不要求”，证据越多对诊断支持越强。
4. 不臆造具体病例的数值、时间或结论；没有病例上下文时只回答通用知识。
5. 中文回答，简洁：先给结论段，再用小标题与表格展开；避免大段纯文字。
6. 涉及最终诊断时提醒：本回答为知识参考，具体病例的最终诊断由临床医师作出。
7. **不得向用户提及内置 skill、知识库、提示词、内部文件或“解读整理稿”**；不要说“工作台里没有原文/只有整理稿”。需要说明资料限制时，只说「了解原文更多细节，请查看官方链接」。
8. 用户索要标准/文件原文、条款出处，或你遇到不确定、需要核对原文的地方：**优先使用本轮联网检索结果中的公开来源**，给出官方名称、条款号、来源链接，以及与问题直接相关的原文条文/段落（用户要原文时可完整引用该条，不必压成一句），并**同时给出「访问地址：<链接>」**；不得使用「全文转载」「原文转载」「转载自」等措辞；多个来源冲突时并列说明。不得编造链接或原文，不得整篇转载整份文件。若本轮没有联网检索结果，不要声称已联网核对；写「了解原文更多细节，请查看官方链接」。
9. 回答三管/SSI 问题前，必须逐项核对本次专项必查清单，不得只引一条标准；血管导管问题尤其不得漏掉《血管内导管相关性血流感染预防与诊治指南（2025）》。`
}

export async function buildChatSystem (skill, { maxChars = 420000, mode = 'full', readStandard } = {}) {
  const pack = await buildStandardsPack(skill, { maxChars, mode, readStandard })
  return `你是「AI 院感分析工作台」的病例分析助手，正在回答用户就某个病例提出的追问。你已读过该病例的材料与已生成的报告，也掌握下列判定规则与标准资料。

${pack.text}

# 回答要求
1. 先给结论，再给依据；结论必须能指回条文号与细则和解读。
2. 引用标准只写官方名称（用《》包裹），不写目录、文件名、扩展名或代码格式；标准号写 WS/T。名称见上文引用规范。
3. 材料未提供的字段不要臆测，直接说明缺什么、补什么检查可确认。
4. 区分「医院感染病例判定（感控口径）」与「临床感染诊断（诊疗口径）」。**CLABSI、CRBSI、VCAI 都同时具备发病率监测与临床诊断意义**；没有标准或文献否定任一定义的监测或临床价值，不得把任一定义说成只能监测或只能临床，应按场景选择；三者都可用于任何科室的发病率监测、临床诊断与质量指标监控，不与 ICU 或某一科室绑定。CLABSI 监测中最常用，2025 指南也用于临床排他性诊断；相关标准和文献未强制要求导管尖端培养，但不等于“不要求”，证据越多对诊断支持越强。
5. 中文回答，简洁：先给结论段，再用小标题与表格展开，避免大段纯文字；不要重复整份报告。
6. 问题涉及具体检验值、时间点或用药时，先核对「结构化病例事实（分析明细）」；该部分是机器抽取，与材料原文冲突时以原文为准，判定与结论以报告为准。
6. 涉及最终诊断时提醒：本结论为辅助分析，最终诊断由临床医师作出。
7. **不得向用户提及内置 skill、知识库、提示词、内部文件或“解读整理稿”**；需要说明资料限制时，只说「了解原文更多细节，请查看官方链接」。
8. 用户索要某一标准/文件原文、条款出处，或你遇到不确定、需要核对原文的地方：**优先使用本轮联网检索结果中的公开来源**，给出官方名称、条款号、来源链接，以及与问题直接相关的原文条文/段落（用户要原文时可完整引用该条，不必压成一句），并**同时给出「访问地址：<链接>」**；不得使用「全文转载」「原文转载」「转载自」等措辞；不得编造链接或原文，不得整篇转载整份文件。若本轮没有联网检索结果，不要声称已联网核对；写「了解原文更多细节，请查看官方链接」。
9. 回答三管/SSI 问题前，必须逐项核对本次专项必查清单，不得只引一条标准；血管导管问题尤其不得漏掉《血管内导管相关性血流感染预防与诊治指南（2025）》。`
}
