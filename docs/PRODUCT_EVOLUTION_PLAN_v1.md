# Goto 产品演进方案 v1.0

> **最后更新**:2026-07-20
>
> **来源**:基于 10 款竞品调研(Todoist / TickTick / Things 3 / MS To Do / Any.do / Superlist / OmniFocus / Taskade / Water Do / Habitica)+ 当前代码逐文件审计
>
> **目的**:把 Goto 从"骨架完整但 70% 字段为死代码"打磨到"普通人能流畅使用,且具备 E2EE + 本地优先差异化"的水平

---

## 一、PM 评估:离普通人使用还有多远

### 1.1 当前状态(2026-07-20)

Goto 当前的实现呈现典型的 **"类型层超前 + 实现层滞后"** 特征:

| 层级 | 已就位 | 未接通 |
|---|---|---|
| 类型定义 | Task 45 字段 / ViewType 8 种 / PomodoroSettings 10 字段 / IntegrationSettings 11 集成开关 | — |
| Slice 方法 | addSubtask / updateSubtask / deleteSubtask / addAttachment / addComment / addChecklistItem / reorderTasks / useBulkSelection | 0 UI 调用点 |
| 自然语言解析 | naturalLanguageParser.ts 能解析 #tag / +project / !1 / 每天 / 明天下午3点 | 0 生产调用 |
| 数据模型 key | STORAGE_KEYS 含 HABITS / GOALS / TEMPLATES / NOTES / REMINDERS 等 11 个 | 0 代码读写 |

**接通率估算**:类型层 100%,Slice 方法层 ~50%,UI 层 ~30%

### 1.2 距离普通人可用的距离

| 距离维度 | 评估 |
|---|---|
| **能"提醒我"吗** | ❌ 不能 — `Task.reminderDate` 永远 null,无 Notification API |
| **能"每天重复"吗** | ❌ 不能 — `recurrence` 字段在,无 next-instance 生成 |
| **能"拆子任务"吗** | ❌ 不能 — slice 有方法,UI 0 入口 |
| **能"看板管理项目"吗** | ❌ 不能 — 0 KanbanView 组件,且项目卡片无详情页 |
| **能"看到我的进步"吗** | ❌ 几乎不能 — Mosaic 只显示 3 个数字,无图表 |
| **能"批量删任务"吗** | ❌ 不能 — useBulkSelection 死代码 |
| **能"输入'明天3点买菜'自动解析"吗** | ❌ 不能 — parser 写了不调 |
| **能"安装到桌面"吗** | ❌ 不能 — 无 Service Worker / PWA |

**结论**:Goto 离普通人可用还有 **2 个 Phase(约 4-6 周净开发)** 的距离。Phase 1(阻塞性,2 周)完成即可作为"日常可用";Phase 2(体验性,2 周)完成达到"主流竞品 80% 功能"水平。

### 1.3 真正的"产品价值闭环"

```
用户首次进入
   ↓
[Onboarding] 设置主密码 ← 已实现 ✅
   ↓
[Today] 看到"今天该做的" ← 已实现 ✅,但缺智能建议
   ↓
[Quick Add] 输入"明天3点开会 #工作" ← ❌ parser 未接通
   ↓
[Reminder] 到点提醒 ← ❌ 无提醒系统
   ↓
[Recurring] 完成后自动生成下次 ← ❌ 无 next-instance
   ↓
[Subtasks] 复杂任务拆解 ← ❌ 无 UI
   ↓
[Review] 每天看完成情况 ← ❌ 无回顾页
   ↓
[Insights] 看长期趋势 ← ❌ 无统计页
   ↓
[Retention] 用户留下来 ← 当前留存差
```

闭环中至少 5 个环节断裂,所以"用一次就不想再用"是大概率事件。

---

## 二、竞品调研核心结论

### 2.1 横向对比(选 5 个最关键维度)

| 功能 | Todoist | TickTick | Things 3 | MS To Do | OmniFocus | **Goto** |
|---|---|---|---|---|---|---|
| 重复任务 | ✅ 自然语言 | ✅ 自定义 | ✅ | ✅ 基础 | ✅ 强大 | ❌ 字段在,逻辑无 |
| 提醒系统 | ✅ 多通道 | ✅ 多通道+位置 | ✅ | ✅ | ✅ 多通道 | ❌ 0 |
| 子任务 | ✅ 4 级 | ✅ 无限 | ⚠️ 单层 | ⚠️ Steps | ✅ 无限 | ❌ slice 有,UI 无 |
| 看板视图 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ 类型有,组件无 |
| 统计图表 | ⚠️ Karma | ✅ 完整 | ❌ | ❌ | ❌ | ❌ 仅 3 个数字 |
| 番茄钟 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ 配置有,实现无 |
| 习惯追踪 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ key 有,实现无 |
| 智能过滤 | ✅ Filter DSL | ✅ | ⚠️ 标签 | ⚠️ 固定 | ✅ Perspective | ❌ 仅 4 个静态 tab |
| 模板系统 | ✅ | ⚠️ 有限 | ❌ | ❌ | ⚠️ | ❌ key 有,实现无 |
| 回顾模式 | ⚠️ | ✅ 每日 | ✅ 隐式 | ⚠️ My Day | ✅ Review | ❌ 0 |
| 自然语言 | ✅ 标杆 | ✅ | ✅ | ⚠️ 日期 | ⚠️ | ❌ parser 写了不调 |
| 拖拽排序 | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ slice 有,UI 无 |

