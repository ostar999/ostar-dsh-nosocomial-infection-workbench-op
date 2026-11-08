/**
 * AI 院感分析工作台 — Client half.
 *
 * A global panel (`main` key `infection-workbench`) reached from a sidebar
 * icon. It renders the task list, the material importer, the analysis pipeline
 * with its streamed report, and the per-case Q&A, all against the Host route
 * registered by this package's Host half.
 */
window.__ModuleLoader__.load({
  id: 'ostar-dsh-nosocomial-infection-workbench-op',
  factory (require) {
    const React = require('react')
    const h = React.createElement
    const {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React

    const NS = 'infection-workbench'
    const PANEL_ID = 'infection-workbench'
    const API = '/infection-workbench'
    const ACCEPT = '.xlsx,.docx,.csv,.md,.markdown,.txt,.pdf,.doc,.xls'
    const BATCH_CONCURRENCY_KEY = 'iw.batchConcurrency'
    const MAX_BATCH_CONCURRENCY = 16
    function readBatchConcurrency () {
      try {
        const value = Math.floor(Number(localStorage.getItem(BATCH_CONCURRENCY_KEY)))
        if (Number.isFinite(value) && value >= 1) return Math.min(value, MAX_BATCH_CONCURRENCY)
      } catch {}
      return 4
    }

    // Batch analysis lives outside the panel component: switching Harness
    // views unmounts the panel, but the queue must keep running and the next
    // mount must still see its progress.
    const batchRunStore = { value: null, listeners: new Set() }
    const batchCancelFlag = { current: false }
    function updateBatchRun (updater) {
      const next = typeof updater === 'function' ? updater(batchRunStore.value) : updater
      batchRunStore.value = next
      for (const listener of batchRunStore.listeners) listener(next)
    }

    // -----------------------------------------------------------------------
    // Copy
    // -----------------------------------------------------------------------

    const TEXT = {
      'app.title': ['欧星星·AI院感工作台', 'Ouxingxing · AI Infection Workbench'],
      'app.subtitle': ['你的院感助手', 'Your infection-control assistant'],
      'app.versionTitle': ['欧星星·AI院感工作台', 'Ouxingxing · AI Infection Workbench'],
      'env.open': ['环境检查与依赖', 'Environment & dependencies'],
      'env.title': ['环境检查与依赖', 'Environment & dependencies'],
      'env.checking': ['正在检查运行环境…', 'Checking environment…'],
      'env.refresh': ['重新检查', 'Recheck'],
      'env.close': ['关闭', 'Close'],
      'env.pdfjs': ['PDF.js（内置 PDF 解析）', 'PDF.js (built-in PDF parser)'],
      'env.poppler': ['poppler（可选，版式更好）', 'poppler (optional, better layout)'],
      'env.mutool': ['mutool（可选）', 'mutool (optional)'],
      'env.exportPdf': ['PDF 导出（Host officeToPdf）', 'PDF export (Host officeToPdf)'],
      'env.installed': ['已就绪', 'Ready'],
      'env.missing': ['未安装', 'Missing'],
      'env.optional': ['可选', 'Optional'],
      'env.install': ['一键安装', 'Install'],
      'env.installAll': ['一键安装缺失依赖', 'Install missing dependencies'],
      'env.noMissing': ['没有需要安装的依赖', 'No missing dependencies'],
      'env.running': ['安装中…', 'Installing…'],
      'env.done': ['安装完成', 'Installed'],
      'env.failed': ['安装失败', 'Install failed'],
      'env.log': ['安装日志', 'Install log'],
      'env.hint': ['PDF.js 随插件安装，跨平台可用。poppler 是可选增强：macOS 用 Homebrew，Linux 用系统包管理器，Windows 安装 Poppler 后把 pdftotext 加入 PATH。', 'PDF.js ships with the plugin and works cross-platform. poppler is optional: Homebrew on macOS, system packages on Linux, or Poppler for Windows with pdftotext on PATH.'],
      'env.legacyNote': ['.doc/.xls 不需要系统依赖，但解析会失败，请另存为 .docx/.xlsx。', '.doc/.xls need no system dependency, but parsing fails; save as .docx/.xlsx.'],
      'env.exportNote': ['PDF 导出优先使用 DSH Host 的 officeToPdf，不依赖外网。', 'PDF export uses the DSH Host officeToPdf service when available; it does not require internet.'],
      'env.command': ['命令', 'Command'],
      'env.noAutoInstall': ['当前平台不支持自动安装，请手动执行：', 'Automatic install is unavailable on this platform; run:'],
      'env.confirmInstall': ['将执行：{command}\n\n继续安装？', 'About to run: {command}\n\nContinue?'],
      'env.confirmAll': ['将依次执行：\n{commands}\n\n继续安装？', 'About to run:\n{commands}\n\nContinue?'],
      'model.selectTitle': ['选择模型', 'Model'],
      'model.effortTitle': ['思考等级', 'Reasoning effort'],
      'model.switched': ['已切换模型', 'Model updated'],
      'nav': ['欧星星·AI院感工作台', 'Ouxingxing · AI Infection Workbench'],
      'newTask': ['新建任务', 'New task'],
      'mode.cases': ['病例分析', 'Cases'],
      'mode.assistant': ['院感助手', 'Assistant'],
      'assistant.title': ['院感助手', 'Infection-control assistant'],
      'assistant.subtitle': ['通用知识问答 · 不读取病例材料', 'General knowledge · no case data'],
      'speed.note': ['（分析或回答速度，受模型性能影响）', '（Analysis or answer speed depends on model performance）'],
      'assistant.newChat': ['新对话', 'New chat'],
      'assistant.search': ['搜索对话…', 'Search conversations…'],
      'assistant.sort': ['排序', 'Sort'],
      'assistant.sortUpdated': ['最近更新', 'Recently updated'],
      'assistant.sortCreated': ['最近创建', 'Newest'],
      'assistant.sortTitle': ['名称 A→Z', 'Name A–Z'],
      'assistant.batchDelete': ['批量删除', 'Batch delete'],
      'assistant.batchExit': ['退出批量', 'Exit batch'],
      'assistant.selectAll': ['全选', 'Select all'],
      'assistant.selectedCount': ['已选', 'Selected'],
      'assistant.deleteSelectedConfirm': ['删除选中的会话', 'Delete selected sessions'],
      'assistant.status.running': ['正在回答', 'Answering'],
      'assistant.status.error': ['上次回答失败', 'Last answer failed'],
      'assistant.status.ready': ['已有对话', 'Has messages'],
      'assistant.status.idle': ['空对话', 'Empty'],
      'assistant.clearConfirm': ['清空当前助手的全部对话？', 'Clear the assistant conversation?'],
      'assistant.renamePrompt': ['会话名称', 'Session title'],
      'assistant.deleteConfirm': ['删除当前会话？', 'Delete this session?'],
      'assistant.export': ['导出', 'Export'],
      'assistant.exportTitle': ['导出对话', 'Export conversation'],
      'assistant.emptyTitle': ['有什么可以帮你？', 'How can I help?'],
      'assistant.emptyHint': ['可以问标准条文、诊断思路、防控措施、报告写作等通用问题。', 'Ask about standards, diagnosis, prevention, or report writing.'],
      'assistant.placeholder': ['输入院感问题…', 'Ask an infection-control question…'],
      'assistant.otherRunning': ['另一会话正在回答…', 'Another session is answering…'],
      'assistant.suggest.vap': ['VAP 的诊断标准是什么？', 'What are the VAP diagnostic criteria?'],
      'assistant.suggest.terms': ['CLABSI、CRBSI、VCAI 有什么区别？', 'How do CLABSI, CRBSI and VCAI differ?'],
      'assistant.suggest.ssi': ['SSI 的 30 天和 90 天怎么算？', 'How do the 30/90-day SSI windows work?'],
      'assistant.suggest.cauti': ['CAUTI 如何预防？', 'How can CAUTI be prevented?'],
      'assistant.suggest.report': ['院感分析报告应该怎么写？', 'How should an infection report be written?'],
      'refresh': ['刷新', 'Refresh'],
      'loading': ['正在加载…', 'Loading…'],
      'empty.title': ['还没有分析任务', 'No cases yet'],
      'empty.hint': ['新建一个任务，然后导入该病例的病程记录、检验、培养、影像等材料。', 'Create a task, then import the case records.'],
      'empty.select': ['从左侧选择一个任务，或新建任务', 'Select a task on the left, or create one'],
      'tasks': ['任务', 'Cases'],
      'search': ['搜索病例…', 'Search cases…'],
      'materials': ['诊疗材料', 'Materials'],
      'analysis': ['综合分析', 'Analysis'],
      'chat': ['病例问答', 'Q&A'],
      'importFiles': ['导入文件', 'Import files'],
      'importFolder': ['导入文件夹', 'Import folder'],
      'dropHint': ['拖拽文件或整个病例文件夹到此处，或点击「导入文件」；支持 xlsx、docx、csv、md、txt、pdf。旧版 .doc/.xls 可导入但会标记解析失败，请另存为 .docx/.xlsx；扫描件或图片型 PDF 不支持', 'Drop files or a case folder here, or Import files. Supports xlsx, docx, csv, md, txt, pdf. Legacy .doc/.xls import as parse failures; save them as .docx/.xlsx. Scanned or image-only PDFs are not supported'],
      'folderReading': ['正在读取文件夹…', 'Reading folder…'],
      'folderEmpty': ['文件夹内没有可导入的材料', 'No importable files in this folder'],
      'noMaterials': ['尚未导入材料。至少导入一份材料后才能开始分析。', 'No materials yet. Import at least one file to start.'],
      'material.name': ['文件', 'File'],
      'material.size': ['大小', 'Size'],
      'material.chars': ['字符', 'Chars'],
      'material.status': ['状态', 'Status'],
      'material.actions': ['操作', 'Actions'],
      'view': ['查看', 'View'],
      'download': ['下载', 'Download'],
      'delete': ['删除', 'Delete'],
      'deleteMaterialConfirm': ['删除这份材料？', 'Delete this material?'],
      'parsed': ['已解析', 'Parsed'],
      'failed': ['解析失败', 'Failed'],
      'analysis.start': ['开始综合分析', 'Start analysis'],
      'analysis.failedConfirm': ['当前有解析失败或不支持格式的文件：{files}。继续分析可能导致信息缺失，建议先转换为支持的格式。是否仍要继续分析？', 'Some files failed to parse or use an unsupported format: {files}. Continuing may leave information gaps; convert them to a supported format first. Continue anyway?'],
      'analysis.restart': ['重新分析', 'Analyse again'],
      'analysis.cancel': ['取消', 'Stop'],
      'analysis.cancelled': ['已取消', 'Stopped'],
      'analysis.cancelling': ['正在取消…', 'Cancelling…'],
      'analysis.retry': ['重新分析', 'Analyse again'],
      'analysis.idle': ['尚未分析', 'Not analysed'],
      'analysis.running': ['分析中', 'Running'],
      'analysis.done': ['已出报告', 'Report ready'],
      'analysis.error': ['分析失败', 'Failed'],
      'analysis.focus': ['本次关注点（可选）', 'Focus for this run (optional)'],
      'analysis.focusHint': ['例如：重点判断是否为 VAP；或核对 14 天重复感染窗口', 'e.g. check for VAP, or verify the 14-day window'],
      'analysis.model': ['模型', 'Model'],
      'analysis.report': ['分析报告', 'Report'],
      'analysis.copy': ['复制全文', 'Copy'],
      'analysis.downloadMd': ['下载 Markdown', 'Download MD'],
      'analysis.downloadHtml': ['下载 HTML', 'Download HTML'],
      'analysis.downloadTxt': ['下载 TXT', 'Download TXT'],
      'analysis.downloadDocx': ['下载 Word', 'Download Word'],
      'analysis.downloadPdf': ['下载 PDF', 'Download PDF'],
      'analysis.export': ['导出', 'Export'],
      'analysis.exportTitle': ['导出报告', 'Export report'],
      'export.selectAll': ['全选', 'Select all'],
      'export.exportSelected': ['导出选中', 'Export selected'],
      'export.format': ['导出格式', 'Formats'],
      'analysis.stages': ['分析步骤', 'Stages'],
      'analysis.streaming': ['生成中，可实时查看', 'Generating — live'],
      'analysis.empty': ['导入材料后点击「开始综合分析」，工作台会依次完成：材料整备 → 结构化事实抽取 → 按标准判定并生成报告。', 'Import materials, then start. The workbench assembles the dossier, extracts facts, then judges against the standards.'],
      'analysis.needMaterials': ['请先导入至少一份可解析的材料', 'Import at least one parsed material first'],
      'analysis.overview': ['分析概览', 'Overview'],
      'analysis.reasoning': ['模型推理中', 'Model is reasoning'],
      'analysis.live': ['运行进度', 'Run progress'],
      'analysis.elapsed': ['已运行', 'Elapsed'],
      'analysis.waiting': ['等待模型响应…', 'Waiting for the model…'],
      'analysis.factsHint': ['模型可能先思考再输出，收到内容会实时更新', 'The model may reason before emitting output'],
      'analysis.warnings': ['提示', 'Notes'],
      'analysis.factsOmitted': ['结构化事实未完整抽取，本次仅依据材料原文判定', 'Fact extraction incomplete — judging from source text'],
      'chat.placeholder': ['就这个病例提问，例如：为什么排除 CAUTI？', 'Ask about this case…'],
      'chat.send': ['发送', 'Send'],
      'chat.empty': ['还没有提问。可以问：判定依据、缺口、下一步检查、鉴别诊断。', 'No questions yet.'],
      'chat.export': ['导出', 'Export'],
      'chat.exportTitle': ['导出病例问答', 'Export case Q&A'],
      'chat.clear': ['清空对话', 'Clear'],
      'chat.clearConfirm': ['清空该病例的全部问答记录？', 'Clear every Q&A message for this case?'],
      'chat.thinking': ['正在组织回答…', 'Thinking…'],
      'timeline': ['时间线', 'Timeline'],
      'timeline.window': ['时间窗核对', 'Judgement windows'],
      'timeline.devices': ['器械时段', 'Device episodes'],
      'timeline.events': ['事件', 'Events'],
      'timeline.onset': ['发病时间', 'Onset'],
      'timeline.noOnset': ['发病时间未识别', 'Onset not identified'],
      'timeline.before': ['未到窗口起点', 'Before window'],
      'timeline.after': ['超出窗口终点', 'After window'],
      'timeline.inside': ['窗内', 'Inside'],
      'timeline.fromStart': ['距起点', 'From start'],
      'timeline.open': ['未记录结束', 'Open'],
      'timeline.estimated': ['按出院日估算', 'Estimated'],
      'timeline.noWindows': ['没有足够的日期计算时间窗', 'Not enough dates to compute windows'],
      'cite.title': ['引用追溯', 'Citation trace'],
      'cite.official': ['查看官方原文', 'Open official source'],
      'cite.loading': ['正在读取引用摘要…', 'Loading citation…'],
      'cite.note': ['解读分析', 'Analysis'],
      'cite.backup': ['备用链接', 'Alternative link'],
      'cite.catalog': ['标准目录', 'Standards catalog'],
      'cite.copyright': ['由于版权限制，不能对原文进行转载、分发、摘编；如需了解更多细节，请查看版权方原文。', 'Due to copyright restrictions, the original text cannot be reproduced, distributed, or excerpted; please consult the copyright holder for details.'],
      'task.edit': ['编辑信息', 'Edit'],
      'task.title': ['任务名称', 'Task title'],
      'task.patient': ['患者标识', 'Patient'],
      'task.sex': ['性别', 'Sex'],
      'task.age': ['年龄', 'Age'],
      'task.group': ['分组', 'Group'],
      'task.groupNew': ['新建分组…', 'New group…'],
      'task.groupNewPlaceholder': ['输入新分组名', 'New group name'],
      'task.renameGroup': ['重命名当前分组', 'Rename this group'],
      'task.rename': ['重命名', 'Rename'],
      'task.renamePlaceholder': ['新分组名', 'New group name'],
      'task.renameDone': ['分组已重命名', 'Group renamed'],
      'task.renameMergeConfirm': ['目标分组已存在，重命名后两个分组合并，是否继续？', 'Target group exists; merging groups. Continue?'],
      'task.ungrouped': ['未分组', 'Ungrouped'],
      'task.sort': ['排序', 'Sort'],
      'task.sortCreatedDesc': ['最近创建', 'Newest first'],
      'task.sortCreatedAsc': ['最早创建', 'Oldest first'],
      'task.sortUpdatedDesc': ['最近更新', 'Recently updated'],
      'task.sortTitle': ['名称 A→Z', 'Name A→Z'],
      'task.note': ['备注', 'Note'],
      'save': ['保存', 'Save'],
      'cancel': ['取消', 'Cancel'],
      'create': ['创建', 'Create'],
      'deleteTask': ['删除任务', 'Delete case'],
      'deleteTaskConfirm': ['删除该任务及其全部材料与报告？此操作不可恢复。', 'Delete this case with all materials and reports?'],
      'error': ['出错了', 'Error'],
      'retry': ['重试', 'Retry'],
      'updated': ['更新于', 'Updated'],
      'materialCount': ['份材料', 'materials'],
      'noReport': ['暂无报告', 'No report'],
      'confirm': ['确定', 'Confirm'],
      'close': ['关闭', 'Close'],
      'folder.hint': ['已在系统中选择文件夹后开始导入；若当前环境无法调起选择器，可手动输入绝对路径。', 'Pick a folder, or type an absolute path when no picker is available.'],
      'folder.path': ['文件夹绝对路径', 'Absolute folder path'],
      'import.start': ['开始导入', 'Start import'],
      'importing': ['正在导入…', 'Importing…'],
      'folderImporting': ['正在导入文件夹，文较多时可能需要一会儿…', 'Importing folder — this can take a moment'],
      'import.done': ['已导入', 'Imported'],
      'import.failed': ['失败', 'Failed'],
      'model.unavailable': ['模型不可用', 'Model unavailable'],
      'context.used': ['上下文已用', 'Context used'],
      'context.compacted': ['历史已压缩', 'History compacted'],
      'context.system': ['系统提示', 'System prompt'],
      'context.materials': ['病例材料', 'Materials'],
      'context.facts': ['分析明细', 'Facts'],
      'context.report': ['分析报告', 'Report'],
      'context.summary': ['历史摘要', 'Summary'],
      'context.history': ['最近对话', 'Recent messages'],
      'context.web': ['联网结果', 'Web results'],
      'context.question': ['本次问题', 'Question'],
      'run.idle': ['就绪', 'Ready'],
      'run.done': ['已完成', 'Done'],
      'run.rounds': ['轮', 'turns'],
      'run.steps': ['步', 'steps'],
      'run.usage': ['用量', 'Usage'],
      'run.cache': ['缓存命中', 'cache hit'],
      'run.cacheHint': ['缓存读取 / 输入总量（含缓存）', 'cache reads / total prompt'],
      'skill': ['诊断 skill', 'Diagnosis skill'],
      'noChatYet': ['暂无问答', 'No Q&A'],
      'you': ['你', 'You'],
      'assistant': ['分析助手', 'Analyst'],
      'excerpt': ['文本预览', 'Extracted text'],
      'noExcerpt': ['（没有可预览的文本）', '（No text）'],
      'showMore': ['展开', 'Expand'],
      'showLess': ['收起', 'Collapse'],
      'reportHint': ['报告已生成，可选择多种格式导出', 'Report ready — export in one or more formats'],
      'usage': ['用量', 'Usage'],
      'tokens': ['tokens', 'tokens'],
      'focus.none': ['未填写', 'None'],
      'stagesDone': ['全部完成', 'All done'],
      'draft': ['草稿', 'Draft'],
      'selectTask': ['选择任务', 'Select a case'],
      'chars': ['字符', 'chars'],
      'openReport': ['查看报告', 'Open report'],
      'batch.import': ['批量导入', 'Batch import'],
      'batch.hint': ['请先把每个病例的资料分别放进不同文件夹，再拖入或选择包含这些文件夹的上级目录。', 'Put each case in its own folder, then drop or choose the parent folder that contains them.'],
      'batch.scan': ['扫描文件夹', 'Scan folder'],
      'batch.scanning': ['正在扫描…', 'Scanning…'],
      'batch.cases': ['病例', 'Cases'],
      'batch.files': ['份材料', 'files'],
      'batch.selectAll': ['全选', 'Select all'],
      'batch.importSelected': ['导入选中', 'Import selected'],
      'batch.importing': ['正在导入…', 'Importing…'],
      'batch.noCases': ['没有找到含材料的病例文件夹', 'No case folders with materials found'],
      'batch.advance': ['批量分析', 'Batch analyse'],
      'batch.exit': ['退出批量', 'Exit batch'],
      'batch.selectedCount': ['已选', 'Selected'],
      'batch.start': ['开始分析', 'Start'],
      'batch.parallel': ['最高并行', 'Max parallel'],
      'batch.parallelHint': ['最高并发数（1–16），默认 4；越高越容易触发模型限流与费用增加', 'Max parallel tasks (1–16), default 4; higher values risk rate limits and cost'],
      'batch.parallelLimit': ['上限 16', 'Max 16'],
      'batch.parallelLimitHit': ['最高并行上限为 16，已按 16 执行', 'Max parallel is 16; using 16'],
      'batch.activeCount': ['进行中', 'running'],
      'batch.queued': ['排队中', 'Queued'],
      'batch.completed': ['已完成', 'Done'],
      'batch.total': ['共', 'of'],
      'batch.started': ['批量分析已开始', 'Batch analysis started'],
      'batch.delete': ['批量删除', 'Batch delete'],
      'batch.deleteTitle': ['批量删除任务', 'Batch delete cases'],
      'batch.deleteHint': ['勾选要删除的任务。删除后材料与报告一并移除，不可恢复。', 'Select the cases to delete. Materials and reports will be removed permanently.'],
      'batch.deleteEmpty': ['还没有任务', 'No cases yet'],
      'batch.deleting': ['正在删除…', 'Deleting…'],
      'batch.deleteConfirm': ['删除选中的任务及其全部材料与报告？此操作不可恢复。', 'Delete the selected cases with all materials and reports? This cannot be undone.'],
      'batch.deleteSelected': ['删除选中任务', 'Delete selected cases'],
      'batch.deleted': ['已删除选中任务', 'Selected cases deleted'],
      'batch.running': ['批量分析中', 'Batch running'],
      'batch.done': ['批量分析完成', 'Batch complete'],
      'batch.failedCount': ['失败', 'failed'],
      'batch.importDone': ['已导入', 'Imported'],
      'batch.importFailed': ['失败', 'failed'],
      'batch.step1': ['按病例分文件夹', 'One folder per case'],
      'batch.step1Desc': ['每个患者一个文件夹，文件夹名会成为任务名。', 'Each patient gets one folder; its name becomes the task title.'],
      'batch.step2': ['拖入 / 选择上级目录', 'Drop or choose the parent folder'],
      'batch.step2Desc': ['选择或拖入包含所有病例文件夹的那一层，不要直接选择某个患者文件夹。', 'Drop or choose the folder that contains all case folders, not a single patient folder.'],
      'batch.step3': ['勾选并导入', 'Select and import'],
      'batch.step3Desc': ['扫描后默认全选，可以取消不需要的病例。', 'All scanned cases are selected by default; deselect the ones you do not need.'],
      'batch.choose': ['选择文件夹', 'Choose folder'],
      'batch.pickerUnavailable': ['当前环境无法打开文件夹选择器，请把包含病例文件夹的上级目录拖入上方区域。', 'Folder picker unavailable. Drop the parent folder containing the case folders above.'],
      'batch.note': ['注意：拖入/选择的是包含病例文件夹的上级目录，不是单个病例文件夹；子文件夹名会成为任务名。', 'Drop or choose the parent folder that contains the case folders, not a single case folder; each subfolder name becomes a task title.'],
      'batch.dropHint': ['把包含病例文件夹的上级目录拖到这里', 'Drop the parent folder containing the case folders here'],
      'batch.dropSubhint': ['每个病例一个子文件夹，子文件夹名会成为任务名；也可以点下方按钮选择文件夹', 'One subfolder per case; its name becomes the task title. You can also use the button below.'],
      'batch.dropInvalid': ['没有找到病例文件夹。请拖入包含病例文件夹的上级目录，而不是单个病例文件夹或普通文件。', 'No case folders found. Drop the parent folder containing the case folders, not a single case folder or plain files.'],
      'batch.tree': ['病例资料/\n  张三/\n    病程记录.docx\n    检验.csv\n  李四/\n    病程记录.docx\n    培养.csv', 'cases/\n  ZhangSan/\n    notes.docx\n    labs.csv\n  LiSi/\n    notes.docx\n    culture.csv'],
    }

    const ZH = {}
    const EN = {}
    for (const [key, pair] of Object.entries(TEXT)) {
      ZH[key] = pair[0]
      EN[key] = pair[1]
    }

    // -----------------------------------------------------------------------
    // Icons
    // -----------------------------------------------------------------------

    const ICON_PATHS = {
      shield: [
        'M12 3 20 6v6.2c0 4.4-3.1 8.2-8 9.8-4.9-1.6-8-5.4-8-9.8V6l8-3Z',
        'M12 8v6M9 11h6',
      ],
      plus: ['M12 5v14M5 12h14'],
      refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
      files: ['M8 3h8l4 4v14H8z', 'M16 3v5h5'],
      folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
      upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
      trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6'],
      eye: ['M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'],
      download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
      send: ['M4 12 20 4l-6 16-3.2-7.2z'],
      check: ['M4 12.5 9 17.5 20 6.5'],
      alert: ['M12 4 2.5 20h19z', 'M12 10v4.5M12 17.2v.3'],
      spark: ['M12 2.6l1.9 5.9 5.9 1.9-5.9 1.9L12 18.2l-1.9-5.9L4.2 10.4l5.9-1.9z'],
      sliders: ['M4 7h16', 'M4 12h16', 'M4 17h16', 'M8 5v4', 'M15 10v4', 'M11 15v4'],
      chat: ['M4 5h16v11H9l-5 4z'],
      clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7.5V12l3 2'],
      close: ['M6 6l12 12M18 6 6 18'],
      copy: ['M9 9h10v10H9z', 'M15 5H5v10'],
      sort: ['M4 7h16', 'M7 12h10', 'M10 17h4'],
      layers: ['M12 3 3 8l9 5 9-5z', 'M3 13l9 5 9-5'],
      edit: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
      file: ['M7 3h7l4 4v14H7z', 'M14 3v5h4'],
      pause: ['M9 5v14M15 5v14'],
      chevron: ['M9 6l6 6-6 6'],
      info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v6M12 7.6v.4'],
    }

    function Icon ({ name, size = 16, className }) {
      const paths = ICON_PATHS[name] || ICON_PATHS.file
      const filled = name === 'spark'
      return h('svg', {
        className,
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: filled ? 'currentColor' : 'none',
        stroke: filled ? 'none' : 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, paths.map((d, i) => h('path', { key: i, d })))
    }

    function BrandIcon ({ size = 17 }) {
      // Same mark as icon.svg: gradient shield with a white five-point star.
      const shield = 'M12 3 20 6v6.2c0 4.4-3.1 8.2-8 9.8-4.9-1.6-8-5.4-8-9.8V6l8-3Z'
      const star = 'M12 6.41 13.28 10.05 17.14 10.14 14.07 12.48 15.17 16.18 12 13.99 8.83 16.18 9.93 12.48 6.86 10.14 10.72 10.05Z'
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('defs', null,
        h('linearGradient', { id: 'iwBrandShield', x1: '3', y1: '3', x2: '21', y2: '22', gradientUnits: 'userSpaceOnUse' },
          h('stop', { offset: '0', stopColor: '#2bb3a3' }),
          h('stop', { offset: '0.52', stopColor: '#1b7fb3' }),
          h('stop', { offset: '1', stopColor: '#2d5bb9' }))),
      h('path', { d: shield, fill: 'url(#iwBrandShield)' }),
      h('path', { d: star, fill: '#ffffff' }))
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const CSS = `
.iw-root {
  --iw-radius: 10px;
  --iw-accent: var(--dsw-alias-brand-primary, #1b7fb3);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: var(--dsh-content-font-size, 14px);
  padding-top: var(--dsh-frame-top-clearance, 0px);
}
.iw-root *, .iw-root *::before, .iw-root *::after { box-sizing: border-box; }
.iw-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px 13px;
  padding-left: calc(20px + var(--dsh-frame-leading-clearance, 0px));
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-base, #fff);
  flex: 0 0 auto;
}
.iw-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.iw-brand-mark {
  width: 38px; height: 38px;
  display: grid; place-items: center; flex: 0 0 auto;
  color: #fff;
  filter: drop-shadow(0 3px 7px rgba(27,127,179,.28));
}
.iw-brand-text { min-width: 0; }
.iw-brand-title { font-size: 15.5px; font-weight: 650; letter-spacing: .2px; line-height: 1.25; }
.iw-brand-sub { font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7683); line-height: 1.35; margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-header-spacer { flex: 1 1 auto; }
.iw-mode-switch { display: flex; gap: 2px; padding: 3px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2, #eef1f5); flex: 0 0 auto; }
.iw-mode-switch button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6b7683); font: inherit;
  font-size: 12px; padding: 5px 10px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
.iw-mode-switch button[data-active='true'] { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; box-shadow: 0 1px 3px rgba(16,24,40,.12); }
.iw-assistant { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 18px 22px 6px; gap: 12px; }
.iw-assistant-head { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.iw-assistant-title { font-size: 16px; font-weight: 650; }
.iw-assistant-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); margin-top: 2px; }
@keyframes iw-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.iw-assistant-dot { width: 7px; height: 7px; border-radius: 50%; background: #c3cad3; flex: 0 0 auto; margin-left: 7px; }
.iw-assistant-dot[data-status='ready'] { background: #2e9e5b; }
.iw-assistant-dot[data-status='error'] { background: #d9534f; }
.iw-assistant-dot[data-status='running'] { background: #2e9e5b; animation: iw-pulse 1.1s ease-in-out infinite; }
.iw-assistant-check { flex: 0 0 auto; margin: 0 2px 0 7px; accent-color: var(--iw-accent); }
.iw-assistant-empty-list { padding: 14px 10px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); line-height: 1.6; }
.iw-assistant-sessions { flex: 1 1 auto; overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 2px; margin: 2px 0 8px; }
.iw-assistant-session { display: flex; align-items: center; gap: 2px; border-radius: 7px; }
.iw-assistant-session[data-active='true'] { background: var(--dsw-alias-bg-layer-2, #eef2f6); }
.iw-assistant-session-main { flex: 1 1 auto; min-width: 0; border: 0; background: transparent; color: inherit; font: inherit;
  text-align: left; padding: 7px 8px; border-radius: 7px; cursor: pointer; }
.iw-assistant-session-main:disabled { cursor: default; opacity: .7; }
.iw-assistant-session-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-assistant-session-meta { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #6b7683); margin-top: 2px; }
.iw-assistant-session-actions { display: none; flex: 0 0 auto; gap: 1px; padding-right: 3px; }
.iw-assistant-session:hover .iw-assistant-session-actions { display: flex; }
.iw-assistant-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 30px 12px; }
.iw-export-formats { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
.iw-export-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
.iw-export-row input { accent-color: var(--iw-accent); }
.iw-assistant-suggestions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; max-width: 620px; margin-top: 6px; }
.iw-assistant-chip { border: 1px solid var(--dsw-alias-border-l1, #e6eaef); background: var(--dsw-alias-bg-layer-1, #fafbfc);
  color: inherit; font: inherit; font-size: 12px; padding: 7px 10px; border-radius: 999px; cursor: pointer; }
.iw-assistant-chip:hover { border-color: var(--iw-accent); color: var(--iw-accent); }
.iw-assistant-composer { flex: 0 0 auto; display: flex; flex-direction: column; gap: 5px; }
.iw-header-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.iw-body { flex: 1 1 auto; display: flex; min-height: 0; }
.iw-side {
  width: 300px; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-layer-1, #fafbfc);
}
.iw-side-head { padding: 12px 14px 8px; display: flex; flex-direction: column; gap: 9px; }
.iw-side-title { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-secondary, #6b7683);
  text-transform: uppercase; letter-spacing: .6px; }
.iw-search-row { display: flex; gap: 6px; align-items: center; }
.iw-search-row .iw-search { flex: 1 1 auto; min-width: 0; }
.iw-sort-wrap { position: relative; flex: 0 0 auto; }
.iw-sort-btn { width: 30px; height: 30px; padding: 0; justify-content: center; }
.iw-sort-menu { position: absolute; top: 35px; right: 0; z-index: 40; min-width: 150px; padding: 4px;
  border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1, #e6eaef); background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 10px 28px rgba(16,24,40,.18); }
.iw-sort-item { display: block; width: 100%; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent;
  text-align: left; font: inherit; font-size: 12px; color: inherit; cursor: pointer; white-space: nowrap; }
.iw-sort-item:hover { background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-sort-item[data-active='true'] { color: var(--iw-accent); font-weight: 600; }
.iw-link { border: 0; background: none; padding: 0; margin-top: 6px; color: var(--iw-accent);
  font: inherit; font-size: 11.5px; cursor: pointer; text-align: left; }
.iw-link:hover { text-decoration: underline; }
.iw-inline-group { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.iw-inline-group .iw-input { flex: 1 1 120px; }
.iw-group { display: flex; flex-direction: column; gap: 3px; margin-bottom: 5px; }
.iw-group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 7px 9px 3px; font-size: 10.5px; font-weight: 650; letter-spacing: .4px;
  color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-group-count { font-size: 10px; padding: 0 5px; border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-search {
  width: 100%; height: 30px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 12.5px;
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-base, #fff); color: inherit; outline: none;
}
.iw-search:focus {
  border-color: var(--iw-accent);
  box-shadow: 0 0 0 3px rgba(27,127,179,.14);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1b7fb3) 16%, transparent);
}
.iw-list { flex: 1 1 auto; overflow-y: auto; padding: 4px 8px 14px; display: flex; flex-direction: column; gap: 4px; }
.iw-card {
  text-align: left; width: 100%; font: inherit; color: inherit; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  border-radius: var(--iw-radius); padding: 9px 10px; display: flex; flex-direction: column; gap: 4px;
}
.iw-card:hover { background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-card[data-active='true'] {
  background: var(--dsw-alias-bg-layer-2, #f1f4f8);
  border-color: var(--dsw-alias-border-l2, #d5dbe3);
  box-shadow: inset 2px 0 0 var(--iw-accent), 0 1px 2px rgba(16,24,40,.06);
}
.iw-card-row { display: flex; align-items: center; gap: 7px; }
.iw-card-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; flex: 1 1 auto;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-card-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683);
  display: flex; gap: 8px; flex-wrap: wrap; }
.iw-card-wrap { display: flex; align-items: center; gap: 4px; }
.iw-card-wrap .iw-card { flex: 1 1 auto; min-width: 0; }
.iw-card-wrap[data-batch-active='true'] .iw-card {
  border-color: var(--iw-accent);
  background: rgba(27,127,179,.08);
}
.iw-card-wrap[data-batch-active='true'] .iw-card-title { color: var(--iw-accent); }
.iw-card-wrap[data-selected='true'] .iw-card { background: var(--dsw-alias-bg-layer-2, #f1f4f8); border-color: var(--iw-accent); }
.iw-card-check { width: 15px; height: 15px; flex: 0 0 auto; margin: 0 0 0 4px; accent-color: var(--iw-accent); }
.iw-side-actions { display: flex; gap: 6px; flex-wrap: nowrap; align-items: center; }
.iw-side-actions .iw-btn { flex: 1 1 0; min-width: 0; justify-content: center; font-size: 12px; padding-left: 4px; padding-right: 4px; }
.iw-side-actions .iw-icon-btn { flex: 0 0 32px; width: 32px; height: 30px; padding: 0; }
.iw-batch-bar { padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef); background: var(--dsw-alias-bg-layer-1, #fafbfc); }
.iw-batch-progress { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.iw-batch-row-top { display: flex; align-items: center; gap: 8px; }
.iw-batch-run-label { flex: 1 1 auto; font-weight: 600; }
.iw-batch-current { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-batch-track { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3, #e6eaef); overflow: hidden; }
.iw-batch-fill { height: 100%; border-radius: 999px; background: var(--iw-accent); transition: width .35s ease; }
.iw-batch-sub { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-env-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 12px; overflow: hidden; }
.iw-env-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef); }
.iw-env-row:last-child { border-bottom: 0; }
.iw-env-main { flex: 1; min-width: 0; }
.iw-env-name { font-size: 12.5px; font-weight: 600; }
.iw-env-detail { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7683); overflow-wrap: anywhere; }
.iw-env-command { max-width: 260px; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #6b7683); overflow-wrap: anywhere; }
.iw-env-job { margin-top: 12px; }
.iw-env-job-title { font-size: 12px; font-weight: 600; margin-bottom: 5px; }
.iw-env-log { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10.5px; line-height: 1.5; padding: 10px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2, #f4f6f8); }
.iw-batch-intro { display: flex; flex-direction: column; gap: 14px; }
.iw-batch-intro .iw-drop { margin: 0; padding: 16px; }
.iw-batch-intro .iw-batch-drop-title { font-size: 12.5px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2329); }
.iw-batch-intro .iw-batch-drop-sub { margin-top: 4px; font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-steps { display: flex; flex-direction: column; gap: 11px; }
.iw-batch-step { display: flex; gap: 10px; align-items: flex-start; }
.iw-batch-step-no { width: 22px; height: 22px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center;
  background: rgba(27,127,179,.12); color: var(--iw-accent); font-size: 11px; font-weight: 700; }
.iw-batch-step-title { font-size: 13px; font-weight: 600; line-height: 1.5; }
.iw-batch-step-desc { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-tree { margin: 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-layer-1, #fafbfc); font-size: 12px; line-height: 1.7; white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-note { font-size: 12px; line-height: 1.6; padding: 7px 10px; border-radius: 8px;
  background: rgba(224,139,0,.08); color: #8a5a00; }
.iw-batch-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.iw-batch-controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.iw-batch-concurrency { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-input { width: 48px; height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-base, #fff); color: inherit; font: inherit; font-size: 11.5px; text-align: center; padding: 0 2px; }
.iw-batch-select { height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-base, #fff); color: inherit; font: inherit; font-size: 11.5px; padding: 0 4px; }
.iw-batch-limit { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #6b7683); white-space: nowrap; }
.iw-batch-buttons { display: flex; gap: 6px; align-items: center; }
.iw-batch-banner { display: flex; align-items: center; gap: 10px; padding: 9px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: rgba(27,127,179,.07); flex: 0 0 auto; }
.iw-batch-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.iw-batch-banner-title { font-size: 12.5px; font-weight: 650; }
.iw-batch-banner-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-batch-modal { display: flex; flex-direction: column; gap: 12px; }
.iw-batch-hint { font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-path { font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #6b7683); word-break: break-all; }
.iw-batch-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
.iw-batch-all { display: flex; align-items: center; gap: 6px; }
.iw-batch-list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 9px; padding: 2px 10px; }
.iw-batch-row { display: flex; align-items: center; gap: 8px; padding: 8px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef); font-size: 12.5px; cursor: pointer; }
.iw-batch-row:last-child { border-bottom: 0; }
.iw-batch-row input { width: 15px; height: 15px; accent-color: var(--iw-accent); }
.iw-batch-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-batch-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-batch-loading { display: flex; align-items: center; gap: 8px; padding: 10px 0; font-size: 12.5px; }
.iw-batch-ignored { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-state-idle-primary, #98a2b3); }
.iw-dot[data-status='done'] { background: var(--dsw-alias-state-success-primary, #12a150); }
.iw-dot[data-status='running'] { background: var(--dsw-alias-state-warn-primary, #e08b00); animation: iw-pulse 1.4s ease-in-out infinite; }
.iw-dot[data-status='queued'] { background: var(--dsw-alias-state-warn-primary, #e08b00); opacity: .35; }
.iw-dot[data-status='error'] { background: var(--dsw-alias-state-error-primary, #d92d20); }
@keyframes iw-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

.iw-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; background: var(--dsw-alias-bg-base, #fff); }
.iw-empty {
  flex: 1 1 auto; display: grid; place-items: center; padding: 40px 24px; text-align: center;
}
.iw-empty-inner { max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.iw-empty-icon { width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center;
  color: #fff; background: var(--dsw-alias-bg-layer-2, #eef4f6); }
.iw-empty-title { font-size: 17px; font-weight: 650; }
.iw-empty-text { font-size: 13px; line-height: 1.65; color: var(--dsw-alias-label-secondary, #6b7683); }

.iw-detail-head { padding: 16px 22px 0; display: flex; flex-direction: column; gap: 12px; flex: 0 0 auto; }
.iw-detail-title-row { display: flex; align-items: flex-start; gap: 12px; }
.iw-detail-title { font-size: 19px; font-weight: 680; line-height: 1.3; margin: 0; min-width: 0;
  overflow-wrap: anywhere; }
.iw-detail-sub { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px;
  color: var(--dsw-alias-label-secondary, #6b7683); align-items: center; }
.iw-detail-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: auto; }
.iw-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef); }
.iw-tab {
  appearance: none; border: 0; background: transparent; font: inherit; cursor: pointer;
  padding: 9px 12px 10px; margin-bottom: -1px; color: var(--dsw-alias-label-secondary, #6b7683);
  border-bottom: 2px solid transparent; font-size: 13px; display: flex; align-items: center; gap: 6px;
}
.iw-tab:hover { color: var(--dsw-alias-label-primary, #1f2329); }
.iw-tab[data-active='true'] { color: var(--dsw-alias-label-primary, #1f2329); border-bottom-color: var(--iw-accent); font-weight: 600; }
.iw-tab-count { font-size: 11px; padding: 0 5px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #eef1f5);
  color: var(--dsw-alias-label-secondary, #6b7683); min-width: 18px; text-align: center; }
.iw-content { flex: 1 1 auto; overflow-y: auto; padding: 16px 22px 8px; min-height: 0; }

.iw-btn {
  appearance: none; font: inherit; font-size: 12.5px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 11px; border-radius: 8px; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l2, #d5dbe3);
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit;
  transition: background .12s ease, border-color .12s ease, opacity .12s ease;
}
.iw-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-btn:disabled { opacity: .5; cursor: default; }
.iw-btn[data-variant='primary'] {
  background: var(--dsw-alias-button-primary-fill, var(--iw-accent));
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 600;
}
.iw-btn[data-variant='primary']:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, var(--iw-accent));
}
.iw-btn[data-variant='primary']:disabled {
  background: var(--dsw-alias-button-primary-dimmed, var(--dsw-alias-bg-layer-2, #eef1f5));
  color: var(--dsw-alias-label-secondary, #6b7683);
  opacity: 1;
}
.iw-btn[data-variant='danger'] { color: var(--dsw-alias-state-error-primary, #d92d20); }
.iw-btn[data-variant='ghost'] { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-btn[data-variant='ghost']:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f1f4f8); color: var(--dsw-alias-label-primary, #1f2329); }
.iw-icon-btn { width: 28px; height: 28px; padding: 0; border-radius: 7px; }

.iw-chip {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px;
  border-radius: 6px; font-size: 11.5px; line-height: 1; white-space: nowrap;
  background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-secondary, #6b7683);
  border: 1px solid transparent;
}
.iw-chip[data-tone='accent'] { background: rgba(27,127,179,.1); color: #12688f; border-color: rgba(27,127,179,.18); }
.iw-chip[data-tone='success'] { background: rgba(18,161,80,.1); color: #0b7a3c; border-color: rgba(18,161,80,.18); }
.iw-chip[data-tone='warn'] { background: rgba(224,139,0,.12); color: #96600a; border-color: rgba(224,139,0,.2); }
.iw-chip[data-tone='error'] { background: rgba(217,45,32,.1); color: #b42318; border-color: rgba(217,45,32,.18); }
body[data-ds-dark-theme] .iw-chip[data-tone='accent'] { color: #7cc7e8; }
body[data-ds-dark-theme] .iw-chip[data-tone='success'] { color: #6fd39a; }
body[data-ds-dark-theme] .iw-window-card[data-status='before'] .iw-window-delta,
body[data-ds-dark-theme] .iw-window-card[data-status='after'] .iw-window-delta {
  color: #ffd84d;
}
body[data-ds-dark-theme] .iw-chip[data-tone='warn'] { color: #f0c169; }
body[data-ds-dark-theme] .iw-chip[data-tone='error'] { color: #f08f86; }

.iw-chip-button {
  border: 1px solid var(--dsw-alias-border-l2, #d5dbe3);
  background: var(--dsw-alias-bg-layer-2, #eef1f5);
  color: var(--dsw-alias-label-primary, #1f2329);
  cursor: pointer; font: inherit; font-size: 11.5px;
}
.iw-chip-button:hover { background: var(--dsw-alias-bg-layer-3, #e4e9f0); }
.iw-chip-extra { opacity: .72; }
.iw-model-group { display: flex; flex-direction: column; gap: 6px; }
.iw-model-group-title { font-size: 11.5px; font-weight: 700; color: var(--dsw-alias-label-secondary, #6b7683); letter-spacing: .02em; }
.iw-model-option {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1, #e3e8ef);
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
}
.iw-model-option:hover { border-color: var(--dsw-alias-border-l2, #d5dbe3); background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-model-option[data-active='true'] { border-color: var(--dsw-alias-brand-primary, #1f2329); background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-model-name { font-size: 12.5px; font-weight: 650; }
.iw-model-meta { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-effort-row { display: flex; flex-wrap: wrap; gap: 6px; }
.iw-effort {
  padding: 5px 10px; border-radius: 7px; cursor: pointer; font: inherit; font-size: 11.5px;
  border: 1px solid var(--dsw-alias-border-l1, #e3e8ef);
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #6b7683);
}
.iw-effort[data-active='true'] { border-color: var(--dsw-alias-brand-primary, #1f2329); color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-2, #f1f4f8); }
.iw-model-error { color: var(--dsw-alias-state-error-primary, #d92d20); font-size: 12px; }
.iw-select {
  height: 24px; border-radius: 6px; padding: 0 6px; max-width: 210px;
  border: 1px solid var(--dsw-alias-border-l2, #d5dbe3);
  background: var(--dsw-alias-bg-layer-2, #eef1f5);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit; font-size: 11.5px;
}
.iw-select:disabled { opacity: .55; }
.iw-effort-select { max-width: 100px; }
.iw-cite {
  border: 0; background: none; padding: 0; font: inherit; cursor: pointer;
  color: var(--iw-accent); text-decoration: underline; text-decoration-style: dotted;
  text-underline-offset: 2px;
}
.iw-cite:hover { background: rgba(27,127,179,.1); border-radius: 3px; }
.iw-cite-card { display: flex; flex-direction: column; gap: 10px; }
.iw-cite-name { font-size: 14px; font-weight: 650; }
.iw-cite-badge { align-self: flex-start; font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-cite-copyright { margin-top: 2px; padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef); font-size: 10.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-cite-links { display: flex; flex-wrap: wrap; gap: 14px; }
.iw-cite-summary { font-size: 13px; line-height: 1.75; }
.iw-cite-link { font-size: 12.5px; color: var(--iw-accent); }
.iw-timeline { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 24px; }
.iw-timeline-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.iw-timeline-title { font-size: 15px; margin: 0; }
.iw-timeline-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); margin-top: 3px; }
.iw-window-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.iw-window-card { border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 9px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; background: var(--dsw-alias-bg-layer-1, #fff); }
.iw-window-card[data-status='inside'] { border-color: rgba(18,161,80,.35); }
.iw-window-card[data-status='before'], .iw-window-card[data-status='after'] { border-color: rgba(224,139,0,.45); }
.iw-window-kind { font-size: 12.5px; font-weight: 650; }
.iw-window-range { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-window-meta { font-size: 11.5px; }
.iw-window-delta { font-size: 11.5px; color: var(--iw-accent); }
.iw-window-card[data-status='before'] .iw-window-delta, .iw-window-card[data-status='after'] .iw-window-delta { color: #b26a00; }
.iw-window-note { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7683); line-height: 1.5; }
.iw-tl-flags { display: flex; flex-direction: column; gap: 6px; }
.iw-tl-flag { font-size: 12px; padding: 7px 10px; border-radius: 8px; background: rgba(224,139,0,.1); color: #8a5a00; }
.iw-tl-section h3 { font-size: 12.5px; margin: 0 0 8px; }
.iw-tl-episodes { display: flex; flex-direction: column; gap: 6px; }
.iw-tl-episode { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 12px; padding: 7px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #f7f8fa); }
.iw-tl-episode-name { font-weight: 600; }
.iw-tl-episode-range { color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-tl-chip { font-size: 10.5px; padding: 1px 6px; border-radius: 999px; background: rgba(224,139,0,.14); color: #8a5a00; }
.iw-tl-list { display: flex; flex-direction: column; }
.iw-tl-item { display: grid; grid-template-columns: 92px 18px 1fr; gap: 8px; align-items: start; padding: 6px 0; }
.iw-tl-time { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); text-align: right; padding-top: 1px; }
.iw-tl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--iw-accent); margin: 5px auto 0; }
.iw-tl-item[data-type='onset'] .iw-tl-dot { background: #d92d20; }
.iw-tl-item[data-type='culture'] .iw-tl-dot { background: #12a150; }
.iw-tl-item[data-type='surgery'] .iw-tl-dot { background: #7b61ff; }
.iw-tl-label { font-size: 12.5px; }
.iw-tl-detail { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); margin-top: 2px; }
.iw-banner {
  display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: 9px;
  font-size: 12.5px; line-height: 1.55; margin-bottom: 14px;
  background: rgba(27,127,179,.07); border: 1px solid rgba(27,127,179,.18);
}
.iw-banner[data-tone='error'] { background: rgba(217,45,32,.06); border-color: rgba(217,45,32,.2); color: #b42318; }
.iw-banner[data-tone='warn'] { background: rgba(224,139,0,.08); border-color: rgba(224,139,0,.22); color: #96600a; }
body[data-ds-dark-theme] .iw-banner[data-tone='error'] { color: #f3a19a; }
body[data-ds-dark-theme] .iw-banner[data-tone='warn'] {
  color: var(--dsw-alias-label-primary, #eef3f6);
  background: rgba(224,139,0,.12);
  border-color: rgba(224,139,0,.32);
}
body[data-ds-dark-theme] .iw-batch-note,
body[data-ds-dark-theme] .iw-tl-flag {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(224,139,0,.32);
  color: var(--dsw-alias-label-primary, #eef3f6);
}
body[data-ds-dark-theme] .iw-tl-chip {
  background: rgba(255,255,255,.06);
  color: var(--dsw-alias-label-primary, #eef3f6);
}
body[data-ds-dark-theme] .iw-chip[data-tone='warn'] {
  color: var(--dsw-alias-label-primary, #eef3f6);
  background: rgba(224,139,0,.16);
  border-color: rgba(224,139,0,.32);
}
.iw-banner-body { flex: 1 1 auto; min-width: 0; }

.iw-drop {
  border: 1.5px dashed var(--dsw-alias-border-l2, #d5dbe3); border-radius: 12px;
  padding: 22px 18px; text-align: center; margin-bottom: 14px;
  color: var(--dsw-alias-label-secondary, #6b7683); font-size: 12.5px; line-height: 1.6;
  transition: border-color .15s, background .15s;
}
.iw-drop[data-over='true'] {
  border-color: var(--iw-accent);
  background: rgba(27,127,179,.05);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1b7fb3) 6%, transparent);
}
.iw-drop-actions { display: flex; gap: 8px; justify-content: center; margin-top: 11px; }

.iw-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.iw-toolbar-spacer { flex: 1 1 auto; }

.iw-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.iw-table th {
  text-align: left; font-weight: 600; font-size: 11.5px; letter-spacing: .3px;
  color: var(--dsw-alias-label-secondary, #6b7683); padding: 7px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef); white-space: nowrap;
}
.iw-table td { padding: 9px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef); vertical-align: middle; }
.iw-table tr:hover td { background: var(--dsw-alias-bg-layer-1, #fafbfc); }
.iw-file { display: flex; align-items: center; gap: 9px; min-width: 0; }
.iw-file-icon { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; flex: 0 0 auto;
  background: var(--dsw-alias-bg-layer-2, #eef1f5); color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-file-name { font-weight: 550; overflow-wrap: anywhere; }
.iw-file-rel { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7683); overflow-wrap: anywhere; }
.iw-row-actions { display: flex; gap: 2px; justify-content: flex-end; }
.iw-num { color: var(--dsw-alias-label-secondary, #6b7683); white-space: nowrap; font-variant-numeric: tabular-nums; }

.iw-section {
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 12px;
  padding: 15px 16px; margin-bottom: 14px; background: var(--dsw-alias-bg-layer-1, #fafbfc);
}
.iw-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.iw-section-head .iw-chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.iw-section-title { font-size: 13px; font-weight: 650; }
.iw-speed-note { margin-left: 8px; color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; font-weight: 400; }
.iw-section-spacer { flex: 1 1 auto; }
.iw-field { display: flex; flex-direction: column; gap: 5px; flex: 1 1 auto; min-width: 0; }
.iw-field-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-required { color: var(--dsw-alias-state-error-primary, #d92d20); margin-left: 3px; }
.iw-input, .iw-textarea {
  width: 100%; font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  background: var(--dsw-alias-bg-base, #fff); color: inherit; outline: none;
}
.iw-input:focus, .iw-textarea:focus {
  border-color: var(--iw-accent);
  box-shadow: 0 0 0 3px rgba(27,127,179,.14);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1b7fb3) 16%, transparent);
}
.iw-textarea { resize: vertical; min-height: 58px; line-height: 1.55; }
.iw-form-row { display: flex; gap: 10px; }
.iw-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); line-height: 1.5; }

.iw-stages { display: flex; flex-direction: column; gap: 7px; }
.iw-stage { display: flex; align-items: center; gap: 9px; font-size: 12.5px; }
.iw-stage-mark { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto;
  border: 1.5px solid var(--dsw-alias-border-l2, #d5dbe3); color: transparent; }
.iw-stage[data-status='running'] .iw-stage-mark { border-color: var(--dsw-alias-state-warn-primary, #e08b00); }
.iw-stage[data-status='done'] .iw-stage-mark { border-color: var(--dsw-alias-state-success-primary, #12a150);
  background: var(--dsw-alias-state-success-primary, #12a150); color: #fff; }
.iw-stage[data-status='error'] .iw-stage-mark { border-color: var(--dsw-alias-state-error-primary, #d92d20); color: var(--dsw-alias-state-error-primary, #d92d20); }
.iw-stage-label { flex: 0 0 auto; font-weight: 500; }
.iw-stage[data-status='pending'] .iw-stage-label { color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-stage-detail { color: var(--dsw-alias-label-secondary, #6b7683); font-size: 11.5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-spinner { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(224,139,0,.25);
  border-top-color: var(--dsw-alias-state-warn-primary, #e08b00); animation: iw-spin .8s linear infinite; }
@keyframes iw-spin { to { transform: rotate(360deg) } }
.iw-spinner[data-tone='accent'] { border-color: rgba(27,127,179,.2); border-top-color: var(--iw-accent); }
.iw-spinner[data-tone='muted'] { border-color: rgba(120,130,145,.2); border-top-color: var(--dsw-alias-label-secondary, #6b7683); }

.iw-stream {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere;
  max-height: 260px; overflow-y: auto; padding: 11px 12px; border-radius: 9px;
  background: var(--dsw-alias-bg-base, #fff); border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  color: var(--dsw-alias-label-secondary, #6b7683);
}

.iw-md { font-size: 13.5px; line-height: 1.75; overflow-wrap: anywhere; max-width: 1000px; }
.iw-md h1 { font-size: 20px; margin: 4px 0 10px; padding-bottom: 9px; border-bottom: 2px solid var(--iw-accent); }
.iw-md h2 { font-size: 16px; margin: 24px 0 9px; padding-left: 9px; border-left: 3.5px solid var(--iw-accent); }
.iw-md h3 { font-size: 14px; margin: 18px 0 7px; }
.iw-md h4 { font-size: 13px; margin: 14px 0 6px; }
.iw-md p { margin: 8px 0; }
.iw-md ul, .iw-md ol { margin: 8px 0; padding-left: 22px; }
.iw-md li { margin: 4px 0; }
.iw-md strong { font-weight: 650; }
.iw-md code { background: var(--dsw-alias-bg-layer-2, #eef1f5); border-radius: 4px; padding: 1px 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.iw-md pre { background: var(--dsw-alias-bg-layer-2, #eef1f5); border-radius: 8px; padding: 12px; overflow: auto; }
.iw-md pre code { background: none; padding: 0; }
.iw-md blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--dsw-alias-border-l2, #d5dbe3);
  color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-md hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef); margin: 18px 0; }
.iw-md .iw-table-wrap { overflow-x: auto; margin: 12px 0; border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 9px; }
.iw-md table { border-collapse: collapse; width: 100%; font-size: 12px; }
.iw-md th, .iw-md td { border-bottom: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  border-right: 1px solid var(--dsw-alias-border-l1, #e6eaef); padding: 7px 9px; text-align: left; vertical-align: top; }
.iw-md th { background: var(--dsw-alias-bg-layer-2, #f1f4f8); font-weight: 600; white-space: nowrap; }
.iw-md tr:last-child td { border-bottom: 0; }
.iw-md th:last-child, .iw-md td:last-child { border-right: 0; }

.iw-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.iw-chat-list { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 18px; }
.iw-msg { display: flex; flex-direction: column; gap: 5px; max-width: 100%; }
.iw-msg-head { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7683); }
.iw-msg-body { border-radius: 11px; padding: 11px 14px; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.iw-msg[data-role='user'] { align-items: flex-end; }
.iw-msg[data-role='user'] .iw-msg-body {
  background: var(--dsw-alias-button-primary-fill, var(--iw-accent));
  color: var(--dsw-alias-label-primary-inverted, #fff);
  max-width: 76%; white-space: pre-wrap;
}
.iw-msg[data-role='user'] .iw-msg-head { flex-direction: row-reverse; }
.iw-msg[data-role='assistant'] .iw-msg-body { background: var(--dsw-alias-bg-layer-1, #fafbfc);
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef); max-width: 100%; }
.iw-msg-error { color: var(--dsw-alias-state-error-primary, #d92d20); font-size: 11.5px; }
.iw-composer { flex: 0 0 auto; display: flex; gap: 9px; align-items: flex-end; padding: 12px 0 2px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef); }
.iw-composer .iw-textarea { min-height: 42px; max-height: 160px; resize: none; }
.iw-chat-empty { display: grid; place-items: center; height: 100%; color: var(--dsw-alias-label-secondary, #6b7683);
  font-size: 12.5px; text-align: center; padding: 30px; }

.iw-modal-mask {
  position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px;
  background: rgba(16,24,40,.42); backdrop-filter: blur(1.5px);
}
.iw-modal {
  width: min(560px, 100%); max-height: 86vh; overflow-y: auto;
  background: var(--dsw-alias-bg-layer-1, #fff); border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  box-shadow: 0 18px 48px rgba(16,24,40,.22); padding: 18px 20px 16px;
}
.iw-modal-title { font-size: 15px; font-weight: 650; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.iw-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.iw-modal-body { display: flex; flex-direction: column; gap: 12px; }
.iw-pre {
  white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.65;
  background: var(--dsw-alias-bg-layer-1, #fafbfc); border: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  border-radius: 9px; padding: 12px; max-height: 52vh; overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.iw-toast {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
  background: var(--dsw-alias-bg-overlay, #1f2329); color: var(--dsw-alias-label-primary, #fff);
  border: 1px solid var(--dsw-alias-border-l2, #d5dbe3); border-radius: 9px;
  padding: 9px 14px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(16,24,40,.18);
  display: flex; align-items: center; gap: 8px; z-index: 70; max-width: 80%;
}
.iw-toast[data-tone='error'] { border-color: var(--dsw-alias-state-error-primary, #d92d20); color: var(--dsw-alias-state-error-primary, #d92d20); }
.iw-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 900px) {
  .iw-side { width: 232px; }
  .iw-brand-sub { display: none; }
}
.iw-analysis-live {
  margin-top: 10px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e6eaef); border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1, #fafbfc);
}
.iw-analysis-live-head { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.iw-analysis-live-title { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }
.iw-analysis-live-elapsed { margin-left: auto; color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.iw-progress-track { position: relative; height: 5px; margin-top: 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3, #e6eaef); overflow: hidden; }
.iw-progress-fill { height: 100%; border-radius: 999px; background: var(--iw-accent); }
.iw-progress-indeterminate .iw-progress-fill { width: 34%; animation: iw-progress-slide 1.25s ease-in-out infinite; }
.iw-analysis-live-detail { margin-top: 7px; color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; line-height: 1.5; }
@keyframes iw-progress-slide {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
}
.iw-runbar-wrap { position: relative; flex: 0 0 auto; z-index: 4; }
.iw-run-bar {
  display: flex; align-items: center; gap: 10px; min-height: 30px;
  padding: 4px 6px 0; border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef);
  color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; white-space: nowrap;
}
.iw-run-main { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.iw-run-state { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }
.iw-run-stat { color: var(--dsw-alias-label-secondary, #6b7683); font-variant-numeric: tabular-nums; }
.iw-runbar-spacer { flex: 1; }
.iw-context-trigger {
  display: inline-grid; place-items: center; flex: 0 0 auto;
  border: 0; padding: 0; background: transparent; cursor: pointer;
}
.iw-context-ring {
  width: 27px; height: 27px; border-radius: 50%;
  background: conic-gradient(var(--iw-accent) var(--context-percent, 0%), var(--dsw-alias-bg-layer-3, #e6eaef) 0);
  display: grid; place-items: center;
}
.iw-context-ring-inner {
  width: 21px; height: 21px; border-radius: 50%; background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-secondary, #6b7683); font-size: 8px; font-weight: 600;
  display: grid; place-items: center; font-variant-numeric: tabular-nums;
}
.iw-context-popover {
  position: absolute; right: 0; bottom: calc(100% + 8px); width: min(340px, calc(100vw - 30px));
  padding: 12px 13px; border: 1px solid var(--dsw-alias-border-l2, #d9e0e8); border-radius: 11px;
  background: var(--dsw-alias-bg-base, #fff); box-shadow: 0 18px 50px rgba(16,24,40,.22);
  color: var(--dsw-alias-label-secondary, #6b7683);
}
.iw-context-popover-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.iw-context-popover-head .iw-context-title { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }
.iw-context-popover-head .iw-context-total { margin-left: auto; color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.iw-context-track { height: 5px; margin-top: 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3, #e6eaef); overflow: hidden; }
.iw-context-fill { height: 100%; border-radius: 999px; background: var(--iw-accent); }
.iw-context-fill[data-high='true'] { background: var(--dsw-alias-state-error-primary, #d92d20); }
.iw-context-section-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.iw-context-section-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.iw-context-section-name { color: var(--dsw-alias-label-primary, #1f2329); }
.iw-context-section-value { margin-left: auto; color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.iw-context-dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 auto; background: var(--iw-accent); }
.iw-context-dot[data-index='0'] { background: #98a3b3; }
.iw-context-dot[data-index='1'] { background: #a875ff; }
.iw-context-dot[data-index='2'] { background: #4f8dff; }
.iw-context-dot[data-index='3'] { background: #35c48b; }
.iw-context-popover-foot { display: flex; align-items: center; gap: 8px; margin-top: 11px; padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-l1, #e6eaef); color: var(--dsw-alias-label-secondary, #6b7683); font-size: 10px; }
.iw-context-compacted { color: #a66a00; border: 1px solid rgba(166,106,0,.25); background: rgba(166,106,0,.08); border-radius: 999px; padding: 1px 6px; font-size: 10px; }
@media (max-width: 640px) {
  .iw-run-bar { gap: 6px; }
  .iw-run-stat { display: none; }
}
`

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    function errorText (error) {
      if (!error) return '未知错误'
      return String(error.message || error)
    }

    async function request (path, options = {}) {
      const init = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' }
      if (options.json !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(options.json)
      } else if (options.body !== undefined) {
        init.body = options.body
      }
      const response = await fetch(API + path, init)
      const raw = await response.text()
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = { error: raw.slice(0, 400) }
      }
      if (!response.ok) {
        const error = new Error((data && data.error) || `请求失败（HTTP ${response.status}）`)
        error.status = response.status
        throw error
      }
      return data
    }

    function formatBytes (bytes) {
      const n = Number(bytes) || 0
      if (n < 1024) return `${n} B`
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
      return `${(n / 1024 / 1024).toFixed(1)} MB`
    }

    function formatTokens (value) {
      const n = Number(value) || 0
      if (n < 1000) return String(n)
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)}K`
      return `${(n / 1024 / 1024).toFixed(1)}M`
    }

    function fallbackContext ({ detail, messages, contextWindow }) {
      const estimate = chars => Math.ceil((Number(chars) || 0) / 1.3)
      const charsOf = items => (items || []).reduce((sum, item) => sum + (Number(item?.chars) || String(item || '').length), 0)
      const sections = []
      if (detail) {
        const materials = charsOf(detail.materials)
        const report = String(detail.report || '').length
        const facts = String(detail.analysis?.facts || '').length
        if (materials > 0) sections.push({ key: 'materials', label: '病例材料', tokens: estimate(materials) })
        if (facts > 0) sections.push({ key: 'facts', label: '分析明细', tokens: estimate(facts) })
        if (report > 0) sections.push({ key: 'report', label: '分析报告', tokens: estimate(report) })
      }
      const historyChars = (messages || []).reduce((sum, message) => sum + String(message?.content || '').length, 0)
      if (historyChars > 0) sections.push({ key: 'history', label: '最近对话', tokens: estimate(historyChars) })
      if (sections.length === 0) return null
      const window = Number(contextWindow) || 131072
      const usedTokens = sections.reduce((sum, section) => sum + section.tokens, 0)
      return {
        contextWindow: window,
        usedTokens,
        remainingTokens: Math.max(0, window - usedTokens),
        percent: Math.min(100, Math.round((usedTokens / window) * 1000) / 10),
        outputTokens: 0,
        sections,
        estimatedFallback: true,
      }
    }

    function formatTime (ts) {
      if (!ts) return ''
      const date = new Date(ts)
      const now = new Date()
      const pad = v => String(v).padStart(2, '0')
      const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
      if (date.toDateString() === now.toDateString()) return `今天 ${hm}`
      if (date.getFullYear() === now.getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    const STATUS_LABEL = {
      idle: 'analysis.idle',
      running: 'analysis.running',
      done: 'analysis.done',
      error: 'analysis.error',
    }

    // -----------------------------------------------------------------------
    // Markdown
    // -----------------------------------------------------------------------

    function inlineNodes (text, keyBase, onCite) {
      const nodes = []
      let rest = String(text || '')
      let key = 0
      const patterns = [
        { re: /^《([^》]+)》(?:\s*§\s*([0-9A-Za-z.]+|[一二三四五六七八九十]+（[一二三四五六七八九十]+）))?/, render: match => onCite ? h('button', { type: 'button', className: 'iw-cite', onClick: () => onCite(match[1], match[2] || ''), title: '查看引用出处' }, match[0]) : match[0] },
        { re: /^`([^`]+)`/, render: match => h('code', { key: key++ }, match[1]) },
        { re: /^\*\*([^*]+)\*\*/, render: match => h('strong', { key: key++ }, match[1]) },
        { re: /^\*([^*\n]+)\*/, render: match => h('em', { key: key++ }, match[1]) },
        { re: /^\[([^\]]+)\]\((https?:[^)\s]+)\)/, render: match => h('a', { key: key++, href: match[2], target: '_blank', rel: 'noreferrer' }, match[1]) },
      ]
      while (rest.length > 0) {
        let matched = false
        for (const pattern of patterns) {
          const match = pattern.re.exec(rest)
          if (!match) continue
          if (match.index > 0) {
            nodes.push(rest.slice(0, match.index))
            rest = rest.slice(match.index)
            matched = true
            break
          }
          nodes.push(pattern.render(match))
          rest = rest.slice(match[0].length)
          matched = true
          break
        }
        if (matched) continue
        // Consume one plain run up to the next potential marker.
        const next = rest.slice(1).search(/[`*\[《]/)
        if (next < 0) { nodes.push(rest); rest = '' } else { nodes.push(rest.slice(0, next + 1)); rest = rest.slice(next + 1) }
      }
      return nodes.map((node, index) => (typeof node === 'string' ? node : React.cloneElement(node, { key: `${keyBase}-${index}` })))
    }

    function isTableSeparatorLine (line) {
      return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
    }

    function splitTableRow (line) {
      let body = line.trim()
      if (body.startsWith('|')) body = body.slice(1)
      if (body.endsWith('|')) body = body.slice(0, -1)
      return body.split('|').map(cell => cell.trim())
    }

    function renderMarkdown (markdown, onCite) {
      const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let i = 0
      let key = 0
      const paragraph = []
      const flush = () => {
        if (paragraph.length === 0) return
        blocks.push(h('p', { key: `p${key++}` }, inlineNodes(paragraph.join('\n'), `p${key}`, onCite)))
        paragraph.length = 0
      }
      while (i < lines.length) {
        const line = lines[i]
        if (/^\s*$/.test(line)) { flush(); i++; continue }
        if (/^```/.test(line)) {
          flush()
          const body = []
          i++
          while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
          i++
          blocks.push(h('pre', { key: `pre${key++}` }, h('code', null, body.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flush()
          const level = Math.min(6, heading[1].length)
          blocks.push(h(`h${level}`, { key: `h${key++}` }, inlineNodes(heading[2], `h${key}`, onCite)))
          i++
          continue
        }
        if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
          flush()
          blocks.push(h('hr', { key: `hr${key++}` }))
          i++
          continue
        }
        if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
          flush()
          const header = splitTableRow(line)
          i += 2
          const rows = []
          while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitTableRow(lines[i++]))
          blocks.push(h('div', { className: 'iw-table-wrap', key: `t${key++}` },
            h('table', null,
              h('thead', null, h('tr', null, header.map((cell, ci) => h('th', { key: ci }, inlineNodes(cell, `th${ci}`, onCite))))),
              h('tbody', null, rows.map((row, ri) => h('tr', { key: ri },
                header.map((_, ci) => h('td', { key: ci }, inlineNodes(row[ci] || '', `td${ri}-${ci}`, onCite)))))))))
          continue
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          flush()
          const items = []
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            let item = lines[i].replace(/^\s*[-*+]\s+/, '')
            i++
            while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) {
              item += ' ' + lines[i].trim()
              i++
            }
            items.push(item)
          }
          blocks.push(h('ul', { key: `ul${key++}` }, items.map((item, ii) => h('li', { key: ii }, inlineNodes(item, `li${ii}`, onCite)))))
          continue
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          flush()
          const items = []
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
            i++
          }
          blocks.push(h('ol', { key: `ol${key++}` }, items.map((item, ii) => h('li', { key: ii }, inlineNodes(item, `li${ii}`, onCite)))))
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          flush()
          const quoted = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
          blocks.push(h('blockquote', { key: `q${key++}` }, inlineNodes(quoted.join(' '), `q${key}`, onCite)))
          continue
        }
        paragraph.push(line)
        i++
      }
      flush()
      return blocks
    }

    // -----------------------------------------------------------------------
    // Primitives
    // -----------------------------------------------------------------------

    function Button ({ variant, icon, children, title, disabled, onClick, type = 'button', className = '' }) {
      return h('button', {
        type,
        title,
        disabled,
        onClick,
        className: `iw-btn ${className}`.trim(),
        'data-variant': variant || 'default',
      }, icon ? h(Icon, { name: icon, size: 14 }) : null, children)
    }

    function IconButton ({ icon, title, onClick, disabled, variant }) {
      return h('button', {
        type: 'button',
        title,
        'aria-label': title,
        disabled,
        onClick,
        className: 'iw-btn iw-icon-btn',
        'data-variant': variant || 'ghost',
      }, h(Icon, { name: icon, size: 15 }))
    }

    function Chip ({ tone, children, title }) {
      return h('span', { className: 'iw-chip', 'data-tone': tone || 'default', title }, children)
    }

    function Spinner ({ tone }) {
      return h('span', { className: 'iw-spinner', 'data-tone': tone || 'warn', 'aria-hidden': 'true' })
    }

    function Modal ({ title, children, onClose, footer, wide }) {
      const ref = useRef(null)
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        const timer = setTimeout(() => ref.current?.focus(), 30)
        return () => {
          window.removeEventListener('keydown', onKey)
          clearTimeout(timer)
        }
      }, [onClose])
      return h('div', {
        className: 'iw-modal-mask',
        onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() },
      }, h('div', {
        className: 'iw-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        style: wide ? { width: 'min(860px, 100%)' } : undefined,
      }, h('h2', { className: 'iw-modal-title', tabIndex: -1, ref }, title),
      h('div', { className: 'iw-modal-body' }, children),
      footer ? h('div', { className: 'iw-modal-actions' }, footer) : null))
    }

    // -----------------------------------------------------------------------
    // Folder drag-and-drop
    // -----------------------------------------------------------------------

    async function readDirectoryEntries (reader) {
      const all = []
      while (all.length < 400) {
        const batch = await new Promise((resolve) => {
          try { reader.readEntries(resolve, () => resolve([])) } catch { resolve([]) }
        })
        if (!batch || batch.length === 0) break
        all.push(...batch)
      }
      return all
    }

    async function collectDroppedEntry (entry, prefix = '') {
      if (!entry) return []
      if (entry.isFile) {
        return new Promise((resolve) => {
          try {
            entry.file(file => resolve([{ file, rel: `${prefix}${file.name}` }]), () => resolve([]))
          } catch { resolve([]) }
        })
      }
      if (!entry.isDirectory) return []
      const name = String(entry.name || '')
      if (!name || name.startsWith('.') || name === '__MACOSX' || name === 'node_modules') return []
      const children = await readDirectoryEntries(entry.createReader())
      const out = []
      for (const child of children) {
        if (out.length >= 400) break
        out.push(...await collectDroppedEntry(child, `${prefix}${name}/`))
      }
      return out.slice(0, 400)
    }

    async function collectDroppedEntries (entries) {
      const out = []
      for (const entry of entries || []) {
        if (out.length >= 400) break
        out.push(...await collectDroppedEntry(entry))
      }
      return out
    }

    // -----------------------------------------------------------------------
    // Materials tab
    // -----------------------------------------------------------------------

    function MaterialsTab ({ detail, t, busy, onImportFiles, onImportDropped, onImportFolder, onDelete, onView, onDownload }) {
      const inputRef = useRef(null)
      const [over, setOver] = useState(false)
      const materials = detail.materials || []

      const pickFiles = () => inputRef.current?.click()

      const handleDrop = (event) => {
        event.preventDefault()
        setOver(false)
        const items = Array.from(event.dataTransfer?.items || [])
        const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean)
        if (entries.some(entry => entry.isDirectory)) {
          onImportDropped(entries)
          return
        }
        const files = Array.from(event.dataTransfer?.files || [])
        if (files.length > 0) onImportFiles(files)
      }

      const fileInput = h('input', {
        ref: inputRef,
        type: 'file',
        multiple: true,
        accept: ACCEPT,
        style: { display: 'none' },
        onChange: (event) => {
          const files = Array.from(event.target.files || [])
          event.target.value = ''
          if (files.length > 0) onImportFiles(files)
        },
      })

      const dropZone = h('div', {
        className: 'iw-drop',
        'data-over': over ? 'true' : 'false',
        onDragOver: (event) => { event.preventDefault(); setOver(true) },
        onDragLeave: () => setOver(false),
        onDrop: handleDrop,
      },
      h('div', null, t('dropHint')),
      h('div', { className: 'iw-drop-actions' },
        h(Button, { variant: 'primary', icon: 'upload', onClick: pickFiles, disabled: Boolean(busy) }, t('importFiles')),
        h(Button, { icon: 'folder', onClick: onImportFolder, disabled: Boolean(busy) }, t('importFolder'))))

      const busyBanner = busy
        ? h('div', { className: 'iw-banner' }, h(Spinner, { tone: 'accent' }), h('div', { className: 'iw-banner-body' }, busy))
        : null

      const emptyBanner = h('div', { className: 'iw-banner' },
        h(Icon, { name: 'info', size: 15 }),
        h('div', { className: 'iw-banner-body' }, t('noMaterials')))

      const headRow = h('tr', null,
        h('th', null, t('material.name')),
        h('th', { style: { width: 92 } }, t('material.size')),
        h('th', { style: { width: 84 } }, t('material.chars')),
        h('th', { style: { width: 106 } }, t('material.status')),
        h('th', { style: { width: 112, textAlign: 'right' } }, t('material.actions')))

      const table = h('table', { className: 'iw-table' },
        h('thead', null, headRow),
        h('tbody', null, materials.map((material) => {
          const fileCell = h('td', null, h('div', { className: 'iw-file' },
            h('span', { className: 'iw-file-icon' }, h(Icon, { name: 'file', size: 14 })),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'iw-file-name' }, material.name),
              material.rel ? h('div', { className: 'iw-file-rel' }, material.rel) : null,
              material.error
                ? h('div', { className: 'iw-file-rel', style: { color: 'var(--dsw-alias-state-error-primary,#d92d20)' } }, material.error)
                : null,
              material.status === 'parsed' && (material.warnings || []).length > 0
                ? h('div', { className: 'iw-file-rel' }, material.warnings.join('；'))
                : null)))
          const sizeCell = h('td', { className: 'iw-num' }, formatBytes(material.bytes))
          const charsCell = h('td', { className: 'iw-num' }, material.chars ? String(material.chars) : '—')
          const statusCell = h('td', null, material.status === 'parsed'
            ? h(Chip, { tone: 'success' }, t('parsed'))
            : h(Chip, { tone: 'error', title: material.error }, t('failed')))
          const actionsCell = h('td', null, h('div', { className: 'iw-row-actions' },
            h(IconButton, { icon: 'eye', title: t('view'), onClick: () => onView(material) }),
            h(IconButton, { icon: 'download', title: t('download'), onClick: () => onDownload(material) }),
            h(IconButton, { icon: 'trash', title: t('delete'), variant: 'danger', onClick: () => onDelete(material) })))
          return h('tr', { key: material.id }, fileCell, sizeCell, charsCell, statusCell, actionsCell)
        })))

      return h('div', null,
        fileInput,
        dropZone,
        busyBanner,
        materials.length === 0 ? emptyBanner : table)
    }

    // -----------------------------------------------------------------------
    // Analysis tab
    // -----------------------------------------------------------------------

    function StageList ({ stages, t }) {
      if (!Array.isArray(stages) || stages.length === 0) return null
      return h('div', { className: 'iw-stages' }, stages.map(stage => h('div', {
        key: stage.key,
        className: 'iw-stage',
        'data-status': stage.status,
      },
      h('span', { className: 'iw-stage-mark' }, stage.status === 'done'
        ? h(Icon, { name: 'check', size: 11 })
        : stage.status === 'running'
          ? null
          : stage.status === 'error' ? '!' : null),
      stage.status === 'running' ? h(Spinner) : null,
      h('span', { className: 'iw-stage-label' }, stage.label),
      stage.detail ? h('span', { className: 'iw-stage-detail' }, stage.detail) : null)))
    }

    function TimelineTab ({ detail, t }) {
      const taskId = detail.task.id
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [loading, setLoading] = useState(true)

      useEffect(() => {
        let alive = true
        // Reset before fetching: switching from a case without a timeline to
        // one with a timeline must not keep showing the previous error.
        setData(null)
        setError('')
        setLoading(true)
        ;(async () => {
          try {
            const response = await request(`/tasks/timeline?id=${encodeURIComponent(taskId)}`)
            if (alive) {
              setData(response.timeline)
              setError('')
            }
          } catch (err) {
            if (alive) {
              setData(null)
              setError(errorText(err))
            }
          } finally {
            if (alive) setLoading(false)
          }
        })()
        return () => { alive = false }
      }, [taskId])

      if (loading) return h('div', { className: 'iw-empty' }, h(Spinner, { tone: 'accent' }), h('div', { className: 'iw-empty-text' }, t('loading')))
      if (error) return h('div', { className: 'iw-banner' }, h(Icon, { name: 'info', size: 15 }), h('div', { className: 'iw-banner-body' }, error))
      if (!data) return null
      const windows = data.windows || []
      const events = data.events || []
      const episodes = data.episodes || []
      const flags = data.flags || []

      return h('div', { className: 'iw-timeline' },
        h('div', { className: 'iw-timeline-head' },
          h('div', null,
            h('h2', { className: 'iw-timeline-title' }, t('timeline.window')),
            h('div', { className: 'iw-timeline-sub' }, `${events.length} ${t('timeline.events')} · ${windows.length} ${t('timeline.window')}`)),
          data.anchors?.admission
            ? h('div', { className: 'iw-timeline-sub' }, `${formatTime(data.anchors.admission)} → ${data.anchors.discharge ? formatTime(data.anchors.discharge) : '—'}`)
            : null),
        flags.length > 0
          ? h('div', { className: 'iw-tl-flags' }, flags.map((flag, index) => h('div', { key: index, className: 'iw-tl-flag' }, flag.text)))
          : null,
        windows.length > 0
          ? h('div', { className: 'iw-window-grid' }, windows.map((window, index) => h('div', {
              key: index,
              className: 'iw-window-card',
              'data-status': window.status || 'unknown',
            },
            h('div', { className: 'iw-window-kind' }, window.label || window.kind),
            h('div', { className: 'iw-window-range' }, `${formatTime(window.start)} → ${window.end ? formatTime(window.end) : '—'}`),
            h('div', { className: 'iw-window-meta' }, window.onset ? `${t('timeline.onset')} ${formatTime(window.onset)}` : t('timeline.noOnset')),
            window.status === 'before'
              ? h('div', { className: 'iw-window-delta' }, `${t('timeline.before')} · ${window.delta}`)
              : window.status === 'after'
                ? h('div', { className: 'iw-window-delta' }, `${t('timeline.after')} · ${window.over}`)
                : window.status === 'inside'
                  ? h('div', { className: 'iw-window-delta' }, `${t('timeline.inside')} · ${t('timeline.fromStart')} ${window.delta}`)
                  : null,
            window.note ? h('div', { className: 'iw-window-note' }, window.note) : null)))
          : h('div', { className: 'iw-banner' }, h('div', { className: 'iw-banner-body' }, t('timeline.noWindows'))),
        episodes.length > 0
          ? h('div', { className: 'iw-tl-section' },
              h('h3', null, t('timeline.devices')),
              h('div', { className: 'iw-tl-episodes' }, episodes.map((episode, index) => h('div', { key: index, className: 'iw-tl-episode' },
                h('span', { className: 'iw-tl-episode-name' }, episode.device),
                h('span', { className: 'iw-tl-episode-range' }, `${formatTime(episode.start)} → ${episode.end ? formatTime(episode.end) : t('timeline.open')}`),
                episode.open ? h('span', { className: 'iw-tl-chip' }, t('timeline.estimated')) : null))))
          : null,
        events.length > 0
          ? h('div', { className: 'iw-tl-section' },
              h('h3', null, t('timeline.events')),
              h('div', { className: 'iw-tl-list' }, events.map(event => h('div', { key: event.id, className: 'iw-tl-item', 'data-type': event.type },
                h('div', { className: 'iw-tl-time' }, formatTime(event.time)),
                h('div', { className: 'iw-tl-dot' }),
                h('div', { className: 'iw-tl-body' },
                  h('div', { className: 'iw-tl-label' }, event.label),
                  event.detail ? h('div', { className: 'iw-tl-detail' }, event.detail) : null)))))
          : null)
    }

    function ExportDialog ({ t, title, onClose, onExport, initial = [] }) {
      const formats = ['md', 'html', 'txt', 'docx', 'pdf']
      const [selected, setSelected] = useState(() => new Set(initial))
      const labels = {
        md: t('analysis.downloadMd'),
        html: t('analysis.downloadHtml'),
        txt: t('analysis.downloadTxt'),
        docx: t('analysis.downloadDocx'),
        pdf: t('analysis.downloadPdf'),
      }
      const toggle = (format) => {
        setSelected(current => {
          const next = new Set(current)
          if (next.has(format)) next.delete(format)
          else next.add(format)
          return next
        })
      }
      const all = selected.size === formats.length
      return h(Modal, {
        title,
        onClose,
        footer: [
          h(Button, { key: 'cancel', onClick: onClose }, t('cancel')),
          h(Button, {
            key: 'export',
            variant: 'primary',
            icon: 'download',
            disabled: selected.size === 0,
            onClick: () => onExport(formats.filter(format => selected.has(format))),
          }, t('export.exportSelected')),
        ],
      },
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('export.format')),
        h('label', { className: 'iw-export-row' },
          h('input', {
            type: 'checkbox',
            checked: all,
            onChange: () => setSelected(all ? new Set() : new Set(formats)),
          }),
          h('span', null, t('export.selectAll'))),
        h('div', { className: 'iw-export-formats' }, formats.map(format => h('label', { key: format, className: 'iw-export-row' },
          h('input', {
            type: 'checkbox',
            checked: selected.has(format),
            onChange: () => toggle(format),
          }),
          h('span', null, labels[format]))))))
    }

    function AnalysisTab ({ detail, job, t, onStart, onCancel, busy, onDownload, onNotice, onCite }) {
      const [focus, setFocus] = useState('')
      const [showFocus, setShowFocus] = useState(false)
      const [exportOpen, setExportOpen] = useState(false)
      const streamRef = useRef(null)
      const analysis = detail.analysis || { status: 'idle', stages: [] }
      const running = analysis.status === 'running' || (job && job.status === 'running')
      const report = detail.report || (job && job.kind === 'analysis' ? job.text : '')
      const materials = (detail.materials || []).filter(m => m.status === 'parsed')
      const [now, setNow] = useState(Date.now())

      useEffect(() => {
        if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
      }, [job && job.text])

      useEffect(() => {
        if (!running) return undefined
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [running])

      const copyReport = async () => {
        try {
          await navigator.clipboard.writeText(report)
          onNotice({ tone: 'ok', text: t('analysis.copy') })
        } catch {
          onNotice({ tone: 'error', text: '复制失败，请手动选择文本' })
        }
      }

      const stageList = analysis.status === 'running' && job ? job.stages : analysis.stages
      const activeStage = (stageList || []).find(stage => stage.status === 'running') || null
      const startedAt = job?.startedAt || analysis.startedAt || now
      const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
      const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`
      const statusTone = analysis.status === 'done' ? 'success' : analysis.status === 'error' ? 'error' : analysis.status === 'running' ? 'warn' : 'default'

      return h('div', null,
        h('div', { className: 'iw-section' },
          h('div', { className: 'iw-section-head' },
            h('span', { className: 'iw-section-title' }, t('analysis.overview')),
            h('span', { className: 'iw-speed-note' }, t('speed.note')),
            h('span', { className: 'iw-section-spacer' }),
            h(Chip, { tone: statusTone }, t(STATUS_LABEL[analysis.status] || STATUS_LABEL.idle)),
            analysis.model ? h(Chip, { tone: 'accent' }, analysis.model) : null),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' } },
            showFocus
              ? h('div', { className: 'iw-field', style: { flexBasis: '100%' } },
                h('label', { className: 'iw-field-label' }, t('analysis.focus')),
                h('textarea', {
                  className: 'iw-textarea',
                  value: focus,
                  placeholder: t('analysis.focusHint'),
                  onChange: (event) => setFocus(event.target.value),
                  disabled: running,
                }))
              : null,
            h(Button, {
              variant: 'primary',
              icon: 'spark',
              disabled: running || materials.length === 0 || Boolean(busy),
              onClick: () => onStart(focus),
            }, analysis.status === 'done' ? t('analysis.restart') : t('analysis.start')),
            running
              ? h(Button, { icon: 'pause', onClick: onCancel }, t('analysis.cancel'))
              : h(Button, { icon: 'edit', onClick: () => setShowFocus(value => !value) }, t('analysis.focus')),
            materials.length === 0 ? h('span', { className: 'iw-hint' }, t('analysis.needMaterials')) : null),
          stageList && stageList.length > 0
            ? h('div', { style: { marginTop: 13 } }, h(StageList, { stages: stageList, t }))
            : null,
          running
            ? h('div', { className: 'iw-analysis-live', 'data-stage': activeStage?.key || '' },
                h('div', { className: 'iw-analysis-live-head' },
                  h(Spinner, { tone: 'accent' }),
                  h('span', { className: 'iw-analysis-live-title' }, activeStage?.label || t('analysis.live')),
                  h('span', { className: 'iw-analysis-live-elapsed' }, `${t('analysis.elapsed')} ${elapsed}`)),
                h('div', { className: 'iw-progress-track iw-progress-indeterminate' },
                  h('div', { className: 'iw-progress-fill' })),
                h('div', { className: 'iw-analysis-live-detail' },
                  activeStage?.detail || t('analysis.waiting'),
                  activeStage?.key === 'facts' ? ` · ${t('analysis.factsHint')}` : ''))
            : null,
          running && job && job.text
            ? h('div', { style: { marginTop: 12 } },
              h('div', { className: 'iw-field-label', style: { marginBottom: 6 } }, `${t('analysis.streaming')} · ${job.stage || ''}`),
              h('div', { className: 'iw-stream', ref: streamRef }, job.text))
            : running && job && job.reasoningChars > 0
              ? h('div', { style: { marginTop: 12 } },
                h('div', { className: 'iw-field-label', style: { marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7 } },
                  h(Spinner, { tone: 'accent' }),
                  `${t('analysis.reasoning')} · ${job.reasoningChars} 字`),
                h('div', { className: 'iw-stream', ref: streamRef, style: { maxHeight: 140, opacity: 0.8 } },
                  (job.reasoning || '').slice(-1200)))
              : null,
          (analysis.warnings || []).length > 0
            ? h('div', { className: 'iw-banner', 'data-tone': 'warn', style: { marginTop: 12, marginBottom: 0 } },
              h(Icon, { name: 'info', size: 15 }),
              h('div', { className: 'iw-banner-body' },
                h('div', { style: { fontWeight: 600, marginBottom: 2 } }, t('analysis.warnings')),
                analysis.warnings.map((warning, index) => h('div', { key: index }, `· ${warning}`))))
            : null,
          analysis.error
            ? h('div', { className: 'iw-banner', 'data-tone': 'error', style: { marginTop: 12, marginBottom: 0 } },
              h(Icon, { name: 'alert', size: 15 }),
              h('div', { className: 'iw-banner-body' },
                h('div', null, analysis.error),
                h('div', { style: { marginTop: 8 } },
                  h(Button, { icon: 'refresh', onClick: () => onStart(focus) }, t('analysis.retry')))))
            : null),
        report && report.trim().length > 0
          ? h('div', { className: 'iw-section', style: { background: 'var(--dsw-alias-bg-base, #fff)' } },
            h('div', { className: 'iw-section-head' },
              h('span', { className: 'iw-section-title' }, t('analysis.report')),
              h('span', { className: 'iw-section-spacer' }),
              h(Button, { icon: 'copy', onClick: copyReport }, t('analysis.copy')),
              h(Button, { icon: 'download', onClick: () => setExportOpen(true) }, t('analysis.export'))),
            h('div', { className: 'iw-md' }, renderMarkdown(report, onCite)))
          : !running
            ? h('div', { className: 'iw-banner' },
              h(Icon, { name: 'info', size: 15 }),
              h('div', { className: 'iw-banner-body' }, t('analysis.empty')))
            : null,
        exportOpen
          ? h(ExportDialog, {
              t,
              title: t('analysis.exportTitle'),
              onClose: () => setExportOpen(false),
              onExport: (formats) => { setExportOpen(false); onDownload(formats) },
            })
          : null)
    }

    // -----------------------------------------------------------------------
    // Chat tab
    // -----------------------------------------------------------------------

    function RunStatusBar ({ t, context, compacted, usage, messages, job, running }) {
      const [open, setOpen] = useState(false)
      const [, setTick] = useState(0)
      const ref = useRef(null)
      useEffect(() => {
        if (!running) return undefined
        const timer = setInterval(() => setTick(value => value + 1), 1000)
        return () => clearInterval(timer)
      }, [running])
      useEffect(() => {
        if (!open) return undefined
        const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
      }, [open])
      const percent = Math.max(0, Math.min(100, Number(context?.percent) || 0))
      const inputTokens = Number(usage?.inputTokens) || 0
      const cacheReadTokens = Number(usage?.cacheReadTokens) || 0
      // Providers may report uncached input and cache reads separately.  The
      // denominator is the whole prompt, not just the uncached remainder.
      const promptTokens = inputTokens + cacheReadTokens
      const totalUsage = Number(usage?.totalTokens) || (promptTokens + (Number(usage?.outputTokens) || 0))
      const elapsed = job?.startedAt ? Math.max(0.1, ((job.finishedAt || Date.now()) - job.startedAt) / 1000) : 0
      const streamedTokens = job?.text ? Math.ceil(job.text.length / 1.5) : 0
      const outputTokens = Number(usage?.outputTokens) || Number(context?.outputTokens) || streamedTokens || 0
      const speed = elapsed > 0 && outputTokens > 0 ? Math.round(outputTokens / elapsed) : 0
      const cachePercent = cacheReadTokens > 0 && promptTokens > 0
        ? Math.min(100, Math.round((cacheReadTokens / promptTokens) * 100))
        : null
      const rounds = (messages || []).filter(message => message.role === 'user').length
      const stages = job?.stages || []
      const doneStages = stages.filter(stage => stage.status === 'done').length
      if (!context && !totalUsage && !running && rounds === 0) return null
      const sections = (context?.sections || []).filter(section => section.tokens > 0)
      return h('div', { className: 'iw-runbar-wrap', ref },
        open && context
          ? h('div', { className: 'iw-context-popover' },
              h('div', { className: 'iw-context-popover-head' },
                h('span', { className: 'iw-context-title' }, `${t('context.used')} ${percent}%`),
                h('span', { className: 'iw-context-total' }, `~${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)}`)),
              h('div', { className: 'iw-context-track' },
                h('div', { className: 'iw-context-fill', style: { width: `${percent}%`, 'data-high': percent >= 85 ? 'true' : 'false' } })),
              h('div', { className: 'iw-context-section-list' },
                sections.map((section, index) => h('div', { key: section.key, className: 'iw-context-section-row' },
                  h('span', { className: 'iw-context-dot', 'data-index': String(index % 4) }),
                  h('span', { className: 'iw-context-section-name' }, t('context.' + section.key)),
                  h('span', { className: 'iw-context-section-value' }, `~${formatTokens(section.tokens)}`)))),
              h('div', { className: 'iw-context-popover-foot' },
                compacted ? h('span', { className: 'iw-context-compacted' }, t('context.compacted')) : h('span'),
                (usage || context.outputTokens)
                  ? h('span', null, [
                      promptTokens ? `↑ ${formatTokens(promptTokens)}` : '',
                      outputTokens ? `↓ ${formatTokens(outputTokens)}` : '',
                      cacheReadTokens ? `缓存 ${formatTokens(cacheReadTokens)}` : '',
                    ].filter(Boolean).join(' · '))
                  : null))
          : null,
        h('div', { className: 'iw-run-bar' },
          h('div', { className: 'iw-run-main' },
            running ? h(Spinner, { tone: 'accent' }) : null,
            h('span', { className: 'iw-run-state' }, running ? t('analysis.running') : rounds > 0 ? t('run.done') : t('run.idle')),
            rounds > 0 ? h('span', null, `${rounds} ${t('run.rounds')}`) : null,
            stages.length > 0 ? h('span', null, `${doneStages}/${stages.length} ${t('run.steps')}`) : null),
          h('span', { className: 'iw-runbar-spacer' }),
          speed > 0 ? h('span', { className: 'iw-run-stat' }, `${speed} tok/s`) : null,
          totalUsage > 0 ? h('span', { className: 'iw-run-stat' }, `${t('run.usage')} ${formatTokens(totalUsage)} tok`) : null,
          cachePercent !== null ? h('span', { className: 'iw-run-stat', title: t('run.cacheHint') }, `${t('run.cache')} ${cachePercent}%`) : null,
          context
            ? h('button', {
                type: 'button',
                className: 'iw-context-trigger',
                title: t('context.used'),
                'aria-label': t('context.used'),
                onClick: () => setOpen(value => !value),
              }, h('span', { className: 'iw-context-ring', style: { '--context-percent': `${percent}%` } },
                h('span', { className: 'iw-context-ring-inner' }, `${Math.round(percent)}%`)))
            : null))
    }

    function ChatTab ({ detail, job, t, contextWindow, onAsk, onClear, onExport, busy, onCite }) {
      const [draft, setDraft] = useState('')
      const [exportOpen, setExportOpen] = useState(false)
      const listRef = useRef(null)
      const messages = detail.chat || []
      const running = Boolean(job && job.status === 'running' && job.kind === 'chat')
      const context = job?.context || detail.chatContext || fallbackContext({ detail, messages, contextWindow })

      useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, [messages.length, running, job && job.text])

      const send = () => {
        const text = draft.trim()
        if (!text || running || busy) return
        setDraft('')
        onAsk(text)
      }

      return h('div', { className: 'iw-chat' },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flex: 0 } },
          h('span', { className: 'iw-field-label' }, `${t('chat')} · ${messages.length}`),
          h('span', { className: 'iw-speed-note' }, t('speed.note')),
          h('span', { className: 'iw-toolbar-spacer' }),
          messages.length > 0 ? h(Button, { variant: 'ghost', icon: 'download', onClick: () => setExportOpen(true), disabled: running }, t('chat.export')) : null,
          messages.length > 0 ? h(Button, { variant: 'ghost', icon: 'trash', onClick: onClear, disabled: running }, t('chat.clear')) : null),
        messages.length === 0 && !running
          ? h('div', { className: 'iw-chat-empty' }, t('chat.empty'))
          : h('div', { className: 'iw-chat-list', ref: listRef },
            messages.map(message => {
              const pending = message.pending && message.role === 'assistant'
              return h('div', { key: message.id, className: 'iw-msg', 'data-role': message.role },
                h('div', { className: 'iw-msg-head' },
                  h(Icon, { name: message.role === 'user' ? 'edit' : 'spark', size: 12 }),
                  h('span', null, message.role === 'user' ? t('you') : t('assistant')),
                  message.at ? h('span', null, formatTime(message.at)) : null),
                h('div', { className: 'iw-msg-body' },
                  message.role === 'assistant'
                    ? (pending && !message.content ? h('span', { style: { display: 'inline-flex', gap: 8, alignItems: 'center' } },
                      h(Spinner, { tone: 'accent' }), t('chat.thinking'))
                      : h('div', { className: 'iw-md' }, renderMarkdown(message.content, onCite)))
                    : message.content),
                message.error ? h('div', { className: 'iw-msg-error' }, message.error) : null)
            }),
            running && job && job.text && !messages.some(m => m.pending && m.content)
              ? h('div', { className: 'iw-msg', 'data-role': 'assistant' },
                h('div', { className: 'iw-msg-head' }, h(Icon, { name: 'spark', size: 12 }), t('assistant')),
                h('div', { className: 'iw-msg-body' }, h('div', { className: 'iw-md' }, renderMarkdown(job.text, onCite))))
              : null),
        h('div', { className: 'iw-composer' },
          h('textarea', {
            className: 'iw-textarea',
            value: draft,
            placeholder: t('chat.placeholder'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
                event.preventDefault()
                send()
              }
            },
            disabled: running,
            rows: 1,
          }),
          h(Button, {
            variant: 'primary',
            icon: 'send',
            onClick: send,
            disabled: running || busy || draft.trim().length === 0,
          }, running ? t('chat.thinking') : t('chat.send'))),
        h(RunStatusBar, {
          t,
          context,
          compacted: job?.compacted || context?.compacted,
          usage: job?.usage || context?.usage,
          messages,
          job,
          running,
        }),
        exportOpen
          ? h(ExportDialog, {
              t,
              title: t('chat.exportTitle'),
              onClose: () => setExportOpen(false),
              onExport: (formats) => { setExportOpen(false); onExport(formats) },
            })
          : null)
    }

    function AssistantPanel ({ t, messages, job, context, contextWindow, otherRunning, loading, error, onSend, onCancel, onExport, onCite }) {
      const [draft, setDraft] = useState('')
      const [exportOpen, setExportOpen] = useState(false)
      const listRef = useRef(null)
      const running = job?.status === 'running'
      const effectiveContext = job?.context || context || fallbackContext({ messages, contextWindow })
      const suggestions = ['assistant.suggest.vap', 'assistant.suggest.terms', 'assistant.suggest.ssi', 'assistant.suggest.cauti', 'assistant.suggest.report']

      useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, [messages.length, running, job?.text])

      const send = (text = draft) => {
        const value = String(text || '').trim()
        if (!value || running) return
        setDraft('')
        onSend(value)
      }

      return h('div', { className: 'iw-assistant' },
        h('div', { className: 'iw-assistant-head' },
          h('div', null,
            h('div', { className: 'iw-assistant-title' }, t('assistant.title')),
            h('div', { className: 'iw-assistant-sub' }, t('assistant.subtitle'), h('span', { className: 'iw-speed-note' }, t('speed.note')))),
          h('span', { className: 'iw-toolbar-spacer' }),
          messages.length > 0
            ? h(Button, { variant: 'ghost', icon: 'download', onClick: () => setExportOpen(true), disabled: running }, t('assistant.export'))
            : null),
        error ? h('div', { className: 'iw-banner', 'data-tone': 'error' }, h(Icon, { name: 'alert', size: 15 }), h('div', { className: 'iw-banner-body' }, error)) : null,
        otherRunning
          ? h('div', { className: 'iw-banner' },
              h(Icon, { name: 'info', size: 15 }),
              h('div', { className: 'iw-banner-body' }, t('assistant.otherRunning')),
              h(Button, { variant: 'ghost', onClick: onCancel }, t('analysis.cancel')))
          : null,
        !loading && messages.length === 0 && !running
          ? h('div', { className: 'iw-assistant-empty' },
              h('div', { className: 'iw-empty-title' }, t('assistant.emptyTitle')),
              h('div', { className: 'iw-empty-text' }, t('assistant.emptyHint')),
              h('div', { className: 'iw-assistant-suggestions' }, suggestions.map(key => h('button', {
                key,
                type: 'button',
                className: 'iw-assistant-chip',
                onClick: () => send(t(key)),
              }, t(key)))))
          : h('div', { className: 'iw-chat-list', ref: listRef },
              messages.map(message => {
                const pending = message.pending && message.role === 'assistant'
                return h('div', { key: message.id, className: 'iw-msg', 'data-role': message.role },
                  h('div', { className: 'iw-msg-head' },
                    h(Icon, { name: message.role === 'user' ? 'edit' : 'spark', size: 12 }),
                    h('span', null, message.role === 'user' ? t('you') : t('assistant.title')),
                    message.createdAt ? h('span', null, formatTime(message.createdAt)) : null),
                  h('div', { className: 'iw-msg-body' },
                    message.role === 'assistant'
                      ? (pending && !message.content
                          ? h('span', { style: { display: 'inline-flex', gap: 8, alignItems: 'center' } }, h(Spinner, { tone: 'accent' }), t('chat.thinking'))
                          : h('div', { className: 'iw-md' }, renderMarkdown(message.content, onCite)))
                      : message.content),
                  message.error ? h('div', { className: 'iw-msg-error' }, message.error) : null)
              }),
              running && job && job.text
                ? h('div', { className: 'iw-msg', 'data-role': 'assistant' },
                    h('div', { className: 'iw-msg-head' }, h(Icon, { name: 'spark', size: 12 }), t('assistant.title')),
                    h('div', { className: 'iw-msg-body' }, h('div', { className: 'iw-md' }, renderMarkdown(job.text, onCite))))
                : null),
        h('div', { className: 'iw-assistant-composer' },
          h('div', { className: 'iw-composer' },
            h('textarea', {
              className: 'iw-textarea',
              value: draft,
              placeholder: t('assistant.placeholder'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
                  event.preventDefault()
                  send()
                }
              },
              disabled: running || otherRunning,
              rows: 1,
            }),
            running
              ? h(Button, { icon: 'pause', onClick: onCancel }, t('analysis.cancel'))
              : h(Button, { variant: 'primary', icon: 'send', onClick: () => send(), disabled: loading || running || otherRunning || draft.trim().length === 0 }, t('chat.send')))),
        h(RunStatusBar, {
          t,
          context: effectiveContext,
          compacted: job?.compacted || effectiveContext?.compacted,
          usage: job?.usage || effectiveContext?.usage,
          messages,
          job,
          running,
        }),
        exportOpen
          ? h(ExportDialog, {
              t,
              title: t('assistant.exportTitle'),
              onClose: () => setExportOpen(false),
              onExport: (formats) => { setExportOpen(false); onExport(formats) },
            })
          : null)
    }

    function AssistantRenameModal ({ t, session, onClose, onSubmit }) {
      const [title, setTitle] = useState(session?.title || '')
      return h(Modal, {
        title: t('assistant.renamePrompt'),
        onClose,
        footer: [
          h(Button, { key: 'cancel', onClick: onClose }, t('cancel')),
          h(Button, {
            key: 'save',
            variant: 'primary',
            disabled: !title.trim(),
            onClick: () => onSubmit(title.trim()),
          }, t('save')),
        ],
      },
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('assistant.renamePrompt')),
        h('input', {
          className: 'iw-input',
          value: title,
          autoFocus: true,
          onChange: (event) => setTitle(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter' && title.trim()) onSubmit(title.trim()) },
        })))
    }

    // -----------------------------------------------------------------------
    // Task modal
    // -----------------------------------------------------------------------

    function GroupPicker ({ t, value, groups = [], onChange }) {
      const [creating, setCreating] = useState(() => Boolean(value) && !groups.includes(value))
      return h(React.Fragment, null,
        h('select', {
          className: 'iw-input',
          value: creating ? '__new__' : (value || ''),
          onChange: (event) => {
            const next = event.target.value
            if (next === '__new__') {
              setCreating(true)
              if (!value) onChange('')
              return
            }
            setCreating(false)
            onChange(next)
          },
        },
        h('option', { value: '' }, t('task.ungrouped')),
        groups.map(group => h('option', { key: group, value: group }, group)),
        h('option', { value: '__new__' }, t('task.groupNew'))),
        creating
          ? h('input', {
              className: 'iw-input',
              style: { marginTop: 6 },
              value: value,
              placeholder: t('task.groupNewPlaceholder'),
              onChange: (event) => onChange(event.target.value),
            })
          : null)
    }

    function TaskModal ({ t, initial, onClose, onSubmit, groups = [], onRenameGroup }) {
      const [form, setForm] = useState({
        title: initial?.title || '',
        patientName: initial?.patientName || '',
        sex: initial?.sex || '',
        age: initial?.age || '',
        group: initial?.group || '',
        note: initial?.note || '',
      })
      const [saving, setSaving] = useState(false)
      const [renaming, setRenaming] = useState(false)
      const [renameValue, setRenameValue] = useState(initial?.group || '')
      const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
      const submit = async () => {
        if (saving) return
        setSaving(true)
        try {
          await onSubmit(form)
        } finally {
          setSaving(false)
        }
      }
      return h(Modal, {
        title: initial ? t('task.edit') : t('newTask'),
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('cancel')),
          h(Button, { key: 's', variant: 'primary', onClick: submit, disabled: saving || !form.title.trim() }, saving ? t('loading') : (initial ? t('save') : t('create'))),
        ],
      },
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('task.title'), h('span', { className: 'iw-required', 'aria-hidden': 'true' }, '*')),
        h('input', {
          className: 'iw-input',
          value: form.title,
          onChange: set('title'),
          autoFocus: true,
          required: true,
          'aria-required': 'true',
          placeholder: '例：张某 · 呼吸科 · 2026-06',
        })),
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('task.group')),
        h(GroupPicker, { t, value: form.group, groups, onChange: (value) => setForm(current => ({ ...current, group: value })) }),
        initial?.group && onRenameGroup
          ? renaming
            ? h('div', { className: 'iw-inline-group' },
                h('input', {
                  className: 'iw-input',
                  value: renameValue,
                  placeholder: t('task.renamePlaceholder'),
                  onChange: (event) => setRenameValue(event.target.value),
                }),
                h(Button, {
                  variant: 'primary',
                  disabled: !renameValue.trim() || renameValue.trim() === initial.group,
                  onClick: () => {
                    const next = renameValue.trim()
                    if (next === initial.group) return
                    if (groups.includes(next) && !window.confirm(t('task.renameMergeConfirm'))) return
                    void onRenameGroup(initial.group, next)
                  },
                }, t('task.rename')),
                h(Button, { onClick: () => setRenaming(false) }, t('cancel')))
            : h('button', {
                type: 'button',
                className: 'iw-link',
                onClick: () => setRenaming(true),
              }, t('task.renameGroup'))
          : null),
      h('div', { className: 'iw-form-row' },
        h('div', { className: 'iw-field', style: { flex: 2 } },
          h('label', { className: 'iw-field-label' }, t('task.patient')),
          h('input', { className: 'iw-input', value: form.patientName, onChange: set('patientName'), placeholder: '姓名 / 住院号' })),
        h('div', { className: 'iw-field', style: { flex: 1 } },
          h('label', { className: 'iw-field-label' }, t('task.sex')),
          h('input', { className: 'iw-input', value: form.sex, onChange: set('sex'), placeholder: '男/女' })),
        h('div', { className: 'iw-field', style: { flex: 1 } },
          h('label', { className: 'iw-field-label' }, t('task.age')),
          h('input', { className: 'iw-input', value: form.age, onChange: set('age'), placeholder: '岁' }))),
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('task.note')),
        h('textarea', { className: 'iw-textarea', value: form.note, onChange: set('note'), placeholder: '科室、入院时间、主诉、已知培养结果等，可选' })))
    }

    function EnvironmentModal ({ t, data, loading, error, job, onClose, onRefresh, onInstall, onInstallAll }) {
      const missing = []
      if (data) {
        if (!data.pdfjs?.ok) missing.push('pdfjs')
        if (!data.poppler?.ok) missing.push('poppler')
      }
      const installInfo = data?.install || {}
      const installable = missing.filter(target => installInfo[target]?.supported)
      const status = (ok, optional) => h(Chip, { tone: ok ? 'success' : optional ? 'default' : 'warn' },
        ok ? t('env.installed') : t('env.missing'))
      const row = (key, label, detail, ok, optional, target) => h('div', { key, className: 'iw-env-row' },
        h('div', { className: 'iw-env-main' },
          h('div', { className: 'iw-env-name' }, label),
          h('div', { className: 'iw-env-detail' }, detail || '—')),
        status(ok, optional),
        target && !installInfo[target]?.supported
          ? h('div', { className: 'iw-env-command' }, installInfo[target]?.hint || '')
          : target
            ? h(Button, {
                icon: 'download',
                disabled: loading || Boolean(job && job.status === 'running'),
                onClick: () => onInstall(target),
              }, t('env.install'))
            : null)
      const rows = data
        ? [
            row('pdfjs', t('env.pdfjs'), data.pdfjs?.ok ? `v${data.pdfjs.version || ''} · ${data.pdfjs.path || ''}` : data.pdfjs?.error || '', Boolean(data.pdfjs?.ok), false, !data.pdfjs?.ok ? 'pdfjs' : null),
            row('poppler', t('env.poppler'), data.poppler?.ok ? [data.poppler.version, data.poppler.path].filter(Boolean).join(' · ') : t('env.optional'), Boolean(data.poppler?.ok), true, !data.poppler?.ok ? 'poppler' : null),
            row('mutool', t('env.mutool'), data.mutool?.ok ? [data.mutool.version, data.mutool.path].filter(Boolean).join(' · ') : t('env.optional'), Boolean(data.mutool?.ok), true, null),
            row('office', t('env.exportPdf'), data.officeToPdf?.ok ? t('env.installed') : t('env.missing'), Boolean(data.officeToPdf?.ok), false, null),
          ]
        : []
      return h(Modal, {
        title: t('env.title'),
        wide: true,
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('env.close')),
          h(Button, { key: 'r', icon: 'refresh', onClick: onRefresh, disabled: loading || Boolean(job && job.status === 'running') }, t('env.refresh')),
          installable.length > 0
            ? h(Button, { key: 'i', variant: 'primary', icon: 'download', onClick: onInstallAll, disabled: loading || Boolean(job && job.status === 'running') }, t('env.installAll'))
            : null,
        ].filter(Boolean),
      },
      loading
        ? h('div', { className: 'iw-batch-loading' }, h(Spinner, { tone: 'accent' }), t('env.checking'))
        : error
          ? h('div', { className: 'iw-model-error' }, error)
          : h('div', null,
              h('div', { className: 'iw-hint' }, t('env.hint')),
              h('div', { className: 'iw-env-list' }, rows),
              h('div', { className: 'iw-batch-note' }, t('env.legacyNote')),
              h('div', { className: 'iw-batch-note' }, t('env.exportNote')),
              job
                ? h('div', { className: 'iw-env-job' },
                    h('div', { className: 'iw-env-job-title' }, `${job.target} · ${job.status === 'running' ? t('env.running') : job.status === 'done' ? t('env.done') : t('env.failed')}`),
                    h('pre', { className: 'iw-env-log' }, (job.output || '').slice(-20000)))
                : null))
    }

    // -----------------------------------------------------------------------
    // Root panel
    // -----------------------------------------------------------------------

    function Workbench (props) {
      const t = props.t || ((key) => (ZH[key] || key))
      const hostBridge = props.host || {}
      const locale = props.locale || null
      // Track the active locale by id rather than by snapshot identity: a
      // locale snapshot is not required to be referentially stable, and a
      // changing snapshot object would re-render this panel forever.
      const readLocaleId = () => {
        try {
          const snapshot = locale?.getSnapshot ? locale.getSnapshot() : null
          return String(snapshot?.active || snapshot?.id || snapshot?.locale || 'zh')
        } catch {
          return 'zh'
        }
      }
      const [localeId, setLocaleId] = useState(readLocaleId)
      useEffect(() => {
        if (!locale?.subscribe) return undefined
        const update = () => setLocaleId(current => {
          const next = readLocaleId()
          return next === current ? current : next
        })
        update()
        return locale.subscribe(update)
      }, [locale])
      const lang = localeId.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      const tr = useCallback((key) => {
        if (typeof t === 'function') {
          try {
            const value = t(key)
            if (value && value !== key) return value
          } catch {}
        }
        return lang === 'en' ? (EN[key] || key) : (ZH[key] || key)
      }, [t, lang])

      const [loading, setLoading] = useState(true)
      const [state, setState] = useState({ version: '', skill: null, model: null, tasks: [] })
      const [selectedId, setSelectedId] = useState(null)
      const [detail, setDetail] = useState(null)
      const [job, setJob] = useState(null)
      const [tab, setTab] = useState('materials')
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState(null)
      const [query, setQuery] = useState('')
      const [mode, setMode] = useState(() => {
        try { return localStorage.getItem('iw.mode') === 'assistant' ? 'assistant' : 'cases' } catch { return 'cases' }
      })
      const [assistant, setAssistant] = useState({ sessions: [], activeId: '', messages: [], job: null, activeJob: null, context: null, loading: false, error: '' })
      const [assistantQuery, setAssistantQuery] = useState('')
      const [assistantSort, setAssistantSort] = useState(() => {
        try { return localStorage.getItem('iw.assistantSort') || 'updatedDesc' } catch { return 'updatedDesc' }
      })
      const [assistantSortOpen, setAssistantSortOpen] = useState(false)
      const [assistantBatchMode, setAssistantBatchMode] = useState(false)
      const [assistantSelected, setAssistantSelected] = useState(() => new Set())
      const [taskSort, setTaskSort] = useState(() => {
        try { return localStorage.getItem('iw.taskSort') || 'createdDesc' } catch { return 'createdDesc' }
      })
      const [sortOpen, setSortOpen] = useState(false)

      useEffect(() => {
        if (!sortOpen) return undefined
        const close = (event) => {
          if (!event.target.closest('.iw-sort-wrap')) setSortOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
      }, [sortOpen])

      useEffect(() => {
        if (!assistantSortOpen) return undefined
        const close = (event) => {
          if (!event.target.closest('.iw-sort-wrap')) setAssistantSortOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
      }, [assistantSortOpen])
      const [modal, setModal] = useState(null)
      const [assistantRename, setAssistantRename] = useState(null)
      const [folderModal, setFolderModal] = useState(false)
      const [catalog, setCatalog] = useState(null)
      const [savingModel, setSavingModel] = useState(false)
      const [citation, setCitation] = useState(null)
      const [batchImport, setBatchImport] = useState(null)
      const [batchOver, setBatchOver] = useState(false)
      const [envOpen, setEnvOpen] = useState(false)
      const [envData, setEnvData] = useState(null)
      const [envLoading, setEnvLoading] = useState(false)
      const [envError, setEnvError] = useState('')
      const [envJob, setEnvJob] = useState(null)
      const [batchMode, setBatchMode] = useState(false)
      const [batchSelected, setBatchSelected] = useState(() => new Set())
      const [batchConcurrency, setBatchConcurrency] = useState(readBatchConcurrency)
      const [batchRun, setBatchRunState] = useState(() => batchRunStore.value)
      const [batchDelete, setBatchDelete] = useState(null)
      const [batchTick, setBatchTick] = useState(0)
      const batchCancel = batchCancelFlag
      const mountedRef = useRef(true)
      const stateSeq = useRef(0)
      const setBatchRun = (updater) => updateBatchRun(updater)

      useEffect(() => {
        const listener = value => setBatchRunState(value)
        batchRunStore.listeners.add(listener)
        listener(batchRunStore.value)
        return () => { batchRunStore.listeners.delete(listener) }
      }, [])

      useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
      }, [])

      useEffect(() => {
        if (!batchRun?.running) return undefined
        const timer = setInterval(() => setBatchTick(value => value + 1), 1000)
        return () => clearInterval(timer)
      }, [batchRun?.running])

      const noticeTimer = useRef(null)
      const showNotice = useCallback((next) => {
        setNotice(next)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(null), next.tone === 'error' ? 6000 : 2600)
      }, [])
      useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

      const loadState = useCallback(async () => {
        const seq = ++stateSeq.current
        try {
          const data = await request('/state')
          if (seq !== stateSeq.current) return
          setState(data)
          setSelectedId(current => {
            if (current && data.tasks.some(task => task.id === current)) return current
            return data.tasks.length > 0 ? data.tasks[0].id : null
          })
        } catch (error) {
          if (seq !== stateSeq.current) return
          showNotice({ tone: 'error', text: errorText(error) })
        } finally {
          if (seq === stateSeq.current) setLoading(false)
        }
      }, [showNotice])

      const previousBatchRunning = useRef(false)
      useEffect(() => {
        const wasRunning = previousBatchRunning.current
        previousBatchRunning.current = Boolean(batchRun?.running)
        if (wasRunning && batchRun && !batchRun.running) void loadState()
      }, [batchRun?.running, loadState])

      const previousBatchDone = useRef(0)
      useEffect(() => {
        const done = batchRun?.done || 0
        if (batchRun?.running && done !== previousBatchDone.current) {
          previousBatchDone.current = done
          void loadState()
        } else if (!batchRun?.running) {
          previousBatchDone.current = done
        }
      }, [batchRun?.done, batchRun?.running, loadState])

      const loadDetail = useCallback(async (taskId) => {
        if (!taskId) { setDetail(null); return }
        try {
          const data = await request(`/tasks/detail?id=${encodeURIComponent(taskId)}`)
          setDetail(data)
          setJob(data.job || null)
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }, [showNotice])

      useEffect(() => {
        const id = detail?.task?.id
        const status = detail?.analysis?.status
        if (!id || !status) return
        setState(current => {
          const task = (current.tasks || []).find(item => item.id === id)
          if (!task || task.analysisStatus === status) return current
          return {
            ...current,
            tasks: current.tasks.map(item => item.id === id ? { ...item, analysisStatus: status } : item),
          }
        })
      }, [detail?.task?.id, detail?.analysis?.status])

      const loadAssistant = useCallback(async (sessionId = '') => {
        setAssistant(current => ({ ...current, loading: true, error: '' }))
        try {
          const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
          const data = await request(`/assistant${query}`)
          setAssistant({
            sessions: data.sessions || [],
            activeId: data.activeId || '',
            messages: data.messages || [],
            job: data.job || null,
            activeJob: data.activeJob || null,
            context: data.context || null,
            loading: false,
            error: '',
          })
        } catch (error) {
          setAssistant(current => ({ ...current, loading: false, error: errorText(error) }))
        }
      }, [])

      useEffect(() => {
        if (mode === 'assistant') void loadAssistant()
      }, [mode, loadAssistant])

      useEffect(() => {
        const activeJob = assistant.activeJob
        if (mode !== 'assistant' || !activeJob?.id || activeJob.status !== 'running') return undefined
        let alive = true
        const tick = async () => {
          try {
            const data = await request(`/jobs?jobId=${encodeURIComponent(activeJob.id)}`)
            if (!alive) return
            setAssistant(current => ({
              ...current,
              activeJob: data.job || null,
              job: data.job && data.job.sessionId === current.activeId ? data.job : null,
            }))
            if (data.job?.status !== 'running') await loadAssistant(assistant.activeId)
          } catch {}
        }
        const timer = setInterval(tick, 900)
        void tick()
        return () => { alive = false; clearInterval(timer) }
      }, [mode, assistant.activeJob?.id, assistant.activeJob?.status, assistant.activeId, loadAssistant])

      const switchMode = (next) => {
        if (next !== 'cases' && next !== 'assistant') return
        setMode(next)
        try { localStorage.setItem('iw.mode', next) } catch {}
      }

      const sendAssistant = async (text) => {
        const message = String(text || '').trim()
        if (!message || assistant.activeJob?.status === 'running') return
        try {
          setAssistant(current => ({ ...current, error: '' }))
          const data = await request('/assistant/chat', { method: 'POST', json: { message, sessionId: assistant.activeId } })
          setAssistant(current => ({
            ...current,
            sessions: data.sessions || current.sessions,
            activeId: data.activeId || current.activeId,
            messages: data.messages || current.messages,
            job: data.job || null,
            activeJob: data.activeJob || null,
          }))
        } catch (error) {
          setAssistant(current => ({ ...current, error: errorText(error) }))
        }
      }

      const cancelAssistant = async () => {
        try { await request('/assistant/cancel', { method: 'POST', json: {} }) } catch {}
      }

      const createAssistantSession = async () => {
        if (assistant.activeJob?.status === 'running') return
        try {
          const data = await request('/assistant/sessions', { method: 'POST', json: { title: '新对话' } })
          setAssistant({
            sessions: data.sessions || [],
            activeId: data.activeId || '',
            messages: data.messages || [],
            job: data.job || null,
            activeJob: data.activeJob || null,
            context: data.context || null,
            loading: false,
            error: '',
          })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const selectAssistantSession = async (id) => {
        if (!id || id === assistant.activeId) return
        try {
          const data = await request('/assistant/select', { method: 'POST', json: { id } })
          setAssistant({
            sessions: data.sessions || [],
            activeId: data.activeId || id,
            messages: data.messages || [],
            job: data.job || null,
            activeJob: data.activeJob || null,
            context: data.context || null,
            loading: false,
            error: '',
          })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const renameAssistantSession = (session) => {
        if (!session || assistant.activeJob?.status === 'running') return
        setAssistantRename({ id: session.id, title: session.title })
      }

      const confirmAssistantRename = async (title) => {
        const target = assistantRename
        if (!target) return
        setAssistantRename(null)
        try {
          const data = await request('/assistant/rename', { method: 'POST', json: { id: target.id, title } })
          setAssistant(current => ({ ...current, sessions: data.sessions || current.sessions }))
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const deleteAssistantSession = async (session) => {
        if (!session || assistant.activeJob?.status === 'running') return
        if (!window.confirm(tr('assistant.deleteConfirm'))) return
        try {
          const data = await request('/assistant/delete', { method: 'POST', json: { id: session.id } })
          setAssistant({
            sessions: data.sessions || [],
            activeId: data.activeId || '',
            messages: data.messages || [],
            job: data.job || null,
            activeJob: data.activeJob || null,
            context: data.context || null,
            loading: false,
            error: '',
          })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const exportAssistant = (formats = []) => {
        if (!assistant.activeId) return
        const list = Array.isArray(formats) ? formats : [formats]
        const session = (assistant.sessions || []).find(item => item.id === assistant.activeId)
        const base = String(session?.title || '院感助手对话').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '院感助手对话'
        list.forEach((format, index) => {
          setTimeout(() => {
            const link = document.createElement('a')
            link.href = `${API}/assistant/export?sessionId=${encodeURIComponent(assistant.activeId)}&format=${encodeURIComponent(format)}`
            link.download = `${base}.${format}`
            document.body.appendChild(link)
            link.click()
            link.remove()
          }, index * 350)
        })
      }

      const assistantSorters = {
        updatedDesc: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        createdDesc: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        title: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'),
      }
      const assistantSortOptions = [
        ['updatedDesc', tr('assistant.sortUpdated')],
        ['createdDesc', tr('assistant.sortCreated')],
        ['title', tr('assistant.sortTitle')],
      ]
      const assistantSortLabel = (assistantSortOptions.find(([value]) => value === assistantSort) || assistantSortOptions[0])[1]
      const assistantSessions = (assistant.sessions || [])
        .filter(session => {
          const needle = assistantQuery.trim().toLowerCase()
          if (!needle) return true
          return `${session.title || ''} ${session.preview || ''}`.toLowerCase().includes(needle)
        })
        .sort(assistantSorters[assistantSort] || assistantSorters.updatedDesc)
      const assistantStatus = (session) => {
        if (assistant.activeJob?.status === 'running' && assistant.activeJob.sessionId === session.id) return 'running'
        if (session.lastError) return 'error'
        if ((session.messageCount || 0) > 0) return 'ready'
        return 'idle'
      }
      const toggleAssistantSelected = (id) => {
        setAssistantSelected(current => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      const selectAllAssistantSessions = () => {
        setAssistantSelected(current => current.size === assistantSessions.length
          ? new Set()
          : new Set(assistantSessions.map(session => session.id)))
      }
      const toggleAssistantBatchMode = () => {
        if (assistant.activeJob?.status === 'running') return
        setAssistantBatchMode(value => !value)
        setAssistantSelected(new Set())
      }
      const deleteAssistantSelected = async () => {
        const ids = [...assistantSelected]
        if (ids.length === 0 || assistant.activeJob?.status === 'running') return
        if (!window.confirm(`${tr('assistant.deleteSelectedConfirm')} ${ids.length} 个？`)) return
        try {
          const data = await request('/assistant/delete-many', { method: 'POST', json: { ids } })
          setAssistant({
            sessions: data.sessions || [],
            activeId: data.activeId || '',
            messages: data.messages || [],
            job: data.job || null,
            activeJob: data.activeJob || null,
            context: data.context || null,
            loading: false,
            error: '',
          })
          setAssistantBatchMode(false)
          setAssistantSelected(new Set())
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const openCitation = useCallback(async (name, clause) => {
        setCitation({ name, clause, loading: true })
        try {
          const data = await request(`/citations/lookup?name=${encodeURIComponent(name)}&clause=${encodeURIComponent(clause)}`)
          setCitation({ name, clause, data, loading: false })
        } catch (error) {
          setCitation({ name, clause, error: errorText(error), loading: false })
        }
      }, [])

      useEffect(() => { void loadState() }, [loadState])
      useEffect(() => { void loadDetail(selectedId) }, [selectedId, loadDetail])
      useEffect(() => {
        let alive = true
        ;(async () => {
          try {
            const data = await request('/models')
            if (alive) setCatalog(data)
          } catch {}
        })()
        return () => { alive = false }
      }, [])

      // Poll while a job runs: the detail payload carries the live job, so one
      // request keeps stages, streamed text and the transcript in step.
      const activeJobId = detail?.job?.id
      const activeJobStatus = detail?.job?.status
      useEffect(() => {
        if (!activeJobId || activeJobStatus !== 'running' || !selectedId) return undefined
        let alive = true
        const tick = async () => {
          try {
            const data = await request(`/tasks/detail?id=${encodeURIComponent(selectedId)}`)
            if (!alive) return
            setDetail(data)
            setJob(data.job || null)
            if (!data.job || data.job.status !== 'running') {
              void loadState()
            }
          } catch {}
        }
        const timer = setInterval(tick, 900)
        void tick()
        return () => { alive = false; clearInterval(timer) }
      }, [activeJobId, activeJobStatus, selectedId, loadState])

      const refresh = useCallback(async () => {
        await loadState()
        if (selectedId) await loadDetail(selectedId)
      }, [loadState, loadDetail, selectedId])

      const changeSelection = async (selection) => {
        if (savingModel) return
        setSavingModel(true)
        try {
          const data = await request('/models/select', { method: 'POST', json: selection })
          setState(prev => ({ ...prev, model: data.model }))
          showNotice({ tone: 'ok', text: tr('model.switched') })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        } finally {
          setSavingModel(false)
        }
      }

      const createTask = async (form) => {
        const data = await request('/tasks/create', { method: 'POST', json: form })
        setModal(null)
        setDetail(data)
        setSelectedId(data.task.id)
        await loadState()
        showNotice({ tone: 'ok', text: tr('newTask') })
      }

      const updateTask = async (form) => {
        const data = await request('/tasks/update', { method: 'POST', json: { id: detail.task.id, ...form } })
        setModal(null)
        setDetail(data)
        await loadState()
      }

      const renameGroup = async (from, to) => {
        try {
          const data = await request('/groups/rename', { method: 'POST', json: { from, to } })
          setModal(null)
          await loadState()
          if (detail) await loadDetail(detail.task.id)
          showNotice({ tone: 'ok', text: `${tr('task.renameDone')} · ${data.updated}` })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const deleteTask = async () => {
        if (!detail) return
        if (!window.confirm(tr('deleteTaskConfirm'))) return
        await request('/tasks/delete', { method: 'POST', json: { id: detail.task.id } })
        setSelectedId(null)
        setDetail(null)
        await loadState()
      }

      const importDropped = async (entries) => {
        if (!detail) return
        setBusy(tr('folderReading'))
        try {
          const collected = await collectDroppedEntries(entries)
          if (collected.length === 0) {
            showNotice({ tone: 'error', text: tr('folderEmpty') })
            return
          }
          await uploadFiles(collected)
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        } finally {
          setBusy('')
        }
      }

      const uploadFiles = async (files) => {
        if (!detail) return
        const list = Array.from(files || []).map(item => item && item.file
          ? { file: item.file, rel: item.rel || '' }
          : { file: item, rel: item?.webkitRelativePath || '' })
        if (list.length === 0) return
        setBusy(`${tr('importing')} ${list[0].file.name}`)
        const failures = []
        for (let i = 0; i < list.length; i++) {
          const { file, rel } = list[i]
          setBusy(`${tr('importing')} (${i + 1}/${list.length}) ${file.name}`)
          try {
            const query = new URLSearchParams({ id: detail.task.id, name: file.name, rel })
            const data = await request(`/tasks/import?${query.toString()}`, { method: 'POST', body: file })
            if (data?.material?.status !== 'parsed') failures.push(`${file.name}：${data?.material?.error || tr('failed')}`)
          } catch (error) {
            failures.push(`${file.name}：${errorText(error)}`)
          }
        }
        setBusy('')
        await loadDetail(detail.task.id)
        await loadState()
        if (failures.length > 0) showNotice({ tone: 'error', text: `${tr('import.failed')} ${failures.join('；')}` })
        else showNotice({ tone: 'ok', text: `${tr('import.done')} ${list.length}` })
      }

      const importFolderFrom = async (path) => {
        if (!detail) return
        setBusy(tr('folderImporting'))
        try {
          const data = await request('/tasks/import-folder', { method: 'POST', json: { id: detail.task.id, dir: path } })
          const failed = (data.failed || []).map(item => `${item.name}：${item.error}`)
          if (failed.length > 0) showNotice({ tone: 'error', text: `${tr('import.done')} ${data.added.length}，${tr('import.failed')} ${failed.join('；')}` })
          else showNotice({ tone: 'ok', text: `${tr('import.done')} ${data.added.length}` })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        } finally {
          setBusy('')
          setFolderModal(false)
          await loadDetail(detail.task.id)
          await loadState()
        }
      }

      const pickFolder = async () => {
        // A native picker that is dismissed returns null. Only fall back to
        // the manual path dialog when the Host has no directory picker at all.
        if (typeof hostBridge.hasDirectoryPicker === 'function' && !hostBridge.hasDirectoryPicker()) {
          setFolderModal(true)
          return
        }
        try {
          const picked = await hostBridge.pickDirectory?.()
          if (picked) await importFolderFrom(picked)
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const scanBatch = async (root) => {
        const dir = String(root || '').trim()
        if (!dir) return
        const folderName = String(dir).split(/[\\/]/).filter(Boolean).pop() || ''
        setBatchImport({ step: 'list', root: dir, group: folderName, cases: [], selected: new Set(), loading: true, error: '', manual: false })
        try {
          const data = await request('/batches/scan', { method: 'POST', json: { root: dir } })
          setBatchImport({
            step: 'list',
            root: dir,
            group: folderName,
            cases: data.cases || [],
            selected: new Set((data.cases || []).map(item => item.name)),
            loading: false,
            error: '',
            manual: false,
            ignored: data.ignored || [],
          })
        } catch (error) {
          setBatchImport(current => current ? { ...current, step: 'intro', loading: false, error: errorText(error) } : current)
        }
      }

      const openBatchImport = () => {
        setBatchImport({ step: 'intro', root: '', cases: [], selected: new Set(), loading: false, error: '', manual: false })
      }

      const refreshEnvironment = async () => {
        setEnvLoading(true)
        setEnvError('')
        try {
          setEnvData(await request('/environment'))
        } catch (error) {
          setEnvError(errorText(error))
        } finally {
          setEnvLoading(false)
        }
      }

      const openEnvironment = () => {
        setEnvOpen(true)
        setEnvJob(null)
        setEnvError('')
        void refreshEnvironment()
      }

      const pollEnvironmentJob = async (id) => {
        let current = null
        for (let i = 0; i < 600; i += 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          try {
            current = await request(`/environment/job?id=${encodeURIComponent(id)}`)
          } catch (error) {
            setEnvError(errorText(error))
            return null
          }
          setEnvJob(current)
          if (current.status !== 'running') return current
        }
        return current
      }

      const runEnvironmentInstall = async (target) => {
        const install = envData?.install?.[target]
        if (!install?.supported) {
          setEnvError(install?.hint || tr('env.noAutoInstall'))
          return null
        }
        setEnvError('')
        setEnvJob({ target, status: 'running', output: '' })
        try {
          const job = await request('/environment/install', { method: 'POST', json: { target } })
          setEnvJob(job)
          const final = await pollEnvironmentJob(job.id)
          await refreshEnvironment()
          showNotice({
            tone: final?.status === 'done' ? 'ok' : 'error',
            text: final?.status === 'done' ? tr('env.done') : tr('env.failed'),
          })
          return final
        } catch (error) {
          setEnvError(errorText(error))
          setEnvJob(null)
          return null
        }
      }

      const installEnvironment = async (target) => {
        const command = envData?.install?.[target]?.command || ''
        if (!command) return
        if (!window.confirm(tr('env.confirmInstall').replace('{command}', command))) return
        await runEnvironmentInstall(target)
      }

      const installAllEnvironment = async () => {
        const missing = []
        if (!envData?.pdfjs?.ok) missing.push('pdfjs')
        if (!envData?.poppler?.ok) missing.push('poppler')
        const supported = missing.filter(target => envData?.install?.[target]?.supported)
        if (supported.length === 0) {
          setEnvError(tr('env.noMissing'))
          return
        }
        const commands = supported.map(target => envData.install[target].command).filter(Boolean).join('\n')
        if (!window.confirm(tr('env.confirmAll').replace('{commands}', commands))) return
        for (const target of supported) {
          const final = await runEnvironmentInstall(target)
          if (final?.status === 'error') break
        }
      }

      const handleBatchDrop = async (event) => {
        event.preventDefault()
        event.stopPropagation()
        setBatchOver(false)
        if (!batchImport || batchImport.importing) return
        const entries = Array.from(event.dataTransfer?.items || [])
          .map(item => item.webkitGetAsEntry?.())
          .filter(Boolean)
        const dirs = entries.filter(entry => entry.isDirectory)
        if (dirs.length !== 1) {
          showNotice({ tone: 'error', text: tr('batch.dropInvalid') })
          return
        }
        try {
          const caseFiles = new Map()
          for (const dir of dirs) {
            const stripRoot = `${dir.name}/`
            const files = await collectDroppedEntry(dir)
            for (const item of files) {
              let rel = String(item.rel || '')
              if (stripRoot) {
                if (!rel.startsWith(stripRoot)) continue
                rel = rel.slice(stripRoot.length)
              }
              const parts = rel.split('/').filter(Boolean)
              if (parts.length < 2) continue
              const name = parts[0]
              const inner = parts.slice(1).join('/')
              if (!caseFiles.has(name)) caseFiles.set(name, [])
              caseFiles.get(name).push({ file: item.file, rel: inner })
            }
          }
          if (caseFiles.size === 0) throw new Error(tr('batch.dropInvalid'))
          const cases = [...caseFiles.entries()].map(([name, files]) => ({ name, files: files.length }))
          setBatchImport(current => current ? {
            ...current,
            step: 'list',
            root: dirs[0].name,
            group: dirs[0].name,
            cases,
            caseFiles: Object.fromEntries(caseFiles),
            selected: new Set(cases.map(item => item.name)),
            loading: false,
            error: '',
          } : current)
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const chooseBatchFolder = async () => {
        if (typeof hostBridge.hasDirectoryPicker === 'function' && !hostBridge.hasDirectoryPicker()) {
          setBatchImport(current => current ? { ...current, error: tr('batch.pickerUnavailable') } : current)
          return
        }
        try {
          const picked = await hostBridge.pickDirectory?.()
          if (picked) await scanBatch(picked)
        } catch (error) {
          setBatchImport(current => current ? { ...current, error: errorText(error) } : current)
        }
      }

      const toggleBatchCase = (name) => {
        setBatchImport(current => {
          if (!current) return current
          const next = new Set(current.selected)
          if (next.has(name)) next.delete(name)
          else next.add(name)
          return { ...current, selected: next }
        })
      }

      const toggleBatchAll = () => {
        setBatchImport(current => {
          if (!current) return current
          const all = (current.cases || []).map(item => item.name)
          const next = current.selected.size === all.length ? new Set() : new Set(all)
          return { ...current, selected: next }
        })
      }

      const importDroppedBatch = async () => {
        const selected = [...batchImport.selected]
        const caseFiles = batchImport.caseFiles || {}
        const totalFiles = selected.reduce((sum, name) => sum + (caseFiles[name]?.length || 0), 0)
        setBatchImport(current => current ? { ...current, importing: true, error: '', progress: `0/${totalFiles}` } : current)
        const errors = []
        const taskIds = []
        let doneFiles = 0
        for (const name of selected) {
          const files = caseFiles[name] || []
          if (files.length === 0) continue
          let taskId = null
          try {
            const created = await request('/tasks/create', {
              method: 'POST',
              json: { title: name, group: batchImport.group || '' },
            })
            taskId = created.task.id
          } catch (error) {
            errors.push(`${name}：${errorText(error)}`)
            continue
          }
          let parsed = 0
          for (const entry of files) {
            try {
              const query = new URLSearchParams({ id: taskId, name: entry.file.name, rel: entry.rel })
              const data = await request(`/tasks/import?${query.toString()}`, { method: 'POST', body: entry.file })
              if (data?.material?.status === 'parsed') parsed += 1
              else errors.push(`${name}/${entry.rel}：${data?.material?.error || tr('failed')}`)
            } catch (error) {
              errors.push(`${name}/${entry.rel}：${errorText(error)}`)
            }
            doneFiles += 1
            setBatchImport(current => current ? { ...current, progress: `${doneFiles}/${totalFiles}` } : current)
          }
          if (parsed === 0) {
            try { await request('/tasks/delete', { method: 'POST', json: { id: taskId } }) } catch {}
          } else {
            taskIds.push(taskId)
          }
        }
        setBatchImport(null)
        await loadState()
        const failed = errors.length
        showNotice({
          tone: failed > 0 ? 'error' : 'ok',
          text: `${tr('batch.importDone')} ${taskIds.length} · ${tr('batch.failedCount')} ${failed}${errors[0] ? ` · ${errors[0]}` : ''}`,
        })
        if (taskIds[0]) setSelectedId(taskIds[0])
      }

      const importBatch = async () => {
        if (!batchImport) return
        const selected = [...batchImport.selected]
        if (selected.length === 0) return
        if (batchImport.caseFiles) {
          await importDroppedBatch()
          return
        }
        setBatchImport(current => current ? { ...current, importing: true, error: '' } : current)
        try {
          const data = await request('/batches/import', {
            method: 'POST',
            json: { root: batchImport.root, selected, group: batchImport.group || '' },
          })
          setBatchImport(null)
          await loadState()
          const failed = (data.errors || []).length
          showNotice({
            tone: failed > 0 ? 'error' : 'ok',
            text: `${tr('batch.importDone')} ${(data.tasks || []).length} · ${tr('batch.failedCount')} ${failed}`,
          })
          if (data.tasks?.[0]?.id) setSelectedId(data.tasks[0].id)
        } catch (error) {
          setBatchImport(current => current ? { ...current, importing: false, error: errorText(error) } : current)
        }
      }

      const toggleTaskSelection = (id) => {
        setBatchSelected(previous => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const toggleBatchMode = () => {
        setBatchMode(value => !value)
        setBatchSelected(new Set())
        if (batchRun && !batchRun.running) setBatchRun(null)
      }

      const cancelBatchAnalysis = () => {
        batchCancel.current = true
        setBatchRun(current => current ? { ...current, cancelling: true } : current)
        const active = batchRun?.activeIds?.length
          ? batchRun.activeIds
          : (batchRun?.current ? [batchRun.current] : [])
        for (const id of active) {
          void request('/tasks/cancel', { method: 'POST', json: { id } }).catch(() => {})
        }
      }

      const patchBatchItem = (id, patch) => {
        setBatchRun(current => {
          if (!current) return current
          const items = (current.items || []).map(item => item.id === id ? { ...item, ...patch } : item)
          const active = items.filter(item => item.status === 'running')
          return {
            ...current,
            items,
            activeIds: active.map(item => item.id),
            current: active[0]?.id || '',
            currentTitle: active[0]?.title || '',
            stage: active[0]?.stage || '',
          }
        })
      }

      const changeBatchConcurrency = (value) => {
        const number = Math.floor(Number(value))
        if (!Number.isFinite(number) || number < 1) return
        const next = Math.min(number, MAX_BATCH_CONCURRENCY)
        if (number > MAX_BATCH_CONCURRENCY) {
          showNotice({ tone: 'default', text: tr('batch.parallelLimitHit') })
        }
        setBatchConcurrency(next)
        try { localStorage.setItem(BATCH_CONCURRENCY_KEY, String(next)) } catch {}
      }

      const startBatchAnalysis = async () => {
        const ids = [...batchSelected]
        if (ids.length === 0 || (batchRun && batchRun.running)) return
        const requested = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, Number(batchConcurrency) || 4))
        const parallel = Math.min(requested, ids.length)
        const items = ids.map(id => ({
          id,
          title: (state.tasks || []).find(task => task.id === id)?.title || '',
          status: 'queued',
          stage: '排队',
        }))
        batchCancel.current = false
        setBatchRun({
          running: true,
          total: ids.length,
          done: 0,
          activeIds: [],
          concurrency: parallel,
          items,
          current: '',
          currentTitle: '',
          stage: '准备中',
          startedAt: Date.now(),
          cancelling: false,
          errors: [],
        })
        showNotice({ tone: 'ok', text: `${tr('batch.started')} · ${tr('batch.parallel')} ${parallel}` })
        // Give React one paint before the first network round-trip, so the
        // progress banner is visible immediately.
        await new Promise(resolve => setTimeout(resolve, 50))

        const queue = ids.slice()
        const runOne = async (id) => {
          if (batchCancel.current) return
          patchBatchItem(id, { status: 'running', stage: '启动中' })
          if (mountedRef.current) markTaskRunning(id)
          let finalStatus = 'done'
          try {
            const data = await request('/tasks/analyze', { method: 'POST', json: { id } })
            const jobId = data.job?.id
            while (jobId && !batchCancel.current) {
              await new Promise(resolve => setTimeout(resolve, 1000))
              try {
                const polled = await request(`/jobs?taskId=${encodeURIComponent(id)}&jobId=${encodeURIComponent(jobId)}`)
                patchBatchItem(id, { stage: polled.job?.stage || '分析中' })
                if (polled.job?.status !== 'running') {
                  if (polled.job?.status === 'error') finalStatus = 'error'
                  break
                }
              } catch {
                break
              }
            }
            if (batchCancel.current) {
              await request('/tasks/cancel', { method: 'POST', json: { id } }).catch(() => {})
              patchBatchItem(id, { status: 'cancelled', stage: '已取消' })
            } else {
              patchBatchItem(id, {
                status: finalStatus === 'error' ? 'error' : 'done',
                stage: finalStatus === 'error' ? '失败' : '完成',
              })
            }
          } catch (error) {
            patchBatchItem(id, { status: 'error', stage: '失败' })
            setBatchRun(current => current ? { ...current, errors: [...current.errors, { id, error: errorText(error) }] } : current)
          }
          setBatchRun(current => current ? { ...current, done: (current.done || 0) + 1 } : current)
          if (mountedRef.current) await loadState()
        }

        const workers = Array.from({ length: parallel }, async () => {
          while (!batchCancel.current) {
            const id = queue.shift()
            if (!id) return
            await runOne(id)
          }
        })
        await Promise.all(workers)

        setBatchRun(current => current ? {
          ...current,
          running: false,
          activeIds: [],
          current: '',
          currentTitle: '',
          stage: '',
          items: (current.items || []).map(item => item.status === 'queued'
            ? { ...item, status: 'cancelled', stage: '已取消' }
            : item),
        } : current)
        if (mountedRef.current) {
          setBatchSelected(new Set())
          await loadState()
          showNotice({
            tone: batchCancel.current ? 'default' : 'ok',
            text: batchCancel.current ? tr('analysis.cancelled') : tr('batch.done'),
          })
        }
      }

      const openBatchDelete = () => {
        if (batchRun && batchRun.running) return
        setBatchDelete({ selected: new Set(), deleting: false, error: '' })
      }

      const toggleBatchDelete = (id) => {
        setBatchDelete(current => {
          if (!current) return current
          const next = new Set(current.selected)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { ...current, selected: next }
        })
      }

      const toggleAllBatchDelete = () => {
        const all = (state.tasks || []).map(task => task.id)
        setBatchDelete(current => {
          if (!current) return current
          const next = current.selected.size === all.length ? new Set() : new Set(all)
          return { ...current, selected: next }
        })
      }

      const submitBatchDelete = async () => {
        if (!batchDelete) return
        const ids = [...batchDelete.selected]
        if (ids.length === 0 || batchDelete.deleting) return
        if (!window.confirm(`${tr('batch.deleteConfirm')}\n${ids.length} 个任务`)) return
        setBatchDelete(current => current ? { ...current, deleting: true, error: '' } : current)
        try {
          for (const id of ids) {
            await request('/tasks/delete', { method: 'POST', json: { id } })
          }
          if (detail && ids.includes(detail.task.id)) {
            setSelectedId(null)
            setDetail(null)
          }
          setBatchSelected(new Set())
          setBatchDelete(null)
          await loadState()
          showNotice({ tone: 'ok', text: tr('batch.deleted') })
        } catch (error) {
          setBatchDelete(current => current ? { ...current, deleting: false, error: errorText(error) } : current)
        }
      }

      const deleteMaterial = async (material) => {
        if (!window.confirm(`${tr('deleteMaterialConfirm')}\n${material.name}`)) return
        try {
          await request('/tasks/materials/delete', { method: 'POST', json: { id: detail.task.id, materialId: material.id } })
          await loadDetail(detail.task.id)
          await loadState()
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const viewMaterial = async (material) => {
        try {
          const text = await fetch(`${API}/tasks/material?id=${encodeURIComponent(detail.task.id)}&materialId=${encodeURIComponent(material.id)}`, { credentials: 'same-origin' })
          const body = await text.text()
          setModal({ kind: 'material', material, text: body.slice(0, 60000) })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const downloadMaterial = (material) => {
        const link = document.createElement('a')
        link.href = `${API}/tasks/material?id=${encodeURIComponent(detail.task.id)}&materialId=${encodeURIComponent(material.id)}&mode=file`
        link.download = material.name
        document.body.appendChild(link)
        link.click()
        link.remove()
      }

      const downloadReport = (formats) => {
        if (!detail) return
        const list = Array.isArray(formats) ? formats : [formats]
        list.forEach((format, index) => {
          setTimeout(() => {
            const link = document.createElement('a')
            link.href = `${API}/tasks/report?id=${encodeURIComponent(detail.task.id)}&format=${format}`
            link.download = `院感分析报告.${format}`
            document.body.appendChild(link)
            link.click()
            link.remove()
          }, index * 350)
        })
      }

      const markTaskRunning = (id) => {
        // Invalidate any in-flight /state response that predates this start.
        stateSeq.current += 1
        setState(current => ({
          ...current,
          tasks: (current.tasks || []).map(task => task.id === id ? { ...task, analysisStatus: 'running' } : task),
        }))
      }

      const startAnalysis = async (focus) => {
        if (!detail) return
        const failed = (detail.materials || []).filter(material => material.status !== 'parsed')
        if (failed.length > 0) {
          const names = failed.slice(0, 5).map(material => material.name).join('、') + (failed.length > 5 ? ' 等' : '')
          if (!window.confirm(tr('analysis.failedConfirm').replace('{files}', names))) return
        }
        try {
          setBusy('')
          markTaskRunning(detail.task.id)
          const data = await request('/tasks/analyze', { method: 'POST', json: { id: detail.task.id, focus } })
          setJob(data.job)
          setDetail(current => current ? { ...current, job: data.job, analysis: { ...current.analysis, status: 'running', error: '' } } : current)
          setTab('analysis')
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const cancelJob = async () => {
        if (!detail) return
        try {
          await request('/tasks/cancel', { method: 'POST', json: { id: detail.task.id } })
          showNotice({ tone: 'ok', text: tr('analysis.cancelled') })
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const ask = async (message) => {
        if (!detail) return
        try {
          const data = await request('/tasks/chat', { method: 'POST', json: { id: detail.task.id, message } })
          setDetail(data.detail)
          setJob(data.job)
          setTab('chat')
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const clearChat = async () => {
        if (!detail) return
        if (!window.confirm(tr('chat.clearConfirm'))) return
        try {
          await request('/tasks/chat/clear', { method: 'POST', json: { id: detail.task.id } })
          await loadDetail(detail.task.id)
        } catch (error) {
          showNotice({ tone: 'error', text: errorText(error) })
        }
      }

      const exportChat = (formats) => {
        if (!detail) return
        const list = Array.isArray(formats) ? formats : [formats]
        const base = String(detail.task.title || '病例问答').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '病例问答'
        list.forEach((format, index) => {
          setTimeout(() => {
            const link = document.createElement('a')
            link.href = `${API}/tasks/chat/export?id=${encodeURIComponent(detail.task.id)}&format=${encodeURIComponent(format)}`
            link.download = `${base}-病例问答.${format}`
            document.body.appendChild(link)
            link.click()
            link.remove()
          }, index * 350)
        })
      }

      const tasks = state.tasks || []
      const knownGroups = [...new Set(tasks.map(task => String(task.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'))
      const filtered = query.trim()
        ? tasks.filter(task => `${task.title} ${task.patientName} ${task.group || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
        : tasks
      const chatCount = detail?.chat?.length || 0
      const materialCount = detail?.materials?.length || 0
      const analysisStatus = detail?.analysis?.status || 'idle'

      const sorters = {
        createdDesc: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        createdAsc: (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
        updatedDesc: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        title: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'),
      }
      const sorted = [...filtered].sort(sorters[taskSort] || sorters.createdDesc)
      const ungrouped = tr('task.ungrouped')
      const groupMap = new Map()
      for (const task of sorted) {
        const name = String(task.group || '').trim() || ungrouped
        if (!groupMap.has(name)) groupMap.set(name, [])
        groupMap.get(name).push(task)
      }
      const groups = [...groupMap.entries()]
      groups.sort((a, b) => {
        if (a[0] === ungrouped) return 1
        if (b[0] === ungrouped) return -1
        return 0
      })
      const showGroupHeader = groups.length > 1 || (groups[0] && groups[0][0] !== ungrouped)

      const renderTaskCard = (task) => {
        const active = task.id === selectedId
        const selected = batchSelected.has(task.id)
        const batchItem = batchRun?.items?.find(item => item.id === task.id)
        const batchActive = Boolean(batchRun?.running && batchItem?.status === 'running')
        const batchQueued = Boolean(batchRun?.running && batchItem?.status === 'queued')
        // The detail payload is fresher than the task list while this case is
        // selected; use it so a finished run cannot keep a running dot.
        const displayStatus = task.id === selectedId && detail?.analysis?.status
          ? detail.analysis.status
          : task.analysisStatus
        const dotStatus = batchActive ? 'running' : batchQueued ? 'queued' : displayStatus
        const statusLine = batchActive
          ? `${tr('batch.running')}${batchItem?.stage ? ` · ${batchItem.stage}` : ''}`
          : batchQueued
            ? tr('batch.queued')
            : displayStatus === 'done' ? tr('analysis.done') : formatTime(task.updatedAt)
        return h('div', {
          key: task.id,
          className: 'iw-card-wrap',
          'data-selected': selected ? 'true' : 'false',
          'data-batch-active': batchActive ? 'true' : 'false',
        },
        batchMode
          ? h('input', {
              type: 'checkbox',
              className: 'iw-card-check',
              checked: selected,
              disabled: Boolean(batchRun && batchRun.running),
              onChange: () => toggleTaskSelection(task.id),
              'aria-label': task.title,
            })
          : null,
        h('button', {
          type: 'button',
          className: 'iw-card',
          'data-active': active ? 'true' : 'false',
          onClick: () => (batchMode && !(batchRun && batchRun.running) ? toggleTaskSelection(task.id) : setSelectedId(task.id)),
        },
        h('div', { className: 'iw-card-row' },
          h('span', { className: 'iw-dot', 'data-status': dotStatus }),
          h('span', { className: 'iw-card-title' }, task.title),
          batchActive || displayStatus === 'running' ? h(Spinner) : null),
        h('div', { className: 'iw-card-sub' },
          task.patientName ? h('span', null, task.patientName) : null,
          h('span', null, `${task.materialCount} ${tr('materialCount')}`),
          h('span', null, statusLine))))
      }

      const taskGroups = groups.map(([name, items]) => h('div', { className: 'iw-group', key: name },
        showGroupHeader
          ? h('div', { className: 'iw-group-head' },
              h('span', { className: 'iw-group-name' }, name),
              h('span', { className: 'iw-group-count' }, items.length))
          : null,
        items.map(renderTaskCard)))

      const sortOptions = [
        ['createdDesc', tr('task.sortCreatedDesc')],
        ['createdAsc', tr('task.sortCreatedAsc')],
        ['updatedDesc', tr('task.sortUpdatedDesc')],
        ['title', tr('task.sortTitle')],
      ]
      const taskSortLabel = (sortOptions.find(([value]) => value === taskSort) || sortOptions[0])[1]
      const chooseSort = (value) => {
        setTaskSort(value)
        setSortOpen(false)
        try { localStorage.setItem('iw.taskSort', value) } catch {}
      }
      const sortControl = tasks.length > 1
        ? h('div', { className: 'iw-sort-wrap' },
            h(Button, {
              icon: 'sort',
              className: 'iw-sort-btn',
              title: `${tr('task.sort')}：${taskSortLabel}`,
              onClick: () => setSortOpen(value => !value),
            }),
            sortOpen
              ? h('div', { className: 'iw-sort-menu' }, sortOptions.map(([value, label]) => h('button', {
                  key: value,
                  type: 'button',
                  className: 'iw-sort-item',
                  'data-active': value === taskSort ? 'true' : 'false',
                  onClick: () => chooseSort(value),
                }, label)))
              : null)
        : null

      const listEmpty = h('div', {
        style: { padding: '18px 12px', fontSize: 12.5, color: 'var(--dsw-alias-label-secondary,#6b7683)', lineHeight: 1.6 },
      }, loading ? tr('loading') : (tasks.length === 0 ? tr('empty.hint') : tr('search')))

      const searchBox = tasks.length > 0
        ? h('input', {
          className: 'iw-search',
          value: query,
          placeholder: tr('search'),
          onChange: (event) => setQuery(event.target.value),
        })
        : null
      const searchRow = tasks.length > 0
        ? h('div', { className: 'iw-search-row' }, searchBox, sortControl)
        : null

      const batchElapsedSecs = batchRun?.startedAt ? Math.max(0, Math.floor((Date.now() - batchRun.startedAt) / 1000)) : 0
      const batchActiveItems = (batchRun?.items || []).filter(item => item.status === 'running')
      const showBatchBar = Boolean(batchMode || (batchRun && batchRun.running))
      const batchBar = showBatchBar
        ? h('div', { className: 'iw-batch-bar' },
            batchRun && batchRun.running
              ? h('div', { className: 'iw-batch-progress' },
                  h('div', { className: 'iw-batch-row-top' },
                    h(Spinner, { tone: 'accent' }),
                    h('span', { className: 'iw-batch-run-label' },
                      `${batchRun.cancelling ? tr('analysis.cancelling') : tr('batch.running')} ${batchRun.done}/${batchRun.total}`),
                    h(Button, { icon: 'close', onClick: cancelBatchAnalysis }, tr('analysis.cancel'))),
                  h('div', { className: 'iw-batch-current' },
                    batchActiveItems.length > 1
                      ? `${batchActiveItems.length} ${tr('batch.activeCount')}`
                      : (batchRun.currentTitle || tr('batch.running')),
                    batchActiveItems.length === 1 && batchRun.stage ? h('span', null, ` · ${batchRun.stage}`) : null),
                  h('div', { className: 'iw-batch-track' },
                    h('div', {
                      className: 'iw-batch-fill',
                      style: { width: `${batchRun.total ? Math.round(batchRun.done / batchRun.total * 100) : 0}%` },
                    })),
                  h('div', { className: 'iw-batch-sub' },
                    `${tr('batch.completed')} ${batchRun.done} / ${tr('batch.total')} ${batchRun.total} · ${tr('batch.parallel')} ${batchRun.concurrency || 1} · ${Math.floor(batchElapsedSecs / 60)}:${String(batchElapsedSecs % 60).padStart(2, '0')}`))
              : h('div', { className: 'iw-batch-progress' },
                  h('span', null, `${tr('batch.selectedCount')} ${batchSelected.size}`),
                  h('div', { className: 'iw-batch-controls' },
                    h('label', { className: 'iw-batch-concurrency', title: tr('batch.parallelHint') },
                      tr('batch.parallel'),
                      h('input', {
                        className: 'iw-batch-input',
                        type: 'number',
                        min: 1,
                        max: MAX_BATCH_CONCURRENCY,
                        step: 1,
                        value: batchConcurrency,
                        onChange: (event) => changeBatchConcurrency(event.target.value),
                      }),
                      h('span', { className: 'iw-batch-limit' }, tr('batch.parallelLimit'))),
                    h(Button, {
                      variant: 'primary',
                      icon: 'check',
                      disabled: batchSelected.size === 0,
                      onClick: startBatchAnalysis,
                    }, tr('batch.start'))))
          )
        : null

      const assistantSortMenu = assistantSortOpen
        ? h('div', { className: 'iw-sort-menu' }, assistantSortOptions.map(([value, label]) => h('button', {
            key: value,
            type: 'button',
            className: 'iw-sort-item',
            'data-active': value === assistantSort ? 'true' : 'false',
            onClick: () => {
              setAssistantSort(value)
              setAssistantSortOpen(false)
              try { localStorage.setItem('iw.assistantSort', value) } catch {}
            },
          }, label)))
        : null
      const assistantSearchRow = assistant.sessions.length > 0
        ? h('div', { className: 'iw-search-row' },
            h('input', {
              className: 'iw-search',
              value: assistantQuery,
              placeholder: tr('assistant.search'),
              onChange: (event) => setAssistantQuery(event.target.value),
            }),
            h('div', { className: 'iw-sort-wrap' },
              h(Button, {
                icon: 'sort',
                className: 'iw-sort-btn',
                title: `${tr('assistant.sort')}：${assistantSortLabel}`,
                onClick: () => setAssistantSortOpen(value => !value),
              }),
              assistantSortMenu))
        : null
      const assistantBatchBar = assistantBatchMode
        ? h('div', { className: 'iw-batch-bar' },
            h('div', { className: 'iw-batch-progress' },
              h('span', null, `${tr('assistant.selectedCount')} ${assistantSelected.size}`),
              h('div', { className: 'iw-batch-controls' },
                h(Button, { onClick: selectAllAssistantSessions }, tr('assistant.selectAll')),
                h(Button, { variant: 'primary', icon: 'trash', disabled: assistantSelected.size === 0, onClick: deleteAssistantSelected }, tr('assistant.batchDelete')),
                h(Button, { onClick: toggleAssistantBatchMode }, tr('assistant.batchExit')))))
        : null
      const assistantSidebar = h('aside', { className: 'iw-side' },
        h('div', { className: 'iw-side-head' },
          h('div', { className: 'iw-side-title' }, h('span', null, tr('assistant.title'))),
          h('div', { className: 'iw-side-actions' },
            h(Button, {
              icon: 'plus',
              onClick: createAssistantSession,
              disabled: assistant.activeJob?.status === 'running',
            }, tr('assistant.newChat')),
            h(IconButton, {
              icon: assistantBatchMode ? 'close' : 'trash',
              title: assistantBatchMode ? tr('assistant.batchExit') : tr('assistant.batchDelete'),
              variant: assistantBatchMode ? undefined : 'danger',
              onClick: toggleAssistantBatchMode,
              disabled: assistant.activeJob?.status === 'running' || assistant.sessions.length === 0,
            })),
          assistantSearchRow),
        h('div', { className: 'iw-assistant-sessions' },
          assistantSessions.length === 0
            ? h('div', { className: 'iw-assistant-empty-list' }, assistant.sessions.length === 0 ? tr('assistant.emptyTitle') : tr('assistant.search'))
            : assistantSessions.map(session => {
                const status = assistantStatus(session)
                return h('div', {
                  key: session.id,
                  className: 'iw-assistant-session',
                  'data-active': session.id === assistant.activeId ? 'true' : 'false',
                  'data-batch': assistantBatchMode ? 'true' : 'false',
                },
                h('span', {
                  className: 'iw-assistant-dot',
                  'data-status': status,
                  title: tr(`assistant.status.${status}`),
                }),
                assistantBatchMode
                  ? h('input', {
                      type: 'checkbox',
                      className: 'iw-assistant-check',
                      checked: assistantSelected.has(session.id),
                      onChange: () => toggleAssistantSelected(session.id),
                    })
                  : null,
                h('button', {
                  type: 'button',
                  className: 'iw-assistant-session-main',
                  onClick: () => assistantBatchMode ? toggleAssistantSelected(session.id) : selectAssistantSession(session.id),
                },
                h('div', { className: 'iw-assistant-session-title' }, session.title),
                h('div', { className: 'iw-assistant-session-meta' },
                  `${session.messageCount || 0} 条 · ${formatTime(session.updatedAt)}`,
                  session.preview ? ` · ${session.preview}` : '')),
                assistantBatchMode
                  ? null
                  : h('div', { className: 'iw-assistant-session-actions' },
                      h(IconButton, {
                        icon: 'edit',
                        title: tr('assistant.renamePrompt'),
                        onClick: () => renameAssistantSession(session),
                        disabled: assistant.activeJob?.status === 'running',
                      }),
                      h(IconButton, {
                        icon: 'trash',
                        title: tr('assistant.deleteConfirm'),
                        variant: 'danger',
                        onClick: () => deleteAssistantSession(session),
                        disabled: assistant.activeJob?.status === 'running',
                      })))
              })),
        assistantBatchBar)

      const caseSidebar = h('aside', { className: 'iw-side' },
        h('div', { className: 'iw-side-head' },
          h('div', { className: 'iw-side-title' }, h('span', null, `${tr('tasks')} · ${tasks.length}`)),
          h('div', { className: 'iw-side-actions' },
            h(Button, { icon: 'folder', onClick: openBatchImport, disabled: Boolean(batchRun && batchRun.running) }, tr('batch.import')),
            h(Button, {
              icon: batchMode ? 'close' : 'check',
              onClick: toggleBatchMode,
              disabled: Boolean(batchRun && batchRun.running && !batchMode),
            }, batchMode ? tr('batch.exit') : tr('batch.advance')),
            h(IconButton, {
              icon: 'trash',
              title: tr('batch.delete'),
              variant: 'danger',
              onClick: openBatchDelete,
              disabled: Boolean(batchRun && batchRun.running),
            })),
          searchRow),
        h('div', { className: 'iw-list' }, sorted.length === 0 ? listEmpty : taskGroups),
        batchBar)

      const sidebar = mode === 'assistant' ? assistantSidebar : caseSidebar

      const brand = h('div', { className: 'iw-brand' },
        h('div', { className: 'iw-brand-mark' }, h(BrandIcon, { size: 30 })),
        h('div', { className: 'iw-brand-text' },
          h('div', { className: 'iw-brand-title' }, tr('app.title')),
          h('div', { className: 'iw-brand-sub' }, tr('app.subtitle'))))

      const providerList = catalog?.providers || (state.model?.provider
        ? [{
            id: state.model.provider,
            name: state.model.providerName || state.model.provider,
            models: [{
              id: state.model.model,
              name: state.model.modelName || state.model.model,
              efforts: state.model.effortOptions || [],
              defaultEffort: state.model.defaultEffort,
            }],
          }]
        : [])
      const selectedKey = state.model?.provider ? `${state.model.provider}::${state.model.model}` : ''
      const selectedModel = providerList
        .flatMap(provider => provider.models.map(model => ({ ...model, providerId: provider.id })))
        .find(model => model.providerId === state.model?.provider && model.id === state.model?.model)
      const effortList = selectedModel?.efforts || state.model?.effortOptions || []

      const modelSelect = state.model && !state.model.error
        ? h('select', {
            className: 'iw-select',
            value: selectedKey,
            disabled: savingModel || providerList.length === 0,
            title: tr('model.selectTitle'),
            onChange: (event) => {
              const [providerId, ...rest] = String(event.target.value).split('::')
              const modelId = rest.join('::')
              const provider = providerList.find(item => item.id === providerId)
              const model = provider?.models.find(item => item.id === modelId)
              if (!model) return
              const effort = model.defaultEffort || (model.efforts?.[0]?.id) || ''
              void changeSelection({ provider: providerId, model: modelId, reasoningEffort: effort })
            },
          },
          providerList.map(provider => h('optgroup', { key: provider.id, label: provider.name },
            provider.models.map(model => h('option', { key: model.id, value: `${provider.id}::${model.id}` }, model.name)))))
        : state.model?.error
          ? h(Chip, { tone: 'warn', title: state.model.error }, tr('model.unavailable'))
          : null

      const effortSelect = state.model && !state.model.error
        ? h('select', {
            className: 'iw-select iw-effort-select',
            value: state.model.reasoningEffort || '',
            disabled: savingModel || effortList.length === 0,
            title: tr('model.effortTitle'),
            onChange: (event) => {
              void changeSelection({
                provider: state.model.provider,
                model: state.model.model,
                reasoningEffort: String(event.target.value),
              })
            },
          },
          effortList.length === 0
            ? h('option', { value: '' }, '—')
            : effortList.map(effort => h('option', { key: effort.id, value: effort.id }, effort.name)))
        : null

      const versionChip = state.version
        ? h(Chip, { title: tr('app.versionTitle') }, `v${state.version}`)
        : null

      // No `data-window-drag` here: the frame already owns the drag strip above
      // this panel, and a drag region would swallow clicks on the header buttons.
      const modeSwitch = h('div', { className: 'iw-mode-switch' },
        h('button', {
          type: 'button',
          'data-active': mode === 'cases' ? 'true' : 'false',
          onClick: () => switchMode('cases'),
        }, tr('mode.cases')),
        h('button', {
          type: 'button',
          'data-active': mode === 'assistant' ? 'true' : 'false',
          onClick: () => switchMode('assistant'),
        }, tr('mode.assistant')))

      const header = h('header', { className: 'iw-header' },
        brand,
        modeSwitch,
        h('div', { className: 'iw-header-spacer' }),
        h('div', { className: 'iw-header-meta' },
          h(IconButton, { icon: 'sliders', title: tr('env.open'), onClick: openEnvironment }),
          modelSelect,
          effortSelect,
          versionChip,
          h(Button, { icon: 'refresh', onClick: mode === 'assistant' ? loadAssistant : refresh }, tr('refresh')),
          mode === 'assistant'
            ? null
            : h(Button, { variant: 'primary', icon: 'plus', onClick: () => setModal({ kind: 'task' }) }, tr('newTask'))))

      const emptyMain = h('div', { className: 'iw-empty' },
        h('div', { className: 'iw-empty-inner' },
          h('div', { className: 'iw-empty-icon' }, h(BrandIcon, { size: 40 })),
          h('div', { className: 'iw-empty-title' }, tasks.length === 0 ? tr('empty.title') : tr('empty.select')),
          h('div', { className: 'iw-empty-text' }, tr('empty.hint')),
          h(Button, { variant: 'primary', icon: 'plus', onClick: () => setModal({ kind: 'task' }) }, tr('newTask'))))

      const detailTitle = detail
        ? h('div', { className: 'iw-detail-title-row' },
          h('div', { style: { minWidth: 0 } },
            h('h1', { className: 'iw-detail-title' }, detail.task.title),
            h('div', { className: 'iw-detail-sub' },
              detail.task.patientName ? h('span', null, detail.task.patientName) : null,
              detail.task.sex ? h('span', null, detail.task.sex) : null,
              detail.task.age ? h('span', null, `${detail.task.age} 岁`) : null,
              h('span', null, `${materialCount} ${tr('materialCount')}`),
              h('span', null, formatTime(detail.task.updatedAt)),
              detail.task.note
                ? h('span', { title: detail.task.note }, detail.task.note.length > 40 ? `${detail.task.note.slice(0, 40)}…` : detail.task.note)
                : null)),
          h('div', { className: 'iw-detail-actions' },
            h(IconButton, { icon: 'edit', title: tr('task.edit'), onClick: () => setModal({ kind: 'task-edit' }) }),
            h(IconButton, { icon: 'trash', title: tr('deleteTask'), variant: 'danger', onClick: deleteTask })))
        : null

      const tabs = detail
        ? h('div', { className: 'iw-tabs' },
          h('button', {
            type: 'button',
            className: 'iw-tab',
            'data-active': tab === 'materials' ? 'true' : 'false',
            onClick: () => setTab('materials'),
          }, h(Icon, { name: 'files', size: 14 }), tr('materials'), h('span', { className: 'iw-tab-count' }, materialCount)),
          h('button', {
            type: 'button',
            className: 'iw-tab',
            'data-active': tab === 'analysis' ? 'true' : 'false',
            onClick: () => setTab('analysis'),
          }, h(Icon, { name: 'spark', size: 14 }), tr('analysis'),
          analysisStatus === 'running' ? h(Spinner) : null,
          analysisStatus !== 'idle'
            ? h('span', { className: 'iw-tab-count' }, analysisStatus === 'done' ? '✓' : analysisStatus === 'error' ? '!' : '…')
            : null),
          h('button', {
            type: 'button',
            className: 'iw-tab',
            'data-active': tab === 'timeline' ? 'true' : 'false',
            onClick: () => setTab('timeline'),
          }, h(Icon, { name: 'clock', size: 14 }), tr('timeline')),
          h('button', {
            type: 'button',
            className: 'iw-tab',
            'data-active': tab === 'chat' ? 'true' : 'false',
            onClick: () => setTab('chat'),
          }, h(Icon, { name: 'chat', size: 14 }), tr('chat'), chatCount > 0 ? h('span', { className: 'iw-tab-count' }, chatCount) : null))
        : null

      const tabContent = detail
        ? h('div', { className: 'iw-content' },
          tab === 'materials'
            ? h(MaterialsTab, {
              detail,
              t: tr,
              busy,
              onImportFiles: uploadFiles,
              onImportDropped: importDropped,
              onImportFolder: pickFolder,
              onDelete: deleteMaterial,
              onView: viewMaterial,
              onDownload: downloadMaterial,
            })
            : tab === 'analysis'
              ? h(AnalysisTab, {
                detail,
                job,
                t: tr,
                busy,
                onStart: startAnalysis,
                onCancel: cancelJob,
                onDownload: downloadReport,
                onNotice: showNotice,
                onCite: openCitation,
              })
              : tab === 'timeline'
                ? h(TimelineTab, { key: detail.task.id, detail, t: tr })
                : h(ChatTab, {
                  detail,
                  job,
                  t: tr,
                  contextWindow: state.model?.contextWindow,
                  busy,
                  onAsk: ask,
                  onClear: clearChat,
                  onExport: exportChat,
                  onCite: openCitation,
                }))
        : null

      const batchElapsed = batchRun?.startedAt ? Math.max(0, Math.floor((Date.now() - batchRun.startedAt) / 1000)) : 0
      const batchBanner = batchRun?.running
        ? h('div', { className: 'iw-batch-banner' },
            h(Spinner, { tone: 'accent' }),
            h('div', { className: 'iw-batch-banner-text' },
              h('div', { className: 'iw-batch-banner-title' },
                `${batchRun.cancelling ? tr('analysis.cancelling') : tr('batch.running')} ${batchRun.done}/${batchRun.total}`),
              h('div', { className: 'iw-batch-banner-sub' },
                [
                  `${tr('batch.parallel')} ${batchRun.concurrency || 1}`,
                  batchRun.activeIds?.length ? `${tr('batch.activeCount')} ${batchRun.activeIds.length}` : '',
                  batchRun.currentTitle,
                  batchRun.stage,
                  `${Math.floor(batchElapsed / 60)}:${String(batchElapsed % 60).padStart(2, '0')}`,
                ].filter(Boolean).join(' · '))),
            h(Button, { icon: 'close', onClick: cancelBatchAnalysis }, tr('analysis.cancel')))
        : null

      const main = mode === 'assistant'
        ? h('main', { className: 'iw-main' },
            h(AssistantPanel, {
              t: tr,
              messages: assistant.messages,
              job: assistant.job,
              context: assistant.context,
              contextWindow: state.model?.contextWindow,
              otherRunning: assistant.activeJob?.status === 'running' && assistant.activeJob?.sessionId !== assistant.activeId,
              loading: assistant.loading,
              error: assistant.error,
              onSend: sendAssistant,
              onCancel: cancelAssistant,
              onExport: exportAssistant,
              onCite: openCitation,
            }))
        : h('main', { className: 'iw-main' },
            batchBanner,
            detail
              ? h(React.Fragment, null, h('div', { className: 'iw-detail-head' }, detailTitle, tabs), tabContent)
              : emptyMain)

      const toast = notice
        ? h('div', { className: 'iw-toast', 'data-tone': notice.tone === 'error' ? 'error' : 'default' },
          h(Icon, { name: notice.tone === 'error' ? 'alert' : 'check', size: 14 }),
          h('span', null, notice.text))
        : null

      const taskModal = modal && modal.kind === 'task'
        ? h(TaskModal, { t: tr, groups: knownGroups, onClose: () => setModal(null), onSubmit: createTask })
        : null

      const assistantRenameModal = assistantRename
        ? h(AssistantRenameModal, {
            t: tr,
            session: assistantRename,
            onClose: () => setAssistantRename(null),
            onSubmit: confirmAssistantRename,
          })
        : null

      const editModal = modal && modal.kind === 'task-edit' && detail
        ? h(TaskModal, { t: tr, groups: knownGroups, initial: detail.task, onClose: () => setModal(null), onSubmit: updateTask, onRenameGroup: renameGroup })
        : null

      const materialModal = modal && modal.kind === 'material'
        ? h(Modal, {
          title: `${tr('excerpt')} · ${modal.material.name}`,
          wide: true,
          onClose: () => setModal(null),
          footer: [
            h(Button, { key: 'd', icon: 'download', onClick: () => downloadMaterial(modal.material) }, tr('download')),
            h(Button, { key: 'c', variant: 'primary', onClick: () => setModal(null) }, tr('close')),
          ],
        }, h('div', { className: 'iw-pre' }, modal.text || tr('noExcerpt')))
        : null

      const folderModalElement = folderModal
        ? h(FolderModal, { t: tr, onClose: () => setFolderModal(false), onSubmit: importFolderFrom })
        : null

      const environmentModalElement = envOpen
        ? h(EnvironmentModal, {
            t: tr,
            data: envData,
            loading: envLoading,
            error: envError,
            job: envJob,
            onClose: () => setEnvOpen(false),
            onRefresh: refreshEnvironment,
            onInstall: installEnvironment,
            onInstallAll: installAllEnvironment,
          })
        : null

      const batchStep = batchImport
        ? (batchImport.loading || batchImport.cases.length > 0 ? 'list' : 'intro')
        : 'intro'

      const batchFooter = batchImport
        ? [
            h(Button, { key: 'c', onClick: () => setBatchImport(null) }, tr('close')),
            batchStep === 'list'
              ? h(Button, {
                  key: 'i',
                  variant: 'primary',
                  disabled: Boolean(batchImport.importing) || batchImport.selected.size === 0,
                  onClick: importBatch,
                }, batchImport.importing ? tr('batch.importing') : tr('batch.importSelected'))
              : null,
          ].filter(Boolean)
        : null

      const batchStepRow = (number, title, description) => h('div', { className: 'iw-batch-step' },
        h('span', { className: 'iw-batch-step-no' }, number),
        h('div', null,
          h('div', { className: 'iw-batch-step-title' }, title),
          h('div', { className: 'iw-batch-step-desc' }, description)))

      const batchBody = !batchImport
        ? null
        : batchStep === 'intro'
          ? h('div', { className: 'iw-batch-intro' },
              batchImport.error ? h('div', { className: 'iw-model-error' }, batchImport.error) : null,
              h('div', { className: 'iw-batch-hint' }, tr('batch.hint')),
              h('div', {
                className: 'iw-drop iw-batch-drop',
                'data-over': batchOver ? 'true' : 'false',
                onDragOver: (event) => { event.preventDefault(); event.stopPropagation(); setBatchOver(true) },
                onDragLeave: () => setBatchOver(false),
                onDrop: handleBatchDrop,
              },
              h('div', { className: 'iw-batch-drop-title' }, tr('batch.dropHint')),
              h('div', { className: 'iw-batch-drop-sub' }, tr('batch.dropSubhint')),
              h('div', { className: 'iw-drop-actions' },
                h(Button, {
                  variant: 'primary',
                  icon: 'folder',
                  onClick: chooseBatchFolder,
                  disabled: Boolean(batchImport.importing),
                }, tr('batch.choose')))),
              h('div', { className: 'iw-batch-steps' },
                batchStepRow('1', tr('batch.step1'), tr('batch.step1Desc')),
                batchStepRow('2', tr('batch.step2'), tr('batch.step2Desc')),
                batchStepRow('3', tr('batch.step3'), tr('batch.step3Desc'))),
              h('pre', { className: 'iw-batch-tree' }, tr('batch.tree')),
              h('div', { className: 'iw-batch-note' }, tr('batch.note')))
          : h('div', { className: 'iw-batch-modal' },
                h('div', { className: 'iw-batch-hint' }, tr('batch.hint')),
                batchImport.error ? h('div', { className: 'iw-model-error' }, batchImport.error) : null,
                batchImport.loading
                  ? h('div', { className: 'iw-batch-loading' }, h(Spinner, { tone: 'accent' }), tr('batch.scanning'))
                  : h('div', null,
                      h('div', { className: 'iw-field' },
                        h('label', { className: 'iw-field-label' }, tr('task.group')),
                        h(GroupPicker, {
                          t: tr,
                          value: batchImport.group || '',
                          groups: knownGroups,
                          onChange: (group) => setBatchImport(current => current ? { ...current, group } : current),
                        })),
                      batchImport.importing && batchImport.progress
                        ? h('div', { className: 'iw-batch-path' }, `${tr('batch.importing')} ${batchImport.progress}`)
                        : null,
                      h('div', { className: 'iw-batch-toolbar' },
                        h('label', { className: 'iw-batch-all' },
                          h('input', {
                            type: 'checkbox',
                            checked: batchImport.selected.size === batchImport.cases.length,
                            onChange: toggleBatchAll,
                          }),
                          tr('batch.selectAll')),
                        h('span', null, `${batchImport.cases.length} ${tr('batch.cases')}`)),
                      h('div', { className: 'iw-batch-list' }, batchImport.cases.map(item => h('label', {
                        key: item.name,
                        className: 'iw-batch-row',
                      },
                      h('input', {
                        type: 'checkbox',
                        checked: batchImport.selected.has(item.name),
                        onChange: () => toggleBatchCase(item.name),
                      }),
                      h('span', { className: 'iw-batch-name' }, item.name),
                      h('span', { className: 'iw-batch-count' }, `${item.files} ${tr('batch.files')}`)))),
                      batchImport.ignored?.length
                        ? h('div', { className: 'iw-batch-ignored' }, `${batchImport.ignored.length} 个空文件夹已跳过`)
                        : null,
                      h('div', { className: 'iw-batch-path' }, batchImport.root)))

      const batchDeleteModalElement = batchDelete
        ? h(Modal, {
            title: tr('batch.deleteTitle'),
            wide: true,
            onClose: () => setBatchDelete(null),
            footer: [
              h(Button, { key: 'c', onClick: () => setBatchDelete(null) }, tr('close')),
              h(Button, {
                key: 'd',
                variant: 'danger',
                icon: 'trash',
                disabled: batchDelete.selected.size === 0 || batchDelete.deleting,
                onClick: submitBatchDelete,
              }, batchDelete.deleting ? tr('batch.deleting') : `${tr('batch.deleteSelected')} (${batchDelete.selected.size})`),
            ],
          },
          h('div', { className: 'iw-batch-modal' },
            h('div', { className: 'iw-batch-hint' }, tr('batch.deleteHint')),
            batchDelete.error ? h('div', { className: 'iw-model-error' }, batchDelete.error) : null,
            (state.tasks || []).length === 0
              ? h('div', { className: 'iw-batch-hint' }, tr('batch.deleteEmpty'))
              : h('div', null,
                  h('div', { className: 'iw-batch-toolbar' },
                    h('label', { className: 'iw-batch-all' },
                      h('input', {
                        type: 'checkbox',
                        checked: batchDelete.selected.size === (state.tasks || []).length,
                        onChange: toggleAllBatchDelete,
                      }),
                      tr('batch.selectAll')),
                    h('span', null, `${(state.tasks || []).length} ${tr('batch.cases')}`)),
                  h('div', { className: 'iw-batch-list' }, (state.tasks || []).map(task => h('label', {
                    key: task.id,
                    className: 'iw-batch-row',
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: batchDelete.selected.has(task.id),
                    onChange: () => toggleBatchDelete(task.id),
                  }),
                  h('span', { className: 'iw-batch-name' }, task.title),
                  h('span', { className: 'iw-batch-count' }, `${task.materialCount} ${tr('materialCount')}`)))))))
        : null

      const batchImportModalElement = batchImport
        ? h(Modal, {
            title: tr('batch.import'),
            wide: true,
            onClose: () => setBatchImport(null),
            footer: batchFooter,
          }, batchBody)
        : null

      const citationModalElement = citation
        ? h(Modal, {
            title: tr('cite.title'),
            onClose: () => setCitation(null),
            footer: [h(Button, { key: 'c', onClick: () => setCitation(null) }, tr('close'))],
          },
          citation.loading
            ? h('div', { className: 'iw-model-meta' }, tr('cite.loading'))
            : citation.error
              ? h('div', { className: 'iw-model-error' }, citation.error)
              : h('div', { className: 'iw-cite-card' },
                  h('div', { className: 'iw-cite-name' }, citation.data.officialName + (citation.data.clause ? ` §${citation.data.clause}` : '')),
                  citation.data.note ? h('div', { className: 'iw-cite-badge' }, citation.data.note) : null,
                  h('div', { className: 'iw-cite-summary' }, citation.data.summary),
                  h('div', { className: 'iw-cite-links' },
                    citation.data.url
                      ? h('a', { className: 'iw-cite-link', href: citation.data.url, target: '_blank', rel: 'noreferrer' }, citation.data.urlLabel || tr('cite.official'))
                      : null,
                    citation.data.urlAlt
                      ? h('a', { className: 'iw-cite-link', href: citation.data.urlAlt, target: '_blank', rel: 'noreferrer' }, citation.data.urlAltLabel || tr('cite.backup'))
                      : null,
                    citation.data.catalogUrl
                      ? h('a', { className: 'iw-cite-link', href: citation.data.catalogUrl, target: '_blank', rel: 'noreferrer' }, citation.data.catalogLabel || tr('cite.catalog'))
                      : null),
                  citation.data.sourceType === 'standard' || citation.data.sourceType === 'journal'
                    ? h('div', { className: 'iw-cite-copyright' }, tr('cite.copyright'))
                    : null))
        : null

      return h('div', { className: 'iw-root' },
        h('style', null, CSS),
        header,
        h('div', { className: 'iw-body' }, sidebar, main),
        toast,
        taskModal,
        editModal,
        assistantRenameModal,
        materialModal,
        folderModalElement,
        environmentModalElement,
        batchImportModalElement,
        batchDeleteModalElement,
        citationModalElement)
    }

    function FolderModal ({ t, onClose, onSubmit }) {
      const [path, setPath] = useState('')
      return h(Modal, {
        title: t('importFolder'),
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('cancel')),
          h(Button, { key: 's', variant: 'primary', disabled: path.trim().length === 0, onClick: () => onSubmit(path.trim()) }, t('import.start')),
        ],
      },
      h('div', { className: 'iw-hint' }, t('folder.hint')),
      h('div', { className: 'iw-field' },
        h('label', { className: 'iw-field-label' }, t('folder.path')),
        h('input', { className: 'iw-input', value: path, onChange: (event) => setPath(event.target.value), placeholder: '/Users/…/病例材料', autoFocus: true })))
    }

    // -----------------------------------------------------------------------
    // Plugin
    // -----------------------------------------------------------------------

    return {
      inject: ['slots', 'locale'],
      apply (ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'infection-workbench: dictionaries')
        const t = ctx.locale.bind(NS)

        let uiWorkspace = null
        ctx.inject(['uiWorkspace'], (scoped) => { uiWorkspace = scoped.uiWorkspace })

        const directoryPicker = () => {
          const service = uiWorkspace || ctx.get('uiWorkspace')
          return service && typeof service.pickDirectory === 'function' ? service : null
        }

        const hostBridge = {
          hasDirectoryPicker: () => Boolean(directoryPicker()),
          pickDirectory: async () => {
            const service = directoryPicker()
            if (!service) return null
            return await service.pickDirectory()
          },
        }

        const disposePanel = ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t, host: hostBridge, locale: ctx.locale }),
        }, Workbench))

        const disposeRow = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 2,
          label: () => t('nav'),
          locale: NS,
        }, (owner = {}) => h('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: owner.active ? 'var(--dsw-alias-brand-primary, currentColor)' : 'inherit',
          },
          'aria-hidden': 'true',
        }, h(BrandIcon, { size: owner.size || 17 }))))

        return () => {
          if (typeof disposeRow === 'function') disposeRow()
          if (typeof disposePanel === 'function') disposePanel()
        }
      },
    }
  },
})
