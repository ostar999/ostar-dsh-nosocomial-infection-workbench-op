# AI 院感分析工作台（DSH 插件）

把院感诊断能力做成一个按病例工作的分析台：
一个任务 = 一个病例，导入该病例的多份诊疗材料，点一次「开始综合分析」，得到按标准条文
判定、可复算、可下载的《医院感染分析报告》，随后还能就这个病例继续追问。

## 目录

- [功能](#功能)
- [安装与卸载](#安装与卸载)
  - [环境要求](#1-环境要求)
  - [获取插件](#2-获取插件)
  - [DeepSeek Harness 桌面端](#3-deepseek-harness-桌面端)
  - [DSH Web](#4-dsh-web)
  - [安装后验证](#5-安装后验证)
  - [卸载](#6-卸载)
  - [数据与彻底清理](#7-数据与彻底清理)
  - [升级](#8-升级)
  - [常见问题](#9-常见问题)
- [使用](#使用)
- [内置 skill（与插件同仓）](#内置-skill与插件同仓)
- [配置](#配置)
- [数据位置](#数据位置)
- [目录结构](#目录结构)
- [说明](#说明)
- [软件许可](#软件许可)

## 功能

- **任务即病例**：新建任务（标题 / 患者标识 / 性别 / 年龄 / 备注），任务之间数据完全隔离。
- **批量导入**：一次选多个文件，或直接选/拖入一个包含病例文件夹的上级目录；每个子文件夹名成为任务名。
  支持 `xlsx`、`docx`、`csv`、`md`、`txt`、`pdf`。**旧版 `.doc` / `.xls` 可导入但会标记解析失败**，请在材料列表中看到提醒后另存为 `.docx` / `.xlsx`；**不支持扫描件或图片型 PDF**：这类 PDF 没有文本层，导入会直接报错提醒。
- **材料解析**：内置零依赖解析器
  - `xlsx` 直接读 OOXML（共享字符串、多工作表、日期格式还原）
  - `docx` 读 `word/document.xml`（段落、表格、换行）
  - `csv` 自动识别分隔符，UTF-8/UTF-16/GB18030 自动解码
  - `pdf` 默认使用内置 `pdfjs-dist` 提取文本层；本机有 poppler/mutool 时优先使用，未安装也不影响；无文本层时直接报错，不做 OCR
- **综合分析**：三阶段流水线 —— 材料整备 → 结构化病例事实抽取 → 按 skill 规则表逐条判定并生成报告；
  判定与评分严格使用内置 skill 的 `rules/stage1_general.json`、`stage3_special.json`、`checklists.json`、`scoring.json`，
  并把解读文件与政府文件（857/861/862/863/509 解读、2013/2018/2025 指南解读、2001 标准、187/136 号、潜伏期表）一起放进上下文。
- **面向读者的报告**：正文只写标准官方名称（如《WS/T*857-2025*医院感染病例判定标准-通用原则》），
  不出现目录、`.md`、反引号；每节先结论段再表格，判定/排除依据、可能性明细、信息缺口全部表格化。
  模型若仍写出内部路径，`lib/citations.js` 会按 `skill/display-names.json` 兜底改写。
- **报告文件**：每份分析都会在任务目录写出
  `院感分析报告.md`、`.html`（可打印、自带样式）、`.txt`、`.docx`（Word）、`.pdf`，
  以及 `分析明细.json`（抽取事实 + 用量 + 载入标准清单）；面板内可直接预览、复制，一次选择多种格式导出。
  Word 由内置 OOXML 生成器输出；PDF 经 Host 的 `officeToPdf` 从 Word 转换，缺失时回退本机 LibreOffice。
- **病例问答**：围绕该病例的**材料原文 + 分析明细（结构化事实）+ 已生成报告**追问；
  回答同样使用标准官方名称并给出条文号，多轮问答稳定可用；支持 Markdown/HTML/TXT/Word/PDF 多格式导出。
- **会话上下文**：病例问答和院感助手按模型上下文窗口分配预算；较早对话自动压缩为持久摘要，刷新/重启后仍生效；
  对话底部状态栏显示轮次、运行状态、tok/s、用量、缓存命中率和上下文百分比，点击百分比圆环查看分段占用。
- **抽取运行反馈**：结构化事实抽取阶段显示已运行时间、已输出字符/思考字数、动态进度条，避免长时间无反馈。
- **引用追溯**：报告与问答里的《标准》§条款可点击，弹出官方名称、条款号、开发者归纳的摘要与官方链接；引用卡不内置全文，联网检索可给相关原文段落与访问地址。
- **病例时间线**：根据分析明细的结构化事实生成事件、器械时段与判定窗口（VAP/CAUTI/CLABSI 48 小时、SSI 30/90 天、14 天重复窗），标出窗内/未到起点/超出终点。
- **批量导入/分析/删除**：批量导入选择一个上级目录（每个病例一个子文件夹）；批量分析多选任务，按自定义最高并行数执行（默认 4，1–16，选择会被记住），侧栏显示并行数、进度、活动任务与取消；批量删除为独立入口。
- **公开来源检索**：需要标准/文件原文、条款出处或遇到不确定处时，检索多个公开来源，提供官方名称、相关原文段落与来源链接；不整篇转载，不向用户暴露内置资料。
- **院感助手**：独立的通用知识问答，不读取病例材料；支持多会话、状态灯、搜索、排序、批量删除、重命名、多格式导出（Markdown/HTML/TXT/Word/PDF）、建议问题与引用追溯。
- **任务分组与排序**：任务可填分组；侧栏按分组显示，默认按创建时间从近到远，可切换最早创建、最近更新、名称排序。
- **环境检查**：模型选择左侧的滑杆按钮打开环境检查，可查看 PDF.js、poppler、mutool、PDF 导出服务状态；缺失的可选项支持一键安装（macOS 使用 Homebrew，其他平台显示手动命令）。
- **模型可选**：右上角两个选择框，分别选择模型与思考等级（列表来自 DeepSeek Harness 已配置的模型）；
  首次加载继承工作区当前模型，之后的选择保存在本工作台，不影响全局默认。
- **流式进度**：分析过程分步骤展示，报告边生成边显示；支持中途取消。
- **Agent 工具**：同时注册 `infection_workbench` 工具（`list_tasks` / `create_task` / `import_folder` /
  `analyze` / `job` / `get_task` / `ask` / `export`），可以在对话里驱动同一套操作。

## 安装与卸载

本仓库包名为 `ostar-dsh-nosocomial-infection-workbench-op`。以下以**本地源码安装**为例；也可以直接在 DSH 中添加 GitHub 仓库地址。

### 1. 环境要求

- DeepSeek Harness 桌面端，或可运行 `dsh web` 的 DSH Web 环境；
- Node.js **22.13 LTS 或 24+**（PDF.js 要求）；
- 安装目录可写；
- `pdfjs-dist` 是插件的 npm 依赖。正常在线安装会自动安装；内网离线环境请预装 `node_modules` 或使用带依赖的离线包。

### 2. 获取插件

```bash
git clone <仓库地址> infection-workbench
cd infection-workbench
npm install
```

如果使用离线目录，请确认目录中已有 `node_modules/pdfjs-dist`。

### 3. DeepSeek Harness 桌面端

桌面端使用 `desktop` profile。

#### 方式 A：图形界面添加插件（推荐）

1. 打开 DeepSeek Harness；
2. 进入「设置」→「插件 / Plugins」→「添加插件」；
3. 在输入框中填入 GitHub 仓库地址：

   ```text
   https://github.com/ostar999/ostar-dsh-nosocomial-infection-workbench-op
   ```

   也可以直接填本地插件目录的绝对路径，例如：

   ```text
   /absolute/path/to/infection-workbench
   ```

4. 点击「安装」，等待包和 `pdfjs-dist` 依赖安装完成；
5. 重启 DSH，侧栏出现盾牌图标即成功。

> 使用 GitHub 地址时，请确认仓库根目录就是插件目录（包含 `package.json` 和 `cordis.patch.yml`）。如果使用 fork 或开发分支，优先填本地绝对路径，避免装到旧版本。

#### 方式 B：命令行安装本地源码

```bash
cd /absolute/path/to/infection-workbench
npm install

dsh plugin --profile desktop add "link:/absolute/path/to/infection-workbench"
```

随后确认 `~/.dsh/profiles/desktop/package.json` 中的 `dsh.profile.bundles` 包含：

```json
"ostar-dsh-nosocomial-infection-workbench-op"
```

如果命令没有自动加入 bundle 列表，手动补上并重启 DSH。Windows 路径为：

```text
%USERPROFILE%\.dsh\profiles\desktop\package.json
```

### 4. DSH Web

DSH Web 使用独立的 `web` profile，需要单独安装。

#### 方式 A：Web 插件页面

1. 启动：

   ```bash
   dsh web
   ```

2. 打开终端输出的 Web 地址；
3. 进入「设置」→「插件 / Plugins」→「添加插件」；
4. 填入 GitHub 仓库地址或本地插件目录的绝对路径：

   ```text
   https://github.com/ostar999/ostar-dsh-nosocomial-infection-workbench-op
   ```

5. 点击「安装」，等待依赖安装完成；
6. 刷新页面，必要时重启 `dsh web`，侧栏出现盾牌图标。

#### 方式 B：命令行安装本地源码

```bash
dsh plugin --profile web add "link:/absolute/path/to/infection-workbench"
```

确认 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 中包含：

```json
"ostar-dsh-nosocomial-infection-workbench-op"
```

然后重启：

```bash
dsh web
```

### 5. 安装后验证

- 侧栏出现「欧星星·AI院感工作台」盾牌图标；
- 打开面板，右上角版本号应为当前版本（如 `v2.17.4`）；
- 点击模型选择左侧的滑杆按钮，打开「环境检查与依赖」，确认：
  - PDF.js 已安装；
  - `officeToPdf` 可用（用于 PDF 导出）；
  - poppler/mutool 可选，没有也不影响 PDF.js 解析；
- 新建任务，导入一份 `docx` 或文本层 PDF，确认材料状态为「已解析」。

### 6. 卸载

#### 桌面端：图形界面

1. 「设置」→「插件 / Plugins」；
2. 找到「欧星星·AI院感工作台」；
3. 选择卸载/移除；
4. 重启 DSH。

#### 桌面端：命令行

```bash
dsh plugin --profile desktop remove ostar-dsh-nosocomial-infection-workbench-op
```

然后从 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 中删除：

```json
"ostar-dsh-nosocomial-infection-workbench-op"
```

重启 DSH。

#### DSH Web：图形界面

1. 进入 Web 的「设置」→「插件 / Plugins」；
2. 卸载「欧星星·AI院感工作台」；
3. 刷新页面或重启 `dsh web`。

#### DSH Web：命令行

```bash
dsh plugin --profile web remove ostar-dsh-nosocomial-infection-workbench-op
```

从 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 中删除对应项，然后重启：

```bash
dsh web
```

> 只是暂时不用时，优先在插件管理器中「禁用」，不要卸载；禁用会保留任务数据。

### 7. 数据与彻底清理

卸载插件**不会删除**病例材料、报告和问答记录。默认数据目录：

```text
~/.dsh/data/infection-workbench
```

如果配置了自定义 `dataDir`，以配置为准。确认不再需要后，可手动删除：

```bash
rm -rf ~/.dsh/data/infection-workbench
```

> 此操作不可恢复，请先备份需要保留的报告和材料。

桌面端和 Web 默认共用同一个数据目录；如果两端都安装过，卸载其中一个不会影响另一个的数据。

### 8. 升级

1. 更新插件源码或安装新版本包；
2. 在插件目录重新执行 `npm install`，确保 PDF.js 版本同步；
3. 重启 DSH 桌面端，或重启 `dsh web`；
4. 任务数据保存在数据目录中，升级不会自动清空。

### 9. 常见问题

- **侧栏没有图标**：确认 `dsh.profile.bundles` 已加入包名，并重启 DSH；
- **PDF 导入报 pdfjs-dist 未安装**：在插件目录执行 `npm install`，或使用带依赖的离线包；
- **PDF 无文本层**：扫描件/图片型 PDF 不支持，会作为失败材料显示；
- **`.doc/.xls` 解析失败**：请另存为 `.docx/.xlsx`；
- **PDF 导出不可用**：检查 DSH Host 是否提供 `officeToPdf`；没有时使用 Word/HTML/TXT 导出；
- **安装后版本仍旧**：DSH 可能缓存旧模块，完全退出并重新启动，而不只是刷新页面。

## 使用

1. 侧边栏点击盾牌图标，或从插件页面进入面板。
2. 「新建任务」→ 填病例标识。
3. 「导入文件」或「导入文件夹」：病程记录、检验、微生物培养、医嘱、体温、影像报告等都可以一起放进来。
4. 切到「综合分析」→ 可直接开始，也可以在“本次关注点”里写：`重点判断是否为 VAP`。
5. 分析完成后查看报告，按需下载 Markdown / HTML；有任何疑问切到「病例问答」继续追问。

## 内置 skill（与插件同仓）

`skill/` 是插件的一部分，随插件发版，**不关联任何外部仓库**：

- 内容：`SKILL.md`、`display-names.json`、`rules/`、`references/解读/`（9 份：8 份原文解读 + 1 份三管诊断速查）、
  `references/` 下的政府文件与传染病潜伏期速查表。
- 本仓库**不收录期刊论文与卫生行业标准的完整文本**；解读文件只引用事实、阈值与原则，正式引用请回到原文。
- 修改直接在 `skill/` 内进行，随插件提交，不需要同步脚本。
- 插件运行时只读包内 `skill/`，不依赖任何外部目录，也不做网络同步。

## 配置

配置写在 profile 的 `cordis.patch.yml` 中该行的 `config` 下（都有默认值）：

```yaml
- id: infection-workbench
  name: "ostar-dsh-nosocomial-infection-workbench-op"
  config:
    dataDir: "" # 数据目录；空 = $DSH_PROFILE_DIR/data/infection-workbench，未设该变量时 ~/.dsh/data/infection-workbench
    provider: "" # 部署级兜底提供方；空 = 跟随工作区默认模型（面板中的选择优先）
    model: "" # 部署级兜底模型 id；空 = 跟随工作区默认模型
    materialChars: 260000 # 病例材料注入上限（字符）
    standardsChars: 420000 # 解读文件与政府文件注入上限（字符，全量约 10 万）
    chatChars: 420000 # 问答上下文上限（字符，与综合分析同一套资料）
    standardsMode: full # 保留兼容；当前 full 与 core 都注入全部 14 份资料
```

本仓库内只收录解读文件与政府文件，不收录期刊论文与标准全文。当前 full / core 都注入全部 15 份资料，
避免出现“报告里没参考某份指南”的情况；如需裁剪，可调整 `lib/prompt.js` 的 `CORE_STANDARDS` 或 `standardsChars`。

## 数据位置

```
<dataDir>/                        # 默认 ~/.dsh/data/infection-workbench
  state.json                     # 任务索引 + 每个任务的分析状态、问答记录
  model-selection.json           # 本工作台选择的模型与思考等级（可选）
  tasks/<taskId>/
    files/                       # 原始材料
    text/<materialId>.txt        # 解析出的纯文本
    院感分析报告.md / .html
    分析明细.json
```

材料与报告只留在本机，不写入会话日志，也不上送。

## 目录结构

```
index.js            Host 入口：配置、路由注册、agent 工具
lib/server.js       HTTP 路由（/infection-workbench/*），逐请求做 Host 凭据校验
lib/store.js        任务持久化（原子写、合并写）
lib/import.js       导入：文件 / 文件夹
lib/extract.js      各格式解析
lib/xml.js, zip.js  零依赖 XML / ZIP 读取
lib/prompt.js       skill 载入与提示词组装（含报告引用名）
lib/citations.js    内部路径 → 标准官方名称的兜底改写
lib/llm.js          模型解析与流式调用
lib/analysis.js     三阶段分析、问答、任务取消
lib/markdown.js     报告 Markdown → 独立 HTML / 纯文本
lib/docx.js         Markdown → Word（OOXML，零依赖）
lib/zipwrite.js     内置 ZIP 写入（docx 打包）
lib/export.js       md / html / txt / docx / pdf 五格式导出
client.js           面板 UI（React，经 window.__ModuleLoader__ 注册）
skill/              内置诊断 skill（与插件同仓；解读文件 + 政府文件 + 规则表）
```

## 说明

- 本插件输出为**辅助分析结果**，最终诊断由临床医师结合患者整体情况作出；报告末尾固定包含该声明。
- 判定口径与术语沿用 skill：区分“医院感染病例判定（感控口径）”与“临床感染诊断（诊疗口径）”。
- PDF 若为扫描件（无文本层），会给出提示；请提供可复制文字的版本或补充对应文书。

## 软件许可

本项目采用 **AGPL-3.0 + 商业许可** 双轨授权：

- 个人学习、研究、评估，以及医院内部自部署，在遵守 AGPL-3.0 的前提下可免费使用；
- 不愿履行 AGPL 源代码义务的商业集成方，可申请商业许可；
- 经济困难可申请减免；
- 商业许可收入用于覆盖维护、服务器、标注、文档和测试等持续成本。

完整许可证文本见 [`LICENSE`](LICENSE)，授权政策与商业许可申请方式见 [`LICENSE-COMMERCIAL.md`](LICENSE-COMMERCIAL.md)，版权归属见 [`NOTICE`](NOTICE)。第三方内容的授权状态见 [`THIRD-PARTY.md`](THIRD-PARTY.md)。
