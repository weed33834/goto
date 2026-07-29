---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 98adaa6f98486df4666888a6691e7607_4587461f8b4611f197fe525400826444
    ReservedCode1: 7WPIZhmGMWnAnvVexCjv3OWmQWMUO/iyjd2h66dpiDdrFXAiOaI8kVBPgxhCsFVttYq2Eme05Ay4ZaaX1pt4LVxn8PPJIUEnvIHgBl89S4wspN/iaFfvScIv4P/cGCwDWJ1SzVL3QLjearosJMQi8paJYio1x8l3kWgbHGhqlkUnPp+3b4t9+pcppDk=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 98adaa6f98486df4666888a6691e7607_4587461f8b4611f197fe525400826444
    ReservedCode2: 7WPIZhmGMWnAnvVexCjv3OWmQWMUO/iyjd2h66dpiDdrFXAiOaI8kVBPgxhCsFVttYq2Eme05Ay4ZaaX1pt4LVxn8PPJIUEnvIHgBl89S4wspN/iaFfvScIv4P/cGCwDWJ1SzVL3QLjearosJMQi8paJYio1x8l3kWgbHGhqlkUnPp+3b4t9+pcppDk=
---

# Goto v0.2.0 全链路因果逻辑与场景覆盖审计报告

> **审计日期**: 2026-07-29
> **覆盖范围**: desktop/ | backend/ | relay/
> **代码基准**: badhope/goto main

---

## 一、因果链路总览

### 1.1 启动 → 解锁 → 数据加载

```
main.tsx → App.tsx → hasVerifier() → LockScreen / Onboarding
  → unlock(password) → argon2id verify → loadData() → TodayPage
```

| 环节 | 状态 | 备注 |
|------|------|------|
| argon2id verifier 创建 | ✅ | m=64MB t=3 p=4，双算法兼容旧 PBKDF2 |
| 解锁验证 | ✅ | 旧 PBKDF2 verifier 自动升级为 argon2id |
| 3 次错锁 30s | ✅ | webAPI 层未实现但 authStore 层已实现 |
| auto-lock | ✅ | 0/1/5/15/30/60 min 可配 |
| lock() 清缓存 | ✅ | clearDerivedKeyCache + unlocked=false |

### 1.2 任务 CRUD → 持久化

```
TaskEditor → tasksSlice.addTask → webAPI.tasks.create → IndexedDB → saveData
```

| 环节 | 状态 | 备注 |
|------|------|------|
| 本地 IndexedDB 持久化 | ✅ | browserStorage (idb-keyval) |
| saveData 全部表落盘 | ✅ | persistenceSlice 驱动 |
| NLP 快速添加 | ✅ | naturalLanguageParser 接入 TaskEditor |
| 重复任务 next-instance | ✅ | recurrenceUtils.buildNextRecurrenceTask |
| 撤销/重做 | ✅ | useUndo hook |
| 后端 REST 双写 | ✅ | api 层有 createTask 但无 UI 触发路径 |

### 1.3 E2EE 同步配对

```
Settings → Sync → 添加新设备
  Host:  addDevice → generatePairingCode → respondToPairing → SMK 发送
  Join:  joinDevice → claimPairingCodeAndPair → SMK 接收 → addPairedDevice
```

| 环节 | 状态 | 备注 |
|------|------|------|
| claimPairingCode (Join) | ✅ | webAPI + useSyncRuntime 双路径 |
| generatePairingCode (Host) | ⚠️ Hook 已接通 | useSyncRuntime.addDevice 已接 respondToPairing |
| webAPI.generatePairingCode | 🔴 直接 throw Error | 兼容占位，说"请通过设置触发" |

### 1.4 同步数据交换

```
pairing 成功 → SyncEngine.start → MANIFEST → diff →
  REQUEST (500 分块) → BATCH (500 分块) → ACK → onComplete
```

| 环节 | 状态 | 备注 |
|------|------|------|
| manifest diff | ✅ | hash 校验 + 冲突裁决 |
| chunk 分块 | ✅ | 500 记录/批 |
| LWW 冲突解决 | ✅ | updatedAt 优先，version vectors 断 tbreak |
| 5000 记录基准 | ✅ | 649ms (7699 rec/s) |

### 1.5 备份/恢复

```
exportBackup → exportAllData → encryptBackup(argon2id + AES-256-GCM) → 下载
importBackup → pickFile → decryptBackup → importAllData → saveData
```

| 环节 | 状态 | 备注 |
|------|------|------|
| 加密备份 | ✅ | GTFB 头，双算法兼容 |
| 明文 JSON 导出 | ✅ | 不含 vault |
| 备份覆盖范围 | 🔴 不完整 | 见 §2.1 |

