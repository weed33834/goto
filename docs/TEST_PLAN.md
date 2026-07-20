> ⚠️ **架构已废弃**：本文档描述的是已删除的 Electron / 移动端 / SQLCipher 架构下的测试计划（含移动端插件、iOS EAS 构建、`app.config.ts` 等条目）。当前 TaskFlow 为**纯浏览器 Web 应用**（仓库 `desktop/`：Vite + React 18 + Zustand 4 + TypeScript 5，数据存于 IndexedDB，密钥经 Web Crypto / PBKDF2 派生）。请以 [README.md](../README.md) / [ARCHITECTURE.md](../ARCHITECTURE.md) 为准。

# TaskFlow 新功能测试计划

> **目的**：把 Phase 7-9 引入的新功能（笔记 Markdown、移动端插件、AI 统计引擎、目标/习惯可视化、同步策略、EAS 配置、CII 合规审计）的测试矩阵集中放出来，方便回归与人工验证。
> **最后更新**：2026-07-07
> **测试基线**：前端 509 项（自动化）+ 后端 104 + Relay 9 + 桌面端 290 = 912

测试分两层：

- **L1 自动化**（vitest）：纯函数/组件渲染逻辑，能跑 CI；
- **L2 人工/视觉**：移动端 UI 集成，无法在 CI 里跑（RN 渲染 + 触摸），需在 Expo Go 或模拟器里走查。

---

## 一、AI 统计建议引擎

**实现**：`src/shared/ai/engine.ts`（纯函数，无网络/无模型）
**接入**：`src/shared/store/slices/aiSlice.ts` 的 `generateSuggestionsForTask`
**测试文件**：`src/shared/ai/engine.test.ts`（18 项）

### L1 自动化覆盖

| 函数 | 覆盖点 |
|------|--------|
| `suggestCategory` | 关键词重叠 + 子串匹配（中英）、历史频次加权、空历史、置信度低于阈值丢弃 |
| `suggestDueTime` | 按 completedAt 小时取众数、最少 3 样本才推荐、空样本返回 null |
| `suggestPriority` | 关键词优先（urgent/重要/紧急）、历史同主题平均优先级、tokenize 边界 |
| `generateSuggestions` | 聚合三类、置信度 < 0.35 丢弃、空任务返回空数组 |
| `toHistoryTasks` | Task → HistoryTask 转换、`completedAt: null` 保留为 null |

### L2 人工验证

- [ ] 在任务创建页输入标题"买牛奶"，AI 建议卡片应自动出现"购物"分类（高置信度）
- [ ] 输入"准备周会报告"应推荐"工作"分类
- [ ] 历史 < 3 条完成记录时不显示时间建议（避免噪声）
- [ ] 关闭/重启应用后建议仍可生成（纯本地，无网络依赖）

**测试命令**：`cd taskflow && npx vitest run src/shared/ai/engine.test.ts`

---

## 二、笔记 Markdown 与标签

**实现**：`src/shared/utils/markdownHelper.ts`
**接入**：`screens/NotesScreen.tsx`（编辑器开关、卡片预览、标签筛选）
**测试文件**：`src/shared/utils/markdownHelper.test.ts`（22 项）

### L1 自动化覆盖

| 函数 | 覆盖点 |
|------|--------|
| `stripMarkdown` | 标题（#）、粗体/斜体、链接、图片、代码块、任务列表 `[x]`/`[ ]`、有序/无序列表、引用、HTML、表格、HR |
| `notePreview` | 单行折叠、长度截断、`isMarkdown` 切换两种预处理路径、空内容 |
| `looksLikeMarkdown` | 阈值判定（含 ≥2 个 markdown 标记符号判定为 markdown） |
| `parseTagInput` | 逗号/空格/中文逗号分隔、去重、长度限制、空输入、纯分隔符输入 |

### L2 人工验证

