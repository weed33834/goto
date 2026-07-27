# Goto 开发者指南

> **最后更新**:2026-07-20
>
> 本文档面向当前 Goto **纯浏览器 Web 应用** 架构(仓库 `desktop/`:Vite + React 18 +
> Zustand 4 + TypeScript 5,数据存 IndexedDB,密钥经 Web Crypto / argon2id 派生)。

---

## 一、开发流程规范

### 1.1 每次开发前必做:检查远程仓库状态

**这是强制要求**,每次开始开发工作前,必须执行以下检查:

```bash
# 1. 同步本地仓库
git fetch --all
git pull origin main

# 2. 检查 open PR(是否有待合并的 PR)
# 通过 GitCode 网页查看

# 3. 检查 open Issues(是否有需要处理的 issue)

# 4. 检查是否有陈旧分支需要清理
git branch -a  # 本地分支
# 远程分支通过 GitCode 网页查看

# 5. 检查 main 分支 CI 是否全绿
# 所有 status checks 必须为 success
```

### 1.2 检查清单

| 检查项 | 要求 | 说明 |
|--------|------|------|
| Open PRs | 无阻塞 PR | PR 评估后合并或关闭 |
| Open Issues | 无未处理 P0/P1 | 重要 issue 需优先处理 |
| 陈旧分支 | 已合并的分支及时删除 | 避免分支堆积 |
| CI 状态 | main 分支全绿 | 所有 status checks 为 success |
| 依赖更新 | 由维护者手动管理 | 定期评估依赖、手动更新并提交 PR |

### 1.3 开发后必做:验证与同步

每次完成开发任务后:

1. **本地验证**:typecheck + lint + unit + e2e 全部通过
2. **提交**:使用清晰的 commit message
3. **推送**:同步到 GitCode 仓库
4. **CI 验证**:等待 CI 全绿后确认
5. **ROADMAP 更新**:勾选已完成的 checkbox

---

## 二、项目结构

```
goto/
├── desktop/                # 纯浏览器 Web 应用(Vite + React 18 + Zustand 4)
│   ├── src/
│   │   ├── renderer/       # React UI
│   │   │   ├── components/ # 通用组件 + 业务组件
│   │   │   │   ├── common/         # Button / Input / Switch / Modal / Toaster / EmptyState / KeyboardShortcutsHelp
│   │   │   │   ├── layout/         # Sidebar / MobileHeader / LockScreen
│   │   │   │   ├── mosaic/         # MosaicView(时间织锦)
│   │   │   │   ├── sync/           # SyncSettingsPanel / PairingDialog / DeviceList
│   │   │   │   ├── task/           # TaskCard / TaskEditor / TaskList
│   │   │   │   └── vault/          # VaultCard / VaultEditor / VaultList
│   │   │   ├── features/   # onboarding / share
│   │   │   ├── hooks/      # useAutoLock / useMediaQuery / usePrivacyMode / useSyncRuntime / useSyncScheduler
│   │   │   ├── lib/        # webAPI.ts(本地 IndexedDB 实现)+ indexeddb + motion + backupCrypto.worker
│   │   │   ├── pages/      # TodayPage / CalendarPage / ProjectsPage / CategoriesPage / TagsPage / SearchPage / VaultPage / SettingsPage / MosaicPage
│   │   │   └── store/      # authStore / themeStore / taskStore / vaultStore / syncStore / securitySettingsStore
│   │   └── shared/
│   │       ├── api/        # 后端 REST client(可选)
│   │       ├── store/      # Zustand store,状态在 slices/(tasks/vault/projects/categories/tags/sync/persistence/preferences/search/ui)
│   │       ├── sync/       # E2EE 同步栈(Web Crypto,对接 relay)
│   │       ├── hooks/      # useBulkSelection / useKeyboardShortcuts / useResponsiveLayout / useSyncRuntime / useUndo
│   │       ├── plugins/    # 插件注册表 + 内置插件
│   │       ├── mosaic/     # deriveMosaic / types
│   │       └── utils/      # secureStorage / browserStorage / markdownHelper / naturalLanguageParser / dateUtils
│   ├── e2e/                # Playwright 端到端测试(15 个 spec,108 用例)
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   ├── tsconfig.*.json
│   ├── tailwind.config.js
│   └── eslint.config.js
├── backend/                # 可选后端(Python + FastAPI + PyGit2)
│   └── app/
│       ├── api/            # API 路由(tasks)
│       ├── core/           # security / exceptions
│       ├── models/         # 数据模型(task)
│       ├── schemas/        # Pydantic schemas
│       └── utils/          # logger / validator / crud
├── relay/                  # 自托管中继(Node.js + WebSocket)
│   ├── src/
│   │   ├── auth.ts         # 配对码 + 鉴权
│   │   ├── connectionManager.ts
│   │   ├── identity.ts
│   │   ├── routes.ts
│   │   ├── server.ts
│   │   ├── store.ts
│   │   └── wsRelay.ts
│   ├── deploy/             # Docker + Nginx + ACME
│   └── Dockerfile / docker-compose.yml
├── docs/                   # 文档
│   ├── ROADMAP.md
│   ├── DEVELOPER_GUIDE.md  # 本文档
│   ├── TEST_PLAN.md
│   ├── relay-deployment.md
│   ├── fuzzing.md
├── .github/workflows/      # CI 工作流(ci.yml: desktop / e2e / backend / relay)
├── README.md / README.zh-CN.md
├── CHANGELOG.md
├── PRIVACY.md / SECURITY.md / TERMS.md / FAQ.md / SUPPORT.md
└── package.json            # 根 workspace
```