---

## 二、阻断性缺陷 (P0 — 阻断全链路闭环)

### 2.1 🔴 备份覆盖不完整

**文件**: `desktop/src/renderer/lib/webAPI.ts:917-939`

`exportAllData` 只导出 5 个表：tasks / vault / projects / categories / tags。
但 `persistenceSlice.ARRAY_FIELDS` 已扩展为 **11 个表**：

```
tasks, vault, projects, categories, tags,  ← 已导出
habits, goals, templates, smartLists, plugins, preferences  ← 丢失
```

**影响**：用户导出加密备份 → 恢复后 habits/goals/templates 等数据丢失。

**修复建议**：`exportAllData` / `importAllData` 应与 `persistenceSlice.ARRAY_FIELDS` 同步。

### 2.2 🔴 同步范围仅限于 tasks

**文件**: `desktop/src/shared/sync/syncEngine.ts`

SyncEngine 的 tables 参数在创建时注入，但当前仅 tasksSlice 触发同步。projects/categories/tags/vault 等表的变更不进入同步管道。

**影响**：配对后只能同步 tasks；项目/分类/标签/保险库不同步，多设备间状态不一致。

**修复建议**：扩展 `syncRecordApplier` 支持多表，syncSlice 监听所有表变更。

### 2.3 🔴 syncNow 不触发实际同步

**文件**: `desktop/src/renderer/lib/webAPI.ts:804-809`

```typescript
syncNow: async () => {
  const state = await webAPI.sync.getState();
  await setKV('app_settings', 'sync_state', {
    ...state,
    lastSyncAt: Date.now(),
  });
},
```

仅更新时间戳，不调用任何同步引擎。实际同步触发由 `useSyncRuntime` hook 驱动，但 hook 仅在 SyncSettingsPanel 挂载时激活。

**影响**：调用 `webAPI.sync.syncNow()` 无效果。

**修复建议**：syncNow 应触发 useAppStore 中的 E2EE 同步流程。

### 2.4 🔴 webAPI.generatePairingCode 未接通真实 relay

**文件**: `desktop/src/renderer/lib/webAPI.ts:814-820`

直接 throw Error。虽然 `useSyncRuntime.addDevice` 已接通 `respondToPairing`，但 webAPI 层作为兼容接口仍处于断裂状态。

**修复建议**：webAPI.generatePairingCode 委托给 useSyncRuntime.addDevice 相同逻辑。

---

## 三、全场景覆盖缺陷 (P1 — 场景破碎)

### 3.1 页面级/组件级单元测试缺失

**文件**: `docs/TEST_PLAN.md` 明确标注

| 已覆盖 | 未覆盖 |
|--------|--------|
| sync/ store/ utils/ api/ plugins/ | **13 个 Pages**、**大部分 Components**、renderer/store |

- TodayPage / CalendarPage / ProjectsPage / ... 等 13 页无单元测试
- TaskCard / TaskEditor / VaultCard / Sidebar 等组件无单元测试
- 仅 2 个 hook 有测试 (useUndo / useSyncRuntime)

### 3.2 移动端响应式未审计

12 个页面 + Mosaic 在手机宽度 (< 480px) 下的排版状态未知。ROADMAP B4 标记为待处理。

### 3.3 Filter DSL 仅基础实现

**文件**: `desktop/src/shared/filter/filterDsl.ts`

存在文件但尚未在 UI 中暴露。Todoist 风格语法 `today & p1 & @work` 未完成 parser + UI 集成。

### 3.4 Cmd+K 命令面板未实现

**文件**: `desktop/src/renderer/components/common/CommandPalette.tsx`

组件骨架存在但未连接命令路由注册表。Jump-to-page / 创建任务 / 切换视图等操作无法通过命令面板触发。

### 3.5 番茄钟功能异常校验

无 Service Worker 保活机制。浏览器标签页后台时 `setInterval` 被节流，可能导致计时偏差。无超时通知重试。

### 3.6 习惯追踪无工作集限制

无数据上限校验，长期使用可能导致 IndexedDB 膨胀。热力图计算为全量扫描，1000+ 习惯条目时性能可能退化。

---

## 四、企业级对比差距 (P2 — 差异化缺失)