- [ ] 笔记编辑器底部"Markdown"开关切换为开，输入 `# 标题\n\n**粗体**` 应实时渲染预览
- [ ] 卡片列表中 markdown 笔记带 `MD` 徽章，预览文本为剥除语法后的纯文本
- [ ] 标签输入框输入"工作,生活 学习"应解析为 3 个标签 `['工作','生活','学习']`
- [ ] 搜索框输入关键字同时匹配标题、内容、标签
- [ ] 顶部标签筛选 chips 横向滚动，点击只显示该标签的笔记

**测试命令**：`cd taskflow && npx vitest run src/shared/utils/markdownHelper.test.ts`

---

## 三、移动端插件系统

**实现**：`src/shared/plugins/`（registry + types + builtinPlugins）
**接入**：`src/shared/store/slices/tasksSlice.ts` 的 `addTask`（`taskBeforeCreate` 钩子）
**测试文件**：`src/shared/plugins/registry.test.ts`（16 项）

### L1 自动化覆盖

| 模块 | 覆盖点 |
|------|--------|
| `PluginManager` | register/unregister/has/list/clear、去重注册 |
| `invokeSync` | 管道型链式（前一个非 null 输出作下一个输入）、最后非 null 胜出、无插件返回 null |
| `invokeAsync` | 收集所有非 null 结果、Promise 拒绝隔离 |
| 错误隔离 | 单个插件抛错不影响其他插件、`onError` 回调被调用 |
| `autoTagPlugin` | 4 个分类关键词命中、中英文混合、不重复添加已有标签、无命中返回 null |
| 集成 | `addTask` 走 `taskBeforeCreate` 后写入 store 的 task 携带插件覆盖字段、`tasksSlice.test.ts` 既有 42 项不破坏 |

### L2 人工验证

- [ ] 创建任务标题"买牛奶"，保存后任务应自动带 `购物` 标签
- [ ] 创建任务标题"准备周会报告"应自动带 `工作` 标签
- [ ] 创建任务标题"随机内容"不应被加任何标签
- [ ] 任务已手动添加"购物"标签时，再创建同名任务不应出现重复

**测试命令**：`cd taskflow && npx vitest run src/shared/plugins/registry.test.ts src/shared/store/slices/tasksSlice.test.ts`

---

## 四、目标/习惯可视化（MiniCharts）

**实现**：
- `src/shared/components/common/miniChartsHelpers.ts`（纯函数）
- `src/shared/components/common/MiniCharts.tsx`（Sparkline / Heatmap / MiniBar / HabitHeatmapCard）

**接入**：
- `screens/GoalsScreen.tsx`：每个 quantitative 目标卡内嵌"理想轨迹 Sparkline + 状态徽章"
- `screens/HabitsScreen.tsx`：每个习惯卡底部嵌入 13 周热力图

**测试文件**：
- `src/shared/components/common/miniChartsHelpers.test.ts`（38 项）
- `src/shared/components/common/MiniCharts.test.tsx`（21 项）

### L1 自动化覆盖（helpers）

| 函数 | 覆盖点 |
|------|--------|
| `toSparkline` | 空数组、单点退化为 0.5、多点等距 x、min=max 退化、负值序列 |
| `sparklinePath` | 归一化坐标乘 width/height、空输入 |
| `buildGoalTrajectory` | 正常区间采样、actual 仅末点、samples<2 钳制、start≥end 单点、target≤0 全 0 |
| `goalScheduleStatus` | 已完成、已逾期、持平/超前、落后、未开始边界、target=0 不抛异常 |
| `buildHeatmapData` | weeks<1 空、weeks×7 网格、endDate 对齐到周六、completed 读取、null/undefined 历史、isCurrentMonth 跨月、日期连续性 |
| `habitRecentTrend` | days<1 空、长度 = days、末位对应 endDate、中间日期读取 |
| `flattenHeatmap` / `countCompleted` | 顺序保留、空网格 0、计数正确 |
| `habitCompletionRate` | 空历史 0、7 天 3 次 ≈42.86%、全勤 100% |

### L1 自动化覆盖（组件）