---

## 三、技术栈

| 子项目 | 技术栈 | 版本 |
|--------|--------|------|
| Web 应用 | Vite + React 18 + Zustand 4 + TypeScript 5 | Vite 6 / React 18 / TS 5 |
| 样式 | Tailwind CSS 3 + framer-motion + lucide-react | Tailwind 3 |
| 后端 | Python + FastAPI + PyGit2 | Python 3.11+ |
| Relay | Node.js + Express + WebSocket | Node 20+ |
| 测试(Web unit) | Vitest | 最新稳定版 |
| 测试(Web e2e) | Playwright | 最新稳定版 |
| 测试(后端) | pytest + Hypothesis | 最新稳定版 |
| 测试(Relay) | Vitest | 最新稳定版 |

---

## 四、常用命令

### Web 应用(desktop/)

```bash
cd desktop
pnpm install          # 首次安装(已锁 pnpm-lock.yaml)
pnpm dev              # 启动 Vite dev server(默认 5173)
pnpm typecheck        # TypeScript 类型检查(tsc --noEmit)
pnpm lint             # ESLint 检查
pnpm test             # Vitest 单元测试(550 passed / 26 skipped)
pnpm build            # 生产构建,产物在 dist/renderer/
```

### Web 应用 e2e(Playwright)

```bash
cd desktop
npx playwright install chromium         # 首次下载 chromium
npx playwright install-deps chromium    # Linux 装 libatk 等系统共享库
npx playwright test                     # 跑全部 15 个 spec / 108 用例
npx playwright test e2e/vault.spec.ts   # 跑单个 spec
```

国内网络可加 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright` 加速。

### 后端

```bash
cd backend
python -m mypy app           # mypy 类型检查(strict 模式)
python -m ruff check app     # ruff 代码检查
python -m pytest tests/ -v   # 运行测试
```

### Relay

```bash
cd relay
npx tsc --noEmit    # TypeScript 类型检查
npm test            # 运行测试
npm run build       # 构建
```

### 全量验证

```bash
# Web 应用(typecheck + lint + unit + e2e)
cd desktop && pnpm typecheck && pnpm lint && pnpm test && npx playwright test

# 后端
cd backend && python -m ruff check app && python -m mypy app && python -m pytest tests/ -q

# Relay
cd relay && npx tsc --noEmit && npm test
```

---

## 五、仓库同步策略

### 5.1 远程仓库

| 仓库 | URL | 用途 |
|------|-----|------|
| GitCode | `gitcode.com/badhope/goto` | 主仓库，PR + CI |

### 5.2 同步流程

1. 在本地完成开发
2. 推送到 GitCode：`git push gitcode main`
3. 在 GitHub 创建分支并推送：`git push github <branch>`
4. 创建 PR，等待 CI 全绿
5. 合并 PR（需要 1 个 approval + status checks 通过）
6. 拉取最新 main：`git pull github main`
7. 推送 main 到 GitCode：`git push gitcode main`

### 5.3 分支保护规则（GitHub main）

- 禁止 force push
- 禁止删除
- 需要 1 个 approving review
- 需要通过 status checks(desktop: lint/typecheck/unit/build | e2e | backend: ruff/mypy/pytest | relay: typecheck/test/build)
- 管理员也需要遵守规则

---

## 六、安全规范

### 6.1 密钥管理

- **永远不要**在代码中硬编码密钥、token、密码
- 使用环境变量或 `.env` 文件（已在 `.gitignore` 中排除）
- `.env.example` 只包含占位符
- 仓库根目录有 `.gitleaks.toml` 配置,可在本地运行 gitleaks 扫描

### 6.2 依赖安全

- 所有 GitHub Actions 使用 SHA pin（不用 tag）
- 依赖更新由维护者手动管理（无自动 PR 机器人）
- 定期运行 `npm audit` 和 `pip audit`

### 6.3 代码安全

- 后端使用 SQLAlchemy ORM（防 SQL 注入）
- 前端使用 secureStorage(IndexedDB + Web Crypto / argon2id)存储敏感数据
- 所有用户输入需验证和清洗

---

## 七、测试规范

### 7.1 测试要求

| 子项目 | 最低测试数 | 要求 |
|--------|-----------|------|
| 前端 | 170+ | 覆盖 store slices、utils、API、hooks |
| 后端 | 49+ | 覆盖 API、核心逻辑、fuzz |
| Relay | 8+ | 覆盖认证、连接、消息 |

### 7.2 测试文件命名

- 测试文件放在被测文件同级目录
- 命名为 `*.test.ts` 或 `*.test.tsx`
- 集成测试放在 `tests/integration/` 目录
- 单元测试放在 `tests/unit/` 目录

### 7.3 CI 必须全绿

- 所有 status checks 必须为 success
- 不允许合并不全绿的 PR
- 如果 CI 因基础设施问题失败（非代码问题），可重试
