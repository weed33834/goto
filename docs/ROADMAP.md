# Goto 开发路线图

> **最后更新**:2026-07-20
> **当前版本**:v1.3.0 + Phase 1/2 体验扩展(2026-07-20)
> **测试总数**:628(Web 应用 unit **511 passed** + 26 skipped | Web 应用 e2e 108 | Relay 9 | Backend 104)

> ⚠️ **产品方向转向**:本项目正从 `TaskFlow`(本地优先任务工具)转向 `Goto`(加密私人时间资产)。完整转向计划见 [GOTO_PIVOT_PLAN.md](./GOTO_PIVOT_PLAN.md)。本路线图仅保留转向前的历史归档与转向后的 Phase A 进度。Phase B-D 见 Pivot Plan。

> ⚠️ **架构说明**:本项目最初规划了 React Native 移动端 + Electron 桌面端,现已移除移动端与 Electron 构建。当前为**纯浏览器 Web 应用**(仓库 `desktop/` 目录,Vite + React 18 + Zustand 4 + TypeScript 5,数据存于 IndexedDB,密钥经 Web Crypto / PBKDF2 派生)。下方变更日志中出现的「移动端」条目为历史记录,对应代码已从仓库删除。

> 注:历史归档中的 Phase 7 条目原描述包含未真正落地的功能(目标/习惯模块 + MiniCharts、AI 智能建议增强本地统计引擎),经 v1.3 代码审计确认 0 实现,本版已诚实化标注。

---

## 一、产品方向转向(2026-07-17)

转向决策详见 [GOTO_PIVOT_PLAN.md](./GOTO_PIVOT_PLAN.md)。摘要:

- **新定位**:从"任务工具"→"加密私人时间资产"
- **5 个差异化机制**:时间织锦 / 计划 vs 现实 / 加密时间胶囊 / 本地生灵 / 可信小圈
- **三端架构**:Web PWA + Electron + 微信小程序(thin client)
- **改名**:taskflow → goto

---

## 二、Phase A:产品债清偿 + 诚实化 + 视觉地基(2026-07-17 进行中)