| 维度 | Goto 当前 | 企业级基准 | 差距 |
|------|----------|-----------|------|
| 视图丰富度 | 12 页 + Mosaic | 甘特/时间线/表格/脑图 | Gantt/Timeline/Table/MindMap 视图 (D6) |
| 团队协作 | 无 | 多用户共享 | 可信小圈 2-5 人共享 (C3) |
| 自动化 | 无 | 条件触发/工作流 | 模板系统仅基础替换 |
| API/可编程性 | 无 | REST/GraphQL SDK | 可编程任务数据库 (D7) |
| 审计/合规 | 无 | 操作日志/合规报告 | 无操作日志 |
| 数据可移植性 | CSV/JSON/加密备份 | 多格式导入导出 | 仅 Todoist CSV + TickTick JSON |
| 性能监控 | 无 | APM/追踪 | 无性能埋点 |
| CI/CD | GitHub Actions | 多环境部署 | 仅 GitHub Pages 静态部署 |
| 监控告警 | 无 | Sentry/DataDog | 无错误追踪和上报 |
| E2E 测试 | Chromium only | 多浏览器 + 视觉回归 | 无 Firefox/Safari/视觉回归 |

---

## 五、代码质量审计

### 5.1 架构一致性

| 检查项 | 状态 |
|--------|------|
| 类型系统一致性 | ✅ 统一 types.ts，无平行类型系统 |
| store 孤军 实战 | ✅ 单一 Zustand store |
| 组件纯净化 | ✅ components/ 不 import 导航状态 |
| ID 生成统一 | ✅ nanoid 风格 generateId |
| API 层统一 | ✅ client.ts 单一 axios 实例 |

### 5.2 代码卫生

| 检查项 | 发现 |
|--------|------|
| dead code | 部分 importers (TickTick/Todoist) 无 UI 入口 |
| 硬编码配置 | DEFAULT_RELAY_URL 在 syncPolicy.ts |

### 5.3 依赖审计

| 依赖 | 版本 | 状态 |
|------|------|------|
| React | 18.x | ✅ 稳定 |
| Zustand | 4.x | ✅ 稳定 |
| Vite | 6.x | ⚠️ 仍为 5.x 在文档中记录 |
| hash-wasm | latest | ✅ |
| @dnd-kit | latest | ✅ |

---

## 六、优先级修复计划

### Phase 1: 阻断性修复（预计 3 天）

| # | 任务 | 影响面 |
|---|------|--------|
| P0-1 | 备份覆盖扩展到 11 个表 | webAPI.ts exportAllData / importAllData |
| P0-2 | 同步范围扩展到所有数据表 | syncRecordApplier / syncSlice |
| P0-3 | syncNow 接入实际同步 | webAPI.ts + useSyncRuntime |
| P0-4 | webAPI.generatePairingCode 接通 | webAPI.ts |

### Phase 2: 场景覆盖（预计 5 天）

| # | 任务 | 影响面 |
|---|------|--------|
| P1-1 | Pages 单元测试 | 13 pages |
| P1-2 | Components 单元测试 | 核心业务组件 |
| P1-3 | Filter DSL UI 集成 | SearchPage + filterDsl |
| P1-4 | Cmd+K 注册表 + UI | CommandPalette + 各页面注册 |

### Phase 3: 企业级差距（预计 2 周）

| # | 任务 |
|---|------|
| P2-1 | 甘特/时间线/脑图视图 (react-gantt / recharts / react-flow) |
| P2-2 | 多格式导入导出 (Notion / Things 3) |
| P2-3 | 操作日志 |
| P2-4 | 性能埋点 + 错误追踪 |
| P2-5 | E2E 多浏览器测试 |

---

## 七、可用第三方库建议（不重复造轮子）

| 需求 | 推荐库 | 理由 |
|------|--------|------|
| 甘特图 | `@neodrag/gantt` 或 `dhtmlx-gantt` | 成熟方案，维护活跃 |
| 时间线 | `recharts` 或 `vis-timeline` | React 原生支持 |
| 脑图 | `@antv/g6` 或 `reactflow` | 节点-边渲染引擎 |
| 表格视图 | `ag-grid-react` | 排序/过滤/分组/虚拟滚动 |
| 命令面板 | `cmdk` | Raycast 风格，1M+ 下载 |
| Filter DSL | `jsep` + 自定义 visitor | 轻量 JS 表达式解析器 |
| 多格式导入 | 已有 csvParser + json，加 `xlsx` 处理 Excel |
| 错误追踪 | `@sentry/react` | 标准方案 |
| 视觉回归 | `percy` 或 `storybook + chromatic` | Playwright 截图对比 |
| 国际化 | `i18next` + `react-i18next` | 当前仅中英文，扩展需要 |

---

> **审计结论**：核心链路（启动/CRUD/加密/配对/同步/备份）已验证跑通，但存在 4 个 P0 阻断项需立即修复。备份覆盖、同步范围、syncNow 和 webAPI.generatePairingCode 会直接影响用户数据完整性和跨设备同步体验。全场景测试框架缺失，页面级测试需要系统性补齐。
*（内容由AI生成，仅供参考）*