**结论**:Goto 在 12 项核心功能中 11 项缺失或断头。最严重的是绝大多数"缺失"并非从零开始,而是"类型/slice 写好了 UI 没接"——意味着补全成本远低于从零开发。

### 2.2 Goto 的差异化机会(他们没有的)

1. **端到端加密 + 本地优先的可编程任务数据库** — Todoist/TickTick/Things 全部云后端,用户数据不在自己手里;Goto 数据始终在 IndexedDB,可暴露 `goto.query('due:today & p1')` JS API 让用户像查数据库一样查自己的任务
2. **浏览器内 WASM LLM 隐私 AI** — 竞品的 AI 都是把数据发云端 LLM,与 E2EE 矛盾;Goto 可走 WebLLM + Llama 3.2 1B/3B 完全本地运行,数据零外泄
3. **以回顾为中心的工作流** — Things 3 的 Today/Upcoming/Anytime/Someday 四态 + OmniFocus Review Perspective 的结合,本地优先应用天然适合做重状态机

---

## 三、补全优先级(4 个 Phase)

### Phase 1 — 阻塞性(2 周,~10 项)

> 目标:让 Goto 真正能用作"日常任务管理器"。完成后用户可日常使用。

| # | 任务 | 价值 | 涉及文件 |
|---|---|---|---|
| 1.1 | **提醒系统** — useReminders hook + Notification API + Service Worker 注册 + TaskEditor 加 reminderDate 控件 + 提醒列表 UI | 让任务管理器能"到点提醒" | 新增 hooks/useReminders.ts / components/reminders/ / public/sw.js;改 TaskEditor.tsx / main.tsx |
| 1.2 | **重复任务 next-instance** — 完成 recurring task 时生成下次实例 + TaskEditor 加 recurrence 控件 + 接入 naturalLanguageParser | "每天吃药 / 每周开会"刚需 | 改 tasksSlice.ts (toggleTaskComplete) / TaskEditor.tsx;新 recurrenceUtils.ts |
| 1.3 | **子任务 UI** — TaskCard 展开行 + TaskEditor 子任务区 + 调用现有 addSubtask / updateSubtask / deleteSubtask | 复杂任务拆解 | 改 TaskCard.tsx / TaskEditor.tsx / TaskList.tsx |
| 1.4 | **TaskEditor 暴露全字段** — 加 estimatedTime / isStarred / progress / reminderDate / recurrence / energyLevel / context 控件 | 让 Task 类型已有字段真正可用 | 改 TaskEditor.tsx + types.ts(加 energyLevel / context) |
| 1.5 | **接入 naturalLanguageParser** — TaskEditor title 输入框 onBlur 调 parser,自动填字段 | 已有资产变现,0 新增成本 | 改 TaskEditor.tsx |
| 1.6 | **批量操作 UI** — TaskList 接入 useBulkSelection,加批量删除 / 改项目 / 改截止 / 改优先级 | 死代码变现 | 改 TaskList.tsx / TaskCard.tsx |
| 1.7 | **拖拽排序** — 接入 @dnd-kit,调用现有 reorderTasks | 任务顺序可调 | 改 TaskList.tsx |
| 1.8 | **PWA(Service Worker + manifest)** — 离线安装到桌面 | 本地优先应用必备 | 新增 public/sw.js / public/manifest.webmanifest;改 vite.config.ts / index.html |
| 1.9 | **键盘快捷键 vim 风格** — j/k 上下 / e 编辑 / d 完成 / x 删除 / # 加标签 | 键盘用户粘性 | 改 TaskList.tsx / useKeyboardShortcuts.ts |
| 1.10 | **项目详情页 + 项目内任务列表** — ProjectsPage 卡片可点击进入 /projects/:id | 项目维度可用 | 新 ProjectDetailPage.tsx;改 App.tsx 路由 |

### Phase 2 — 体验性(2 周,~7 项)

> 目标:达到"主流竞品 80% 功能"水平,有差异化体验。

| # | 任务 | 价值 |
|---|---|---|
| 2.1 | **看板视图 KanbanView** — 按状态 / 优先级 / 标签分组,拖拽改状态 | 项目类任务泳道展示,ProjectSettings.defaultView 真正生效 |
| 2.2 | **统计仪表盘 InsightsPage** — 完成率 / 每周分布 / 标签占比 / 项目进度对比 / 年度热力图 | 用户感受长期价值 |
| 2.3 | **每日 / 每周回顾 ReviewPage** — 复用 Mosaic 数据,加"今天完成 X / 逾期 Y / 明天 Z / 本周亮点 / 下周计划" | GTD 用户强需求 |
| 2.4 | **智能列表 / Filter Query DSL** — 借鉴 Todoist 的 `& \| ! ()` 语法,如 `due:today & p1 & @work` | 任务量过百后必需 |
| 2.5 | **快速命令面板 Cmd+K 增强** — 接入 parser,支持"明天下午3点 买菜 #购物"一键创建 | 键盘用户粘性飙升 |
| 2.6 | **Calendar 视图拖拽改日期 + 时间块拖拽调整时长** | 时间导向用户必需 |
| 2.7 | **E2EE 同步扩展到 projects / categories / tags / vault** — useSyncScheduler tables 数组扩展 | 修复"配对后只同步 tasks"的隐藏 bug |

