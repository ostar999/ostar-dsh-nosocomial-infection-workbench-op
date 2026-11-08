/**
 * Case timeline and judgement windows derived from the extracted facts.
 *
 * Everything here is deterministic: dates and events come from the model's
 * structured facts (or from the material text), and windows are computed from
 * public rules (48h, 30/90 days, 14 days). Missing dates stay missing; the
 * function never invents an event to make a window look complete.
 */

const DAY = 24 * 60 * 60 * 1000

export function parseFacts (text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fenced ? fenced[1] : raw
  try { return JSON.parse(body) } catch { return null }
}

export function parseDate (value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const hour = Number(match[4] || 0)
  const minute = Number(match[5] || 0)
  const second = Number(match[6] || 0)
  const date = new Date(year, month, day, hour, minute, second)
  if (Number.isNaN(date.getTime())) return null
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

function addHours (date, hours) {
  if (!date) return null
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function addDays (date, days) {
  if (!date) return null
  return new Date(date.getTime() + days * DAY)
}

function diffText (from, to) {
  if (!from || !to) return ''
  const total = Math.abs(to.getTime() - from.getTime())
  const days = Math.floor(total / DAY)
  const hours = Math.floor((total % DAY) / (60 * 60 * 1000))
  const minutes = Math.floor((total % (60 * 60 * 1000)) / (60 * 1000))
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分`
  return `${minutes}分`
}

function iso (date) {
  return date ? date.toISOString() : null
}

function earliest (dates) {
  return dates.filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null
}

function candidatesBySite (candidates, pattern) {
  return candidates
    .map(item => ({ ...item, onset: parseDate(item.onset) }))
    .filter(item => item.onset && pattern.test(String(item.site || '')))
}

export function buildTimeline (facts) {
  if (!facts || typeof facts !== 'object') {
    return { generatedAt: new Date().toISOString(), events: [], episodes: [], windows: [], flags: [{ level: 'warn', text: '没有可用的结构化事实，请先完成综合分析。' }], anchors: {}, stats: { events: 0 } }
  }
  const patient = facts.patient || {}
  const admission = parseDate(patient.admission)
  const discharge = parseDate(patient.discharge)
  const candidates = Array.isArray(facts.infectionCandidates) ? facts.infectionCandidates : []
  const events = []
  const flags = []
  let missingDates = 0
  let seq = 0

  const push = (time, type, label, detail = '', extra = {}) => {
    const date = parseDate(time)
    if (!date) { if (time) missingDates++; return }
    events.push({ id: `e${++seq}`, time: iso(date), type, label, detail, ...extra })
  }

  if (admission) events.push({ id: `e${++seq}`, time: iso(admission), type: 'admission', label: '入院' })
  else flags.push({ level: 'warn', text: '缺少入院时间，无法计算 HAP/SSI 等时间窗。' })
  if (discharge) events.push({ id: `e${++seq}`, time: iso(discharge), type: 'discharge', label: '出院' })

  const devices = Array.isArray(facts.devices) ? facts.devices : []
  const episodes = devices.map((device, index) => {
    const start = parseDate(device.start)
    const end = parseDate(device.end)
    const type = String(device.type || '其他')
    if (start) push(start, 'device-start', `置入 ${type}`, device.note || '')
    if (end) push(end, 'device-end', `拔除 ${type}`, device.note || '')
    if (!start) flags.push({ level: 'warn', text: `${type} 缺少置入时间，窗口无法计算。` })
    if (start && !end) flags.push({ level: 'warn', text: `${type} 缺少拔除时间，窗口按出院日估算。` })
    return { id: `d${index}`, device: type, start, end, open: Boolean(start && !end), note: device.note || '' }
  })

  const surgeries = Array.isArray(facts.surgeries) ? facts.surgeries : []
  surgeries.forEach((surgery, index) => {
    const date = parseDate(surgery.date)
    if (date) push(date, 'surgery', `手术：${surgery.name || '未命名'}`, surgery.woundClass || '')
    else flags.push({ level: 'warn', text: `手术「${surgery.name || '未命名'}」缺少日期，SSI 窗口无法计算。` })
    surgery.__index = index
    surgery.__date = date
  })

  const cultures = Array.isArray(facts.cultures) ? facts.cultures : []
  cultures.forEach(culture => push(culture.date, 'culture', `培养：${culture.specimen || ''}`, [culture.organism, culture.cfu].filter(Boolean).join(' · ')))

  const antimicrobials = Array.isArray(facts.antimicrobials) ? facts.antimicrobials : []
  antimicrobials.forEach(item => {
    push(item.start, 'antibiotic-start', `抗菌药：${item.drug || ''}`, item.note || '')
    push(item.stop, 'antibiotic-stop', `停抗菌药：${item.drug || ''}`, item.note || '')
  })

  const symptoms = Array.isArray(facts.symptoms) ? facts.symptoms : []
  symptoms.forEach(item => push(item.date, 'symptom', item.symptom || '症状'))

  const imaging = Array.isArray(facts.imaging) ? facts.imaging : []
  imaging.forEach(item => push(item.date, 'imaging', `影像：${item.modality || ''}`, item.finding || ''))

  const labs = Array.isArray(facts.labs) ? facts.labs.slice(0, 80) : []
  labs.forEach(item => push(item.date, 'lab', `检验：${item.item || ''}`, [item.value, item.unit, item.flag].filter(Boolean).join(' ')))

  const vitals = Array.isArray(facts.vitals) ? facts.vitals.slice(0, 80) : []
  vitals.forEach(item => push(item.time, 'vital', '体温', item.tmax ? `${item.tmax}℃` : ''))

  const generic = Array.isArray(facts.timeline) ? facts.timeline : []
  generic.forEach(item => push(item.time, 'event', item.event || '事件'))

  candidates.forEach(item => {
    if (item.onset) push(item.onset, 'onset', `发病：${item.site || '感染'}`)
  })

  // Windows -----------------------------------------------------------------
  const windows = []
  const onsetFor = pattern => earliest(candidatesBySite(candidates, pattern).map(item => item.onset))
  const dischargeOrEnd = date => date || discharge
  const addWindow = ({ kind, label, start, end, onset, note = '', anchor = '' }) => {
    if (!start && !end) return
    let status = 'unknown'
    if (onset && start) status = onset < start ? 'before' : 'inside'
    if (onset && end && onset > end) status = 'after'
    windows.push({
      kind,
      label,
      start: iso(start),
      end: iso(end),
      onset: iso(onset),
      status,
      anchor,
      note,
      delta: onset && start ? diffText(start, onset) : '',
      remaining: onset && end && onset <= end ? diffText(onset, end) : '',
      over: onset && end && onset > end ? diffText(end, onset) : '',
    })
  }

  const ventilation = episodes.filter(item => /机械通气|呼吸机|有创通气/.test(item.device))
  const vapOnset = onsetFor(/肺|VAP|呼吸机|下呼吸道/)
  if (ventilation.length === 0) {
    addWindow({
      kind: 'HAP-48h', label: 'HAP：入院 48 小时后', anchor: '入院',
      start: admission ? addHours(admission, 48) : null, end: null,
      onset: vapOnset, note: '无有创通气记录；HAP 以入院 48 小时为界。',
    })
  }
  ventilation.forEach((episode, index) => {
    const start = addHours(episode.start, 48)
    const endBase = dischargeOrEnd(episode.end)
    addWindow({
      kind: 'VAP-48h',
      label: `VAP：机械通气 ${index + 1}`,
      anchor: '通气开始',
      start,
      end: endBase ? addHours(endBase, 48) : null,
      onset: vapOnset,
      note: episode.open ? '拔管时间缺失，终点按出院日估算。' : '以《WS/T 863-2025 呼吸机相关肺炎预防与控制标准》《呼吸机相关性肺炎预防、诊断和治疗指南（2013）》《中国成人医院获得性肺炎与呼吸机相关性肺炎诊断和治疗指南（2018年版）》的 48 小时定义为准。',
    })
  })

  const urinary = episodes.filter(item => /导尿/.test(item.device))
  const cautiOnset = onsetFor(/尿|CAUTI|泌尿/)
  urinary.forEach((episode, index) => {
    const endBase = dischargeOrEnd(episode.end)
    addWindow({
      kind: 'CAUTI',
      label: `CAUTI：导尿管 ${index + 1}`,
      anchor: '置管',
      start: episode.start,
      end: endBase ? addHours(endBase, 48) : null,
      onset: cautiOnset,
      note: episode.open ? '拔管时间缺失，终点按出院日估算。' : '拔管后超过 48 小时不再归因于导管。',
    })
  })

  const vascular = episodes.filter(item => /血管导管|中心静脉|深静脉|CVC|PICC|输液港/.test(item.device))
  const clabsiOnset = onsetFor(/血流|CLABSI|CRBSI|导管相关血流/)
  vascular.forEach((episode, index) => {
    const endBase = dischargeOrEnd(episode.end)
    addWindow({
      kind: 'CLABSI',
      label: `CLABSI：血管导管 ${index + 1}`,
      anchor: '置管',
      start: episode.start,
      end: endBase ? addHours(endBase, 48) : null,
      onset: clabsiOnset,
      note: episode.open ? '拔管时间缺失，终点按出院日估算。' : '拔管后超过 48 小时不再归因于导管。',
    })
  })

  const ssiOnset = onsetFor(/手术|切口|SSI|手术部位/)
  surgeries.forEach(surgery => {
    const date = surgery.__date
    if (!date) return
    const implant = surgery.implant === true || /有植入|植入物/.test(String(surgery.implant || ''))
    const unknown = surgery.implant === null || surgery.implant === undefined || surgery.implant === ''
    addWindow({
      kind: 'SSI-30d',
      label: `SSI：${surgery.name || '手术'}（30 天）`,
      anchor: '手术',
      start: date,
      end: addDays(date, 30),
      onset: ssiOnset,
      note: '表浅切口与无植入物深部/器官腔隙的观察窗。',
    })
    if (implant || unknown) {
      addWindow({
        kind: implant ? 'SSI-90d' : 'SSI-90d/1y',
        label: `SSI：${surgery.name || '手术'}（${implant ? '有植入物 90 天' : '植入物不明：90 天 / 1 年'}）`,
        anchor: '手术',
        start: date,
        end: addDays(date, implant ? 90 : 365),
        onset: ssiOnset,
        note: implant ? '《WS/T 861-2025 手术部位感染预防与控制标准》对植入物深部/器官腔隙采用 90 天。' : '《WS/T 861-2025 手术部位感染预防与控制标准》为 90 天，《卫医发[2001]2号 医院感染诊断标准（试行）》与《卫办医政发〔2010〕187号 外科手术部位感染预防与控制技术指南（试行）》为 1 年；报告需注明口径。',
      })
    }
    if (unknown) flags.push({ level: 'warn', text: `手术「${surgery.name || '未命名'}」植入物状态不明，SSI 时限需按 90 天/1 年两种口径核对。` })
  })

  candidates.map(item => ({ ...item, onset: parseDate(item.onset) }))
    .filter(item => item.onset)
    .slice(0, 3)
    .forEach((item, index) => {
      addWindow({
        kind: 'repeat-14d',
        label: `重复感染窗：${item.site || `感染 ${index + 1}`}`,
        anchor: '首次发病',
        start: item.onset,
        end: addDays(item.onset, 14),
        onset: null,
        note: '14 天内同部位同类型再次感染不另计为新感染。',
      })
    })

  if (candidates.length === 0) {
    flags.push({ level: 'warn', text: '未识别到发病时间，时间窗只显示可判定区间。' })
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  return {
    generatedAt: new Date().toISOString(),
    anchors: { admission: iso(admission), discharge: iso(discharge) },
    events,
    episodes: episodes.map(item => ({ ...item, start: iso(item.start), end: iso(item.end), startText: item.start ? item.start.toISOString() : null })),
    windows,
    flags,
    stats: { events: events.length, missingDates, episodes: episodes.length, windows: windows.length },
  }
}
