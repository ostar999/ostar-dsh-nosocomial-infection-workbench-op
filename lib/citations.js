/**
 * Citation rewriting for reader-facing text.
 *
 * The skill tells the model to cite standards by their official name, but a
 * model will still occasionally emit the internal path it was shown. This
 * module makes that impossible to reach the reader: every recognised file path
 * or file stem is rewritten to the display name from `skill/display-names.json`,
 * and any leftover `references/…md` path is reduced to its bare stem.
 */
import path from 'node:path'

const REPORT_HEADER = /\|\s*#\s*\|\s*结论点\s*\|\s*(?:标准|依据标准)\s*\|\s*条文\s*\|\s*(?:原文摘录|细则|细则和解读)\s*\|/g
const REPORT_HEADER_NEW = '| # | 结论点 | 依据标准 | 条文 | 细则和解读 |'

/** Keep the report's source table header current without touching the body. */
export function normalizeReportHeader (text) {
  return String(text ?? '').replace(REPORT_HEADER, REPORT_HEADER_NEW)
}

function escapeRegExp (value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Display name for a file that has no mapping: basename without extension. */
function fallbackName (filePath) {
  const base = path.basename(filePath).replace(/\.(md|csv|markdown|txt)$/i, '')
  return base.replace(/^WS-T[_\s-]?/, 'WS/T_')
}

const PATH_PATTERN = /(?:[^\s《》，。；：、（）()「」【】]+[/\\])+[^\s/\\《》，。；：、（）()「」【】]+\.(?:md|csv|markdown)/g

/**
 * @param {Record<string, string>} names internal relative path → display name
 */
export function createCitationHumanizer (names = {}) {
  const entries = Object.entries(names).filter(([rel, display]) => rel && display)
  const patterns = []
  for (const [rel, display] of entries) {
    const clean = rel.replace(/^\.\//, '')
    const basename = path.basename(clean)
    const keys = new Set([clean, basename, basename.replace(/\.(md|csv|markdown)$/i, '')])
    for (const key of keys) {
      if (key.length < 8) continue
      patterns.push({ key, display })
    }
  }
  // Longest key first: a full path must win over its own basename.
  patterns.sort((a, b) => b.key.length - a.key.length)

  const displayFor = (rel) => names[rel] || undefined

  function collapse (text) {
    return text.replace(/《《([^》]*)》》/g, '《$1》')
  }

  function humanize (input) {
    let text = String(input ?? '')
    if (!text) return text
    text = normalizeReportHeader(text)

    // 1. Backticked file references lose their code formatting first, so the
    //    replacement below does not leave stray backticks.
    text = text.replace(/`([^`\n]*(?:references\/|\.(?:md|csv))\b[^`\n]*)`/g, '$1')

    // 2. Known files → 《official name》. An existing 《…》 pair is reused
    //    rather than doubled.
    for (const { key, display } of patterns) {
      const escaped = escapeRegExp(key)
      text = text.replace(new RegExp(`《\\s*${escaped}\\s*》`, 'g'), `《${display}》`)
      text = text.replace(new RegExp(escaped, 'g'), `《${display}》`)
    }

    // 3. A mapped name the model wrote without brackets gets them back.
    for (const [, display] of entries) {
      const escaped = escapeRegExp(display)
      text = text.replace(new RegExp(`(?<!《)${escaped}(?!》)`, 'g'), `《${display}》`)
    }
    text = collapse(text)

    // Internal lookup tools are not documents; never surface their names.
    text = text.replace(/《?\s*(?:references\/[^\s《》]*?\/)?(?:2026[-_]?9[-_]?16[_-])?传染病潜伏期速查表(?:\s*（2026-09-16 版）)?(?:\.csv)?\s*》?/g, '相应病种的诊断标准或诊疗方案')
    text = collapse(text)

    // 4. Any remaining internal path becomes its stem: no directory, no
    //    extension, no backticks.
    text = text.replace(PATH_PATTERN, (whole) => `《${fallbackName(whole)}》`)
    text = collapse(text)

    // 5. Clean up the wrappers a path replacement can leave behind.
    text = text.replace(/`\s*《([^》]+)》\s*`/g, '《$1》')
    text = text.replace(/《\s*》/g, '')
    text = text.replace(/\.\/《/g, '《')

    // 6. Reader-facing output must not expose the internal knowledge layout.
    //    Keep the correction narrow: only internal-resource admissions.
    text = text.replace(/工作台(?:内|里)?[^。；\n]{0,40}(?:只有|仅有|没有|缺少)[^。；\n]{0,60}(?:原文|解读|整理稿|标准全文|期刊)[^。；\n]*/g, '了解原文更多细节，请查看官方链接。')
    text = text.replace(/(?:内置|内部)(?:\s*skill|知识库|提示词|解读稿|文件)[^。；\n]{0,60}/gi, '了解原文更多细节，请查看官方链接。')
    text = text.replace(/(?:该条)?(?:确切)?原文(?:措辞)?(?:在)?公开来源(?:暂未|待|无法)核实[。]?/g, '了解原文更多细节，请查看官方链接。')
    text = text.replace(/公开来源(?:暂未|待)核实/g, '了解原文更多细节，请查看官方链接。')
    text = text.replace(/无法核实原文/g, '了解原文更多细节，请查看官方链接。')
    // Keep CLABSI from being flattened into a pure surveillance metric.
    text = text.replace(/CLABSI([^。；\n]{0,40})不要求(?:做)?导管尖端培养/g, 'CLABSI$1未强制要求导管尖端培养；证据越多，对诊断支持越强')
    text = text.replace(/CLABSI([^。；\n]{0,30})(?:仅|只)(?:用于|是)(?:算|计算)?发病率(?:监测)?/g, 'CLABSI、CRBSI、VCAI 都可用于发病率监测，也都有临床诊断意义；按场景选择定义')
    text = text.replace(/这个\s*ICU\s*的?导管相关血流感染率/g, '这个科室/医院的导管相关血流感染率（ICU、普通病房等均适用）')
    text = text.replace(/该\s*ICU\s*的?导管相关血流感染率/g, '该科室/医院的导管相关血流感染率（ICU、普通病房等均适用）')
    text = text.replace(/\[(?:全文转载|原文转载|转载自)\]/g, '[访问地址]')
    text = text.replace(/(?:全文转载|原文转载|转载自)(?=\s*[：:]?\s*(?:https?:\/\/|www\.))/g, '访问地址')
    text = text.replace(/。{2,}/g, '。')
    return text
  }

  return { humanize, displayFor }
}
