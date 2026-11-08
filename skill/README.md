# 院感分析工作台 skill

这是 **AI 院感分析工作台** 的内置 skill，与插件同仓、随插件发版，不依赖任何外部仓库，也不做跨仓库同步。

## 插件如何加载

```
index.js
  └── lib/prompt.js  loadSkill(path.join(HERE, 'skill'))
        ├── SKILL.md            工作方法（引用规范 + 报告骨架 + 五阶段 + 评分）
        ├── display-names.json  内部路径 → 报告中的官方名称
        ├── rules/              可执行判定/评分规则表
        └── references/         解读文件、政府文件、潜伏期表
```

- 每次「综合分析」把 `SKILL.md`、`rules/` 与 `references/` 下的资料一起注入；「病例问答」使用同一套。
- 面板右上角的 `skill vX.Y.Z` 就是 `SKILL.md` front-matter 的版本号；
  `infection_workbench` 工具的 `diagnostics` 可核对载入数量与引用名数量。
- 找不到 `SKILL.md` 时工作台初始化失败；缺规则表或 `display-names.json` 会降级运行并给出 warnings。

## 内容

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 判定与写作规范：引用官方名称、段落+表格骨架、五阶段流程、评分、必引指南 |
| `display-names.json` | 内部路径到标准官方名称的唯一映射，提示词与报告后处理共用 |
| `rules/` | `stage1_general` / `stage3_special` / `checklists` / `scoring` 规则表 |
| `references/解读/` | 9 份独立编写的解读文件：857、861、862、863、509、2013/2018/2025 指南，以及三管诊断速查 |
| `references/医院感染判定原则和诊断标准/` | 卫医发〔2001〕2号（政府文件） |
| `references/外科手术部位感染相关/` | 卫办医政发〔2010〕187号（政府文件） |
| `references/三管感染诊断相关_标准-论文-指南/` | 187 号两管文件、国卫办医函〔2021〕136号（政府文件） |
| `references/常见传染病潜伏期/` | 传染病潜伏期速查表（数据表） |

## 资料边界

- 本包内**不收录期刊论文与卫生行业标准的完整文本**；`references/解读/` 是开发者独立编写的解读文件，只引用事实、阈值与原则。
- 解读文件不是原文，也不替代原文；报告引用时写标准/指南的官方名称，正式引用请回到原文。
- 政府文件按《著作权法》第五条保留原文并注明文号。

## 新增或修改资料

1. 把资料放进 `references/` 对应目录；解读文件放 `references/解读/`，命名 `解读_原文件名`。
2. 在 `display-names.json` 登记「内部路径 → 官方名称」。
3. 需要进入 core 模式的，加入 `lib/prompt.js` 的 `CORE_STANDARDS`。
4. 在 `SKILL.md` 第 2.2 节对照表与第 10 节清单补一行。
5. 涉及器械/手术的，补到 `SKILL.md` 第 6.1 节「必引指南」。

## 发版

本 skill 不再单独发版，版本号随插件一起升级：

```bash
# 在插件仓库根目录
npm version patch   # 或 minor / major
git push origin dev
```

## 自检

```bash
# 在插件根目录
node --input-type=module -e "
import path from 'node:path'
import { loadSkill, buildAnalysisSystem, createStandardReader } from './lib/prompt.js'
const skill = await loadSkill(path.join(process.cwd(), 'skill'))
const sys = await buildAnalysisSystem(skill, { readStandard: createStandardReader(skill) })
console.log(skill.name, skill.version, '| 文件:', skill.standards.length, '| 提示词:', sys.chars, '| 未载入:', sys.skipped.length)
"
```