| 组件 | 覆盖点 |
|------|--------|
| `Sparkline` | 空数据占位、单点退化、多点 N 根柱、variant=line 渲染浅色柱+最高点圆点、所有值相等高度一致 |
| `Heatmap` | weeks<1 占位、13×7=91 单元格、completed 上色、今日边框、`showWeekdayLabels` 开关、与 `buildHeatmapData` 输出一致 |
| `MiniBar` | value=0/0.5/1.5/-0.5 钳制、label 渲染 Text、无 label 不渲染 Text |
| `HabitHeatmapCard` | 标题/计数/图例、计数随完成数变化、accentColor 透传到标题 |

### L2 人工验证

#### GoalsScreen 趋势图

- [ ] 进入"目标管理"页面，每个数量型目标卡内可见"理想轨迹"小卡 + 状态徽章
- [ ] 质量型/习惯型目标**不**显示趋势卡（按设计跳过）
- [ ] 创建一个 startDate=今天-15天、endDate=今天+15天、targetValue=10、currentValue=2 的目标，徽章应显示"落后于计划"（橙色）
- [ ] 把 currentValue 改为 6（中点位置达标），徽章应显示"符合预期"（绿色）
- [ ] 把 endDate 改为今天-1天，徽章应显示"已逾期"（红色）
- [ ] 完成目标后徽章应显示"已完成"（绿色）

#### HabitsScreen 热力图

- [ ] 进入"习惯追踪"页面，每个习惯卡底部可见 13 周热力图 + "近 13 周打卡"标题 + 总次数
- [ ] 连续打卡 3 天后，热力图右下角应出现 3 个绿色单元格
- [ ] 今天对应的单元格应有蓝色边框
- [ ] 习惯颜色变化时（编辑习惯时换 color），热力图填充色随之变化
- [ ] 跨月日期的视觉边界（`isCurrentMonth` 标记）能区分本月与上月
- [ ] 窄屏（小尺寸设备）下热力图不溢出卡片（依赖父级 ScrollView）

**测试命令**：
```bash
cd taskflow && npx vitest run src/shared/components/common/miniChartsHelpers.test.ts src/shared/components/common/MiniCharts.test.tsx
```

---

## 五、CI 工作流

### iOS EAS 构建

**文件**：`.github/workflows/eas-build.yml`

- [ ] 在 GitHub Actions 面板手动触发 workflow，platform 选 `ios`，构建任务成功派发到 EAS 云端
- [ ] platform 选 `android`，APK 构建仍正常（无回归）
- [ ] 缺少 `EXPO_TOKEN` secret 时 job 应失败并给出明确错误（不静默跳过）

### Web 部署

**文件**：`.github/workflows/web-deploy.yml`

- [ ] 手动触发 workflow，`tsc --noEmit` 通过、`build:web` 产出 `dist/`、Pages 部署成功
- [ ] 推送 tag `v1.2.1` 应自动触发部署
- [ ] 与 `pages-intro.yml` 冲突时（同 Pages 站点）需手动控制触发，不并发

---

## 六、回归基线

每次合并新功能前，确保下列命令全绿：

```bash
# 前端（含本次新增的所有测试）
cd taskflow && npx tsc --noEmit && npx vitest run

# 后端（需安装 backend/requirements.txt + tests/requirements.txt）
cd backend && python -m pytest

# Relay（需安装 relay/package.json 依赖）
cd relay && npx vitest run

# 桌面端（需安装 desktop/package.json 依赖，含原生模块）
cd desktop && npx vitest run
```

CI（`.github/workflows/verify.yml` + `ci.yml`）会自动跑前端 + 后端 + Relay；桌面端通过 `desktop/.github/workflows/` 单独跑。

---

## 七、同步策略（syncPolicy）

**实现**：`src/shared/sync/syncPolicy.ts`（纯常量 + 纯函数）
**接入**：`src/shared/types/index.ts` 的 `SyncConfig`（新增 `relayMode` / `maxDevices` 字段）
**测试文件**：`src/shared/sync/syncPolicy.test.ts`（33 项）

### L1 自动化覆盖