### Phase 3 — 差异化(2 周,~6 项)

> 目标:形成独有竞争力,避免同质化。

| # | 任务 | 价值 |
|---|---|---|
| 3.1 | **番茄钟 usePomodoro + PomodoroSession 模型 + FocusPage** | pomodoroSettings 配置已就绪,补使用层;TickTick 高粘性功能 |
| 3.2 | **习惯追踪 Habit 实体 + HabitsPage** — Streak / 习惯日历热力图 | STORAGE_KEYS.HABITS 已留 key |
| 3.3 | **模板系统 Template + TemplatesPage** — 任务模板 / 清单模板 / 变量替换 | STORAGE_KEYS.TEMPLATES 已留 key |
| 3.4 | **三类任务模型(Habit / Daily / Todo)** — 借鉴 Habitica 三栏 | 让用户不再用"重复任务"硬模拟"习惯" |
| 3.5 | **艾森豪威尔矩阵视图** — 重要 × 紧急四象限 | TickTick 已有,差异不大但视觉冲击 |
| 3.6 | **任务时间状态机** — Today / Upcoming / Anytime / Someday 四态(借鉴 Things 3) | 与本地优先 E2EE 卖点结合 |

### Phase 4 — 进阶(2-4 周,~7 项)

> 目标:对标 OmniFocus / Todoist Pro 的高端功能。

| # | 任务 | 价值 |
|---|---|---|
| 4.1 | **目标 OKR(Goal 实体 + 关键结果)** | OmniFocus / Things 3 级别 |
| 4.2 | **AI 建议(本地统计引擎 + 可选 WebLLM)** | AISuggestion 类型已就绪;隐私 AI 差异化 |
| 4.3 | **协作 MVP(共享清单 / 指派)** | assigneeId / ProjectMember 类型已就绪 |
| 4.4 | **日历集成(iCal 导入 / Google Calendar 同步)** | IntegrationSettings 占位字段已就绪 |
| 4.5 | **甘特 / 时间线 / 脑图视图** | ViewType / GanttConfig / TimelineConfig 类型已就绪 |
| 4.6 | **可编程任务数据库** — 暴露 `goto.query('...')` JS API + Dashboard 视图 | E2EE + 本地优先的独有差异化 |
| 4.7 | **后端补 habits / goals / templates / pomodoros / insights 端点** | 与前端 Phase 3-4 对齐 |

---

## 四、本轮实施建议

### 4.1 推荐范围

本轮(单次会话)推荐完成 **Phase 1 全部 10 项** + **Phase 2 的 2.1(看板)+ 2.2(统计)+ 2.3(回顾)**,共 13 项。理由:

- Phase 1 全部是"接通已有死代码"或"补阻塞功能",单位时间 ROI 最高
- 看板 / 统计 / 回顾是用户感知最强的"普通任务管理器该有的样子"
- Phase 3-4(番茄钟 / 习惯 / 模板 / AI)留作下一轮,避免本轮战线过长

### 4.2 不在本轮范围内

- Phase 3 番茄钟 / 习惯追踪 / 模板系统 / 三类任务模型 / 矩阵 / 状态机
- Phase 4 OKR / AI / 协作 / 日历集成 / 甘特脑图 / 可编程 DB / 后端扩展

### 4.3 测试与文档

- 每个新功能加 vitest 单元测试(slice / hooks / utils)
- 关键流程加 Playwright e2e(reminder / recurrence / subtask / kanban / insights)
- 更新 docs/ROADMAP.md / CHANGELOG.md / README.md / FAQ.md
- 完成后跑全量 verify:typecheck + build + unit + e2e 全绿
- 推送 GitCode + GitHub 双仓库

### 4.4 风险

- **E2EE 同步兼容性**:新字段(energyLevel / context / reminderDate 真实使用)需考虑同步协议是否需要升级。当前同步只跑 tasks 表,新字段在 task 内是 JSON,无需协议升级。
- **PWA + Service Worker**:首次注册 SW 后,后续部署需注意 cache 失效策略。建议用 vite-plugin-pwa 自动生成 SW + manifest。
- **拖拽库选型**:@dnd-kit 较重,可考虑原生 HTML5 drag-drop 简化。本轮选 @dnd-kit 因为支持跨容器(看板泳道)。

---

## 五、参考文档

- [竞品调研完整报告](./competitor-research-2026-07-20.md)(可选归档)
- [当前代码盲点审计](./code-audit-2026-07-20.md)(可选归档)
- [ROADMAP.md](./ROADMAP.md)
- [GOTO_PIVOT_PLAN.md](./GOTO_PIVOT_PLAN.md)