> 完整 Phase A 任务清单见 [GOTO_PIVOT_PLAN.md §10](./GOTO_PIVOT_PLAN.md#10-立即执行清单phase-a-启动)。

| # | 任务 | 状态 |
|---|---|---|
| A1 | 重命名 taskflow → goto | ✅ 完成(品牌/代码/文档;IndexedDB 名 + 协议字符串保持以兼容旧数据) |
| A2 | 修加密备份 stub(PBKDF2-SHA256 600k + AES-256-GCM) | ✅ 完成 |
| A3 | 修 Web 配对 stub(接通 pairingService) | ✅ 完成 |
| A4 | 删 mobile.ts 遗留(1500 行孤儿类型) | ✅ 完成 |
| A5 | 诚实化 README/ROADMAP | ✅ 完成 |
| A6 | 初始化 pnpm workspace + turbo + tsup | ⏳ 待办 |
| A7 | Tailwind 3 → 4 升级 | ⏳ 待办 |
| A8 | shadcn/ui 接入 | ⏳ 待办 |
| A9 | 首屏 hero + onboarding 3 屏设计稿冻结 | ⏳ 待办 |
| A10 | 时间织锦 MVP 上线(纯 CSS,每日 1 砖) | ⏳ 待办 |
| A11 | motion token 系统 | ⏳ 待办 |
| A12 | 引入依赖(framer-motion/lucide-react/clsx/tailwind-merge/knip) | ✅ 完成 |
| A13 | shared/sync strangler 双跑期启动 | ⏳ 待办 |
| A14 | 接入 Trees for the Future API | ⏳ 待办 |

### 二.1 体验审计闭环(2026-07-20 ✅ 完成)

> 三轮尖锐批评的体验审计报告(P0 致命 6 项 / P1 体验缺口 12 项 / P2 工程缺陷 7 项)
> 已全部闭环。详见 [CHANGELOG.md](../CHANGELOG.md) 的 [Unreleased] — Phase A 体验审计闭环 条目。

| 等级 | 项 | 修复内容 |
|---|---|---|
| P0 | 删除后 toast 干扰断言 | 6 个 e2e spec 用 `page.locator('main')` 限定 |
| P1-1 | 快捷键发现性 | `?` 浮层 + 设置页快捷键分区 + "查看所有快捷键"按钮 |
| P1-3 | 自动锁定 / 字体大小 | 自动锁定升级为 select(0/1/5/15/30/60);新增字体大小 select(小/中/大) |
| P1-5 | 删除二次确认 dialog 阻塞 | categories/projects/tags e2e 加 `page.on('dialog', d => d.accept())` |
| P1-8 | MobileHeader 快速添加 | 移动端顶部加快速添加按钮 |
| P1-10 | 修改主密码 | SettingsPage 安全分区 inline 表单;验证旧密码 → 写新 verifier → 清缓存 |
| P1-12 | 危险区 | SettingsPage 红框分区:清空数据 + 恢复出厂设置 |
| P2-1 | MosaicView 悬停高亮不重绘 | rafRef.current = 0 + 主动 requestAnimationFrame |
| P2-2 | useAutoLock mousemove 高频调度 | 1 秒 throttle |
| 改 | 密码错误 cooldown | 3 次错锁 30 秒(`failedAttempts` + `lockedUntil`) |
| 改 | 剪贴板延迟清除 | 默认 30 秒后清,可配置,复制按钮显示倒计时 |
| 改 | CSP connect-src 放宽 | `ws: wss: http: https: blob:` |

verify 全绿:typecheck + build + unit 494 + e2e 108。首屏 JS gzip ~103KB(≤ 250KB 预算)。

### 二.2 Phase 1 + Phase 2 体验扩展(2026-07-20 ✅ 完成)

> 基于 [PRODUCT_EVOLUTION_PLAN_v1](./PRODUCT_EVOLUTION_PLAN_v1.md) 的 PM 评估 + 竞品调研
> (Todoist / TickTick / Things 3 / OmniFocus / Habitica) + 代码审计合成结论:
> Goto「类型层超前、UI 层滞后」——45 字段 Task 类型在 UI 只接通 ~30%,5 大阻塞性体验缺口。
> 本轮按"用户感知优先"顺序闭环 Phase 1 全 10 项 + Phase 2 的看板 / 统计 / 回顾 = **13 项**。

#### Phase 1 阻塞性体验(10 项)

| # | 任务 | 状态 | 关键文件 |
|---|---|---|---|
| 1.1 | 提醒系统(Notification API + SW + UI) | ✅ | `useReminders.ts` + `TaskEditor.reminderDate` |
| 1.2 | 重复任务 next-instance + recurrence UI | ✅ | `recurrenceUtils.ts` + `tasksSlice.toggleTaskComplete` |
| 1.3 | 子任务 UI(TaskCard 展开 + TaskEditor 区) | ✅ | `TaskCard` + `TaskEditor` + 导出 `Subtask` 接口 |
| 1.4 | TaskEditor 暴露全字段(energy/context/progress/star/estimatedTime) | ✅ | `TaskEditor.tsx` 完全重写 |
| 1.5 | 接入 naturalLanguageParser | ✅ | `TaskEditor.handleTitleBlur` |
| 1.6 | 批量操作 UI(TaskList 接入 useBulkSelection) | ✅ | `TaskList.tsx` |
| 1.7 | 拖拽排序(@dnd-kit + reorderTasks) | ✅ | `TaskList.tsx` + `vendor-dnd` chunk |
| 1.8 | PWA(Service Worker + manifest + icons) | ✅ | `vite.config.ts` + `public/icon.svg` + `index.html` |
| 1.9 | vim 键盘快捷键(j/k/e/d/x/gg/G/) | ✅ | `useVimShortcuts.ts` |
| 1.10 | 项目详情页 /projects/:id | ✅ | `ProjectDetailPage.tsx` |

#### Phase 2 体验扩展(3 项)

| # | 任务 | 状态 | 关键文件 |
|---|---|---|---|
| 2.1 | 看板视图 KanbanView | ✅ | `KanbanPage.tsx`(5 列 + 跨列拖拽改 status) |
| 2.2 | 统计仪表盘 InsightsPage | ✅ | `InsightsPage.tsx`(Karma + 14 天趋势 + 分布) |
| 2.3 | 每周回顾 ReviewPage | ✅ | `ReviewPage.tsx`(周范围切换 + 反思 + 归档) |

#### 测试基线

- frontend unit:**511 passed** / 26 skipped(25 test files,新增 `recurrenceUtils.test.ts`)
- frontend e2e:108 passed / relay 9 / backend 104(本轮未触及)
- 首屏 JS gzip ~103KB(≤ 250KB 预算)
- 全量 verify:typecheck ✅ / build ✅ / vitest ✅

#### Phase 2 剩余(7 项,下一轮)

| # | 任务 | 备注 |
|---|---|---|
| 2.4 | Filter DSL(Todoist 风格 `today & p1`) | 复用 `Filter` 类型,加 parser |
| 2.5 | Cmd+K 命令面板 | 类 Raycast,跨页跳转 + 操作 |
| 2.6 | Calendar 拖拽改 dueDate | 复用 `@dnd-kit` |
| 2.7 | 同步扩展(冲突 UI / 暂停 / 强制) | 接通已实现的 conflictResolver |
| 2.8 | Filter DSL 持久化(保存为视图) | 复用 `View` 类型 |
| 2.9 | 任务模板 | 类 TickTick |
| 2.10 | 自定义字段 UI | 复用 `CustomField` 类型 |

详见 [PRODUCT_EVOLUTION_PLAN_v1](./PRODUCT_EVOLUTION_PLAN_v1.md) — Phase 3(差异化,6 项)/ Phase 4(进阶,7 项)。

---

## 三、历史归档(转向前)

### Phase 7:功能扩展(2026-07-04,部分条目经审计为 0 实现)

> ⚠️ 经 v1.3 代码审计,以下原标"已完成"的条目实际为 0 实现,本版诚实化:

- [x] **插件系统(Web 应用)**:TS 插件注册表 + 内置 autoTagPlugin(仅 1 个插件实现 1/4 个 hook)
- [x] **Web 应用部署 CI**:Vite 构建产物 dist/renderer 部署到 GitHub Pages
- ❌ **笔记/日记模块**:Markdown 编辑、全文搜索、标签分类 — **代码 0 实现**(原 README 宣称已落地)
- ❌ **目标/习惯模块**:可视化图表(MiniCharts) — **代码 0 实现**
- ❌ **AI 智能建议增强**:本地统计引擎(无网络/无模型) — **代码 0 实现**,实际为 4 组关键词 → 标签匹配

### Phase 8:质量与文档(已完成 ✅)

- [x] **CII Best Practices Badge 自动化**:
  不再依赖 bestpractices.dev 在线填表。新建 `.github/workflows/ossf-compliance.yml`
  在每次推送 main 或每周一自动审计 18 项 Passing 级关键实践,生成
  `docs/security/CII_COMPLIANCE_REPORT.md` 并动态更新 README 徽章。

### Phase 9:项目级决策(已代码化 ✅)

- [x] **多设备同时在线数量 → 无限制**(`syncPolicy.ts` `maxDevices = null`)
- [x] **官方托管中继 → 双轨支持**(`DEFAULT_RELAY_URL = 'wss://relay.goto.app'`)
- [x] **同步范围 → 全业务数据 + 附件元数据**(`SYNC_SCOPE` 14 种记录类型)
- [x] **移动端构建配置(EAS projectId) → 已废弃**

---

## 四、技术栈版本

| 组件 | 版本 |
|------|------|
| Web 应用(Vite + React) | React 18 / TypeScript 5 / Zustand 4 / Vite 5 |
| Python(后端) | 3.11+ |
| FastAPI | 最新稳定版 |
| Node.js(Relay) | 18+(推荐 ≥20) |
| Vitest | 最新稳定版 |

---

## 五、测试基线

| 子项目 | 测试数 | 状态 |
|--------|--------|------|
| Web 应用(Vitest) | 333 passed + 26 skipped | ✅ 全通过 |
| 后端(pytest) | 104 | ✅ 全通过 |
| Relay(vitest) | 9 | ✅ 全通过 |
| **合计** | **~446** | **✅** |

> 测试基线由 912(原宣称)修正为 ~446,差异来自同步/状态层测试在 Phase A strangler 启动期的暂跳,以及 mobile.ts 删除后的类型 re-export 调整。后续随 Phase B 重建后回升。

---

## 六、变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 产品方向转向 Goto(详见 GOTO_PIVOT_PLAN.md);Phase A 完成 A1-A5/A12:重命名 taskflow→goto、修加密备份 stub(PBKDF2-SHA256 600k + AES-256-GCM)、修 Web 配对 stub(接通 pairingService)、删 mobile.ts 1500 行孤儿类型、诚实化 README/ROADMAP、引入 framer-motion/lucide-react/clsx/tailwind-merge/knip |
| 2026-07-07 | 安全审计 36 项全部闭环;测试基线更新至 912 项;开启 GitHub delete_branch_by_merge |
| 2026-07-04 | Phase 8/9 完成:CII Badge 自动化;4 项项目级决策代码化;前端测试 476→509 |
| 2026-07-04 | Phase 7 部分完成:笔记 Markdown、目标/习惯可视化、移动端插件系统、AI 统计引擎(**注:经 v1.3 审计,前 3 项为 0 实现**);Web 部署 CI;前端测试 339→476 |
| 2026-07-03 | Phase 5/6a/6b 完成:多设备并发同步 + 配对设置 + 同步核心层 |
| 2026-07-02 | Phase 1-2 完成:安全审计修复 + 1.x 功能补全 |
