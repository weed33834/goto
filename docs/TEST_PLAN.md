# 测试计划

> **最后更新**:2026-07-26
> **适用版本**:0.2.0

本文档描述 Goto 当前的测试结构与策略。架构以 [ARCHITECTURE.md](../ARCHITECTURE.md) 为准。

---

## 一、测试分层

| 层级 | 工具 | 范围 | 运行命令 |
|---|---|---|---|
| L1 单元测试 | Vitest | 纯函数 / Store / 加密 / 工具 | `pnpm --filter goto-desktop test` |
| L2 端到端 | Playwright | 用户交互流程 | `pnpm --filter goto-desktop exec playwright test` |
| L3 后端测试 | pytest + httpx | API + 安全 | `cd backend && .venv/bin/python -m pytest` |
| L4 后端模糊 | hypothesis | 输入校验 | `backend/fuzz/test_validator_fuzz.py` |
| L5 中继测试 | Vitest + supertest | WebSocket 中继 | `pnpm --filter @goto/relay test` |

---

## 二、desktop(Web 应用)

### 单元测试(Vitest)

测试文件与源文件同目录,命名 `*.test.ts` / `*.test.tsx`。

**已覆盖模块**:
- `src/shared/sync/` — 加密 / 字节 / 冲突解决 / 配对 / 多设备同步(含 `securityFuzz.test.ts`)
- `src/shared/store/slices/` — tasksSlice / persistenceSlice / syncSlice
- `src/shared/utils/` — markdownHelper / naturalLanguageParser / recurrenceUtils
- `src/shared/api/transform.ts` / `src/shared/mosaic/deriveMosaic.ts`
- `src/shared/plugins/registry.ts`
- `src/shared/hooks/useUndo.ts`

**待补**:renderer/pages(13 个 Page)、renderer/components、renderer/store。

### E2E(Playwright)

- 配置:`desktop/playwright.config.ts`
- 用例:`desktop/e2e/`(14 个 spec)
- 浏览器:chromium
- 隔离:每用例新建 context(清空 IndexedDB + localStorage)
- 首启:`setupUnlockedApp` 预置 localStorage 跳过 onboarding + 设置主密码

**首次运行需先**:`pnpm exec playwright install --with-deps chromium`

---

## 三、backend(FastAPI)

### 测试结构

```
backend/
├── tests/
│   ├── test_cors.py              # CORS 配置
│   ├── test_security.py          # 鉴权 / 安全头
│   └── integration/
│       ├── test_api.py           # API 健康检查 + 鉴权
│       ├── test_tasks_api.py     # 任务 CRUD
│       └── test_projects_categories_tags_api.py  # 项目/分类/标签
└── fuzz/
    └── test_validator_fuzz.py    # 输入校验模糊测试
```

### 运行

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
```

---

## 四、relay(同步中继)

- 测试文件:`relay/src/relay.test.ts`
- 工具:Vitest + supertest + ws + crypto
- 覆盖:HTTP 健康检查 / WebSocket 鉴权 / 配对码 / 转发 / 限流

```bash
cd relay && pnpm test
```

---

## 五、CI 集成

CI 工作流定义在 `.github/workflows/ci.yml`,4 个 job 并行:

| Job | 内容 |
|---|---|
| `desktop` | lint + typecheck + unit + build |
| `e2e` | Playwright(chromium) |
| `backend` | ruff + mypy + pytest |
| `relay` | typecheck + test + build |

PR 必须全绿才能合并。
