# Goto 开发路线图

> **最后更新**:2026-07-27
> **当前版本**:0.2.0
> **测试基线**:Web unit 785 + 26 skipped | Web e2e 108 | Backend 81 | Relay 9

---

## 一、当前状态(0.2.0)

Goto 已是「日常可用」的本地优先 + E2EE 任务管理器,核心闭环跑通:

| 维度 | 状态 |
|---|---|
| 任务 CRUD + 子任务 + 依赖 | ✅ |
| 提醒系统(Notification API + SW) | ✅ |
| 重复任务(RecurrenceRule + next-instance) | ✅ |
| 自然语言快速添加(parser 接入 TaskEditor) | ✅ |
| 拖拽排序 + 批量操作 | ✅ |
| PWA(Workbox + manifest + SVG icons) | ✅ |
| vim 键盘快捷键 | ✅ |
| 看板 / 时间织锦 / 统计 / 周回顾 | ✅ |
| 加密备份(argon2id + AES-256-GCM,双算法兼容) | ✅ |
| 主密码(argon2id verifier,3 次错锁 30s,自动锁定) | ✅ |
| E2EE 同步(AES-256-GCM + X25519 + Ed25519 + HKDF) | ✅(单向:Web 仅能做 claimer) |
| 加密保险库(字段级 AES-256-GCM) | ✅ |
| **Skill / 插件管理页**(P1-4) | ✅ 内置 auto-tag + 用户关键词规则,启停 / 新建 / 导入 / 导出 / 试用 |
| **前后端 Schema 对齐**(P1-1) | ✅ recurrence / due_time / is_system / usage_count 等字段前后端一致 |
| **Project / Category 统计**(P1-2) | ✅ SQL 聚合查询,task_count / completed_task_count / progress 实时计算 |
| **Tag usage_count 自动维护**(P1-3) | ✅ 任务增删 / 改 tags 时同步刷新 |
| **代码清理与算法优化**(P2) | ✅ labels.ts / dateUtils.ts 抽离,insightsEngine 单遍扫描,死文件清理 |

---

## 二、下一阶段优先级

### Phase B — 同步闭环 + 移动适配(预计 2 周)

| # | 任务 | 价值 |
|---|---|---|
| B1 | **Web 端 responder 配对**(`webAPI.sync.generatePairingCode` 接通 `respondToPairing`) | 当前 Web 只能做 claimer,无法作为配对 host |
| B2 | **同步范围扩展到 projects / categories / tags / vault** | 修复"配对后只同步 tasks"的隐藏 bug |
| B3 | ~~**同步冲突 UI**(接通已实现的 conflictResolver)~~ ✅ 已完成(P1-3) | ConflictDialog 双栏对比 + 保留本地/接受远端,useSyncScheduler 回滚 localRecord |
| B4 | **移动端响应式布局审计** | 当前 12 页在手机宽度下排版有破损 |
| B5 | ~~**后端接通 UI**~~ ✅ 部分完成(P1-2/P1-3) | Project/Category 统计、Tag usage_count 已前后端贯通;剩余 projects/categories/tags 的 CRUD 入口仍在 Web 端缺失 |

### Phase C — 差异化机制(预计 2-3 周)

| # | 任务 | 价值 |
|---|---|---|
| C1 | **时间织锦 v2** | 当前 Mosaic 仅展示数字,加可视化砖块(每日 1 砖,完成度着色) |
| C2 | **加密时间胶囊** | 写给未来自己的加密消息,指定时间后解锁(E2EE 差异化) |
| C3 | **可信小圈**(2-5 人加密共享) | 复用 E2EE 协议扩展到多设备群组 |
| C4 | **计划 vs 玄想** | Things 3 的 Someday 视图 + 本地优先状态机 |
| C5 | **Filter DSL**(Todoist 风格 `today & p1 & @work`) | 任务量过百后必需 |
| C6 | **Cmd+K 命令面板** | 类 Raycast,跨页跳转 + 操作 |

### Phase D — 高级功能(预计 3-4 周)

| # | 任务 | 价值 |
|---|---|---|
| D1 | ~~**番茄钟**(usePomodoro + FocusPage)~~ ✅ 已完成(s2) | PomodoroPage 圆环倒计时 + 配置面板,复用 pomodoroSettings |
| D2 | ~~**习惯追踪**(Habit 实体 + 热力图)~~ ✅ 已完成(s3) | habitsSlice + HabitHeatmap + HabitPage,本地持久化(不走 E2EE 同步) |
| D3 | ~~**模板系统**(Template + 变量替换)~~ ✅ 已完成 | templatesSlice + TemplatePage,变量替换 + 使用次数排序,侧栏/命令面板/路由全接入 |
| D4 | ~~**目标 OKR**(Goal + 关键结果)~~ ✅ 已完成 | goalsSlice + GoalPage,量化/定性 KR + 进度环自动汇总,周期分组,侧栏/命令面板/路由全接入 |
| D5 | ~~**本地 AI 建议**(统计引擎)~~ ✅ 已完成 | insightsEngine 8 条规则(逾期/积压/趋势/陈旧/超载/习惯中断/预估偏差/目标停滞),InsightsPage 顶部建议卡片区,纯本地计算不引入 WebLLM |
| D6 | **甘特 / 时间线 / 脑图视图** | ViewType 类型已就绪 |
| D7 | **可编程任务数据库**(`goto.query('...')` JS API) | E2EE + 本地优先的独有差异化 |

---

## 三、技术栈版本

| 组件 | 版本 |
|------|------|
| Web 应用(Vite + React) | React 18 / TypeScript 5 / Zustand 4 / Vite 5 |
| Python(后端) | 3.11+ |
| FastAPI | 最新稳定版 |
| Node.js(Relay) | 18+(推荐 ≥20) |
| Vitest | 最新稳定版 |

---

## 四、测试基线

| 子项目 | 测试数 | 状态 |
|--------|--------|------|
| Web 应用(Vitest) | 785 passed + 26 skipped | ✅ |
| Web 应用(Playwright e2e) | 108 | ✅(本地基线;CI 沙箱受 chromium 启动限制) |
| 后端(pytest) | 81 | ✅ |
| Relay(vitest) | 9 | ✅ |
| **合计** | **983** | **✅** |

> 注:本轮 P1-P4 重构后,部分重复 / 失效测试被合并或删除,测试总数较上一基线(1011)有所下降,但覆盖面更精准(新增 PluginPage / pluginsSlice / buildUserPlugin / Project stats / Tag usage_count 等用例)。typecheck + lint + 三套 test 套件全绿。