| 函数 | 覆盖点 |
|------|--------|
| 默认策略常量 | `DEFAULT_RELAY_URL` 指向官方域名；`DEFAULT_RELAY_MODE='official'`；`maxDevices=null` 无限制 |
| `SYNC_SCOPE` 映射 | 7 类核心业务数据为 `full`；附件为 `metadata-only`；UI/focus/search 为 `local-only` |
| 派生列表 | `FULL_SYNC_RECORD_TYPES` 含所有 full 类型、排除 local-only 与 metadata-only；`METADATA_SYNC_RECORD_TYPES` 只含 attachments |
| `shouldLimitDevices` | null/0/Infinity/-1 返回 false（无限制）；正整数返回 true |
| `canPairMoreDevices` | 无限制策略下永远 true；限制 5 时 4 已配可继续、5/6 已配不可继续 |
| `resolveRelayUrl` | 用户显式配置胜出；空字符串/null/空白退回 policy；relayMode=official/self-hosted/auto 各自路径；policy.relayUrl 兜底 |
| `filterSyncableRecordTypes` | 过滤 local-only；保留 metadata-only；未知类型过滤；空输入；自定义 policy 把 tasks 改 local-only |

### L2 人工验证

- [ ] 首次打开同步设置，relay URL 默认显示 `wss://relay.taskflow.dev`（官方）
- [ ] 用户改为自托管 URL 后保存，重启应用后仍记得用户配置
- [ ] 把 relayMode 切到 `official`，relay URL 应回到官方默认
- [ ] 配对第 6 台设备时不报"超出配额"错误（默认无限制）
- [ ] 创建带附件的任务，同步到另一台设备后附件元数据（URL/大小/MIME）可见，但二进制需从外部存储拉取

**测试命令**：`cd taskflow && npx vitest run src/shared/sync/syncPolicy.test.ts`

---

## 八、EAS projectId 环境变量化

**实现**：`app.config.ts`（动态配置）+ `eas.json`（env profile）+ `.github/workflows/eas-build.yml`（从 secrets 读取）
**测试方式**：手动触发 workflow 验证

### L2 人工验证

- [ ] 本地无 `EAS_PROJECT_ID` 环境变量时，`app.config.ts` 输出占位符
- [ ] 本地 `export EAS_PROJECT_ID=真实ID` 后，`npx expo config --type public` 输出含真实 projectId
- [ ] GitHub Actions 中配置 `EAS_PROJECT_ID` secret 后，EAS Build workflow 能成功派发构建
- [ ] 未配置 secret 时，workflow 给出明确警告（"Add EAS_PROJECT_ID repository secret"）并跳过，不报错

---

## 九、CII 合规审计自动化

**实现**：`.github/workflows/ossf-compliance.yml`（18 项检查 + 报告生成 + 徽章更新）
**输出**：`docs/security/CII_COMPLIANCE_REPORT.md` + README 徽章

### L2 人工验证

- [ ] 推送到 main 后 workflow 自动运行
- [ ] 周一 09:00 UTC 自动运行（schedule 触发）
- [ ] `docs/security/CII_COMPLIANCE_REPORT.md` 含 18 项检查结果表格
- [ ] README 徽章显示 `OpenSSF Compliance - Passing X/18`
- [ ] 全部通过时徽章为 brightgreen；80-99% 为 yellow；<80% 为 orange
- [ ] 工作流人工触发（workflow_dispatch）也能正常生成报告

---

## 十、待补充的测试缺口

下列场景目前**没有**自动化覆盖，列入后续工作：

- [ ] NotesScreen / GoalsScreen / HabitsScreen 的**屏幕级**渲染测试（需 RN 测试环境升级或 E2E 框架）
- [ ] AI 引擎与真实历史数据的**端到端**建议质量评估（需要 fixture 数据集 + 期望输出快照）
- [ ] 插件 `taskAfterComplete` / `noteBeforeSave` / `aiEnhanceSuggestions` 三个钩子目前**只有类型定义**，无内置插件实现，待第三方或后续迭代补充并加测试
- [ ] MiniCharts 在 Web 端（`build:web`）的渲染兼容性（react-native-web 对 `StyleSheet.hairlineWidth` 等的处理差异）
