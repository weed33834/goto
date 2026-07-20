> **架构迁移说明**：TaskFlow 已从 Electron + 移动端（React Native / Expo）架构迁移为**纯浏览器 Web 应用**（仓库 `desktop/`：Vite + React 18 + Zustand 4 + TypeScript 5，数据存于 IndexedDB，密钥经 Web Crypto / PBKDF2 派生）。下方与移动端 / Electron / SQLCipher 相关的历史条目保留作记录，不再反映当前代码状态。当前架构请参阅 [README.md](./README.md) / [ARCHITECTURE.md](./ARCHITECTURE.md)。

# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Phase A 体验审计闭环(P0/P1/P2 共 25 项)

> 本轮基于一份三轮尖锐批评的体验审计报告(P0 致命问题 6 项 / P1 体验缺口 12 项 / P2 工程缺陷 7 项)逐项修复,
> 并完成完整 verify(typecheck + build + 494 unit + 108 e2e 全绿)。审计报告列出的 25 项缺口已全部闭环。

### Added — 用户面向的新能力

- **P1-1 键盘快捷键帮助浮层**(`desktop/src/renderer/components/common/KeyboardShortcutsHelp.tsx`):
  应用内任意位置按 `?` 弹出浮层,展示当前注册的全部快捷键,按 全局 / 导航 / 编辑 三组分类,
  Esc 或点击背景关闭;移动端全屏、桌面端居中。设置页"快捷键"分区新增"查看所有快捷键"按钮入口。
- **P1-10 修改主密码功能**(`desktop/src/renderer/pages/SettingsPage.tsx` +
  `desktop/src/renderer/lib/webAPI.ts` 的 `auth.changePassword`):
  设置页"安全"分区新增 inline 修改密码表单 — 验证旧密码 → 生成新 verifier → 覆盖持久化 + 清空
  derivedKeyCache。校验:新密码 ≥8 位 + 不与旧密码相同 + 两次输入一致。失败计数不累计(避免改密
  触发 30 秒 cooldown)。提醒用户:此前生成的加密备份仍需用旧密码恢复。
- **P1-12 危险区 + 清空数据 / 恢复出厂设置**(`SettingsPage.tsx` + `webAPI.ts` 的 `auth.factoryReset`):
  设置页底部新增红色边框"危险区"分区:
  - 清空所有任务和保险库数据:删除任务 / 保险库 / 项目 / 自定义分类与标签 / 搜索历史 / 同步设备身份,
    保留主密码与已生成备份文件。
  - 恢复出厂设置:在清空数据基础上额外删除主密码 + 安全设置,1 秒后自动 reload 回到首次安装状态。
    已生成的加密备份文件不受影响,仍可用旧密码恢复。
- **P1-3 字体大小设置**(`SettingsPage.tsx` + `App.tsx` + `index.css`):
  外观分区新增 select(小 / 中 / 大),通过 `document.documentElement[data-font-size]` 同步到 root,
  index.css 用 `:root[data-font-size='small|medium|large']` 选择器把 root font-size 设为 14/16/18px,
  等比例缩放所有 rem-based Tailwind 工具类。适合高分屏放大或小屏紧凑。
- **P1-3 自动锁定时长升级**:从原 Switch(固定 5 分钟)升级为 select,支持 关闭 / 1 / 5(默认) / 15 / 30 / 60 分钟。
  设为"关闭"时仅手动锁定(顶部按钮或 Mod+L)。

### Fixed — 体验缺陷与工程问题

- **P0-3 删除后 toast 含实体名干扰断言**(影响 6 个 e2e spec):
  `pushNotification` 的 toast 渲染在 `main` 之外,删除任务 / 项目 / 分类 / 标签 / 保险库项后,
  toast 文案包含被删实体名,导致 `getByText('xxx').not.toBeVisible()` 误命中 toast。统一修复:
  用 `page.locator('main').getByText('xxx')` 限定断言范围。
- **P1-5 删除二次确认 dialog 阻塞测试**:categories / projects / tags 三页删除时弹 `window.confirm`,
  测试无 dialog handler 会阻塞 30 秒超时。加 `page.on('dialog', d => d.accept())` 自动接受。
- **P2-1 MosaicView 悬停高亮不重绘**(`desktop/src/renderer/components/mosaic/MosaicView.tsx`):
  砖就位后 rAF 停止,hover 状态变化时如果 `rafRef.current` 仍保留 stale id 则不会触发新 rAF,
  导致鼠标移入移出砖块时描边不更新。修复:`needRaf=false` 时主动 `rafRef.current = 0`,
  `handleMouseMove` / `handleMouseLeave` / `handleTouchStart` 检测到 `hoveredId` 变化且
  `!rafRef.current` 时主动 `requestAnimationFrame(() => { rafRef.current = 0; render(); })`。
- **P2-2 useAutoLock mousemove 高频调度**(`desktop/src/renderer/hooks/useAutoLock.ts`):
  原 mousemove 每次触发都 `resetTimer()`,1 秒内可能调度数十个 timer。重写:加 `MOUSEMOVE_THROTTLE_MS = 1000`
  节流,只在距上次 mousemove ≥1s 时才 `resetTimer()`,避免 timer 队列堆积。
- **CategoriesPage 类型错误**(`desktop/src/renderer/pages/CategoriesPage.tsx`):
  `category.taskCount` / `category.isSystem` 是 optional,直接传入 `handleDelete` 报类型错误。
  用 `?? 0` / `?? false` 兜底。
- **TagsPage 删除标签 e2e 定位错误**(`desktop/e2e/tags.spec.ts`):
  TagsPage × 按钮用 `aria-label="删除标签 {name}"` 而非 `title="删除标签"`,
  原测试 `getByTitle` 找不到元素,改用 `getByRole('button', { name: '删除标签 待删除标签X' })`。

### Changed — 配置与基础设施

- **CSP `connect-src` 放宽**:为支持开发环境 WebSocket 与多 relay 场景,
  `connect-src` 放宽为 `ws: wss: http: https: blob:`。
- **密码错误 cooldown**(`desktop/src/renderer/lib/webAPI.ts`):
  3 次错误密码后强制 30 秒 cooldown(对应 GOTO_PIVOT_PLAN §0.4.1 #8 承诺)。
  `failedAttempts` + `lockedUntil` 双字段记录状态。
- **剪贴板延迟清除**(`desktop/src/renderer/components/vault/VaultCard.tsx`):
  按 PRIVACY.md §6.2 承诺,复制保险库密码后延迟 `clipboardClearSeconds` 秒(默认 30)自动清除剪贴板。
  原实现是复制即清空,用户根本没机会粘贴。VaultCard 复制后按钮显示倒计时,模块级 timer 共享。
- **Playwright 镜像加速**:CI/开发环境用 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`
  加速 chromium 下载。

### 测试基线

- frontend unit:494 passed / 26 skipped(24 test files)
- frontend e2e:**108 passed / 0 failed**(15 spec 文件 — onboarding / lock-screen / app-navigation /
  keyboard-shortcuts / task-crud / projects / categories / tags / vault / search / settings /
  calendar / mosaic / data-port)
- relay:9 passed
- backend:104(集成测试,本轮未触及)
- 首屏 JS gzip ~103KB(远低于 §10.2 阈值 250KB)

## [Unreleased] — Phase 8 文档与安全跟踪

### Fixed (2026-07-07 安全审计闭环 + 代码质量)

- **TF-011**：`desktop/src/main/windowManager.ts` 新增 `isSafeDevServerUrl`，
  开发模式下仅允许 `localhost` / `127.0.0.1` / `0.0.0.0` / `::1`，拒绝远程 /
  内网 / 非法协议 URL，防止环境变量注入任意远程页面配合自动开启的 DevTools
  暴露主进程能力。新增 13 组单元测试覆盖回环 / 内网 / 远程 / 非法协议 / 畸形输入。
- **TF-015**：`backend/app/main.py` lifespan 启动时检测 `api_host`，非回环地址
  （非 `127.0.0.1` / `localhost` / `::1` / `0.0.0.0`）输出 WARNING 提示外网暴露
  风险及加固建议。
- **desktop ESLint 配置缺陷**：`desktop/eslint.config.js` 对齐根项目策略，对
  `browser-mock.ts` / 测试代码放宽 `no-explicit-any`（mock stub 需要 any 来
  stub Electron IPC API），业务代码仍维持 error，消除 20 个 lint error。
- **useSyncRuntime ref cleanup warning**：`src/shared/hooks/useSyncRuntime.ts`
  在 effect 内把 `enginesRef.current` 复制到局部变量，避免 cleanup 运行时清理到
  下一轮渲染的引擎，消除 react-hooks/exhaustive-deps 警告。

至此安全审计 36 项全部闭环：33 已修复 / 2 部分修复 / 1 已废弃 / 0 未修复。
测试基线更新至 912 项（前端 509 + 桌面端 290 + 后端 104 + relay 9）。

### Fixed (2026-07-05 安全与文档批量修复)

- **TF2-009**：`desktop/src/renderer/hooks/useAutoLock.ts` 新增 `clampMinutes()`，
  对传入的 `minutes` 参数做 `[0, 1440]` 范围夹紧，过滤 NaN / 负数 / 极大值，
  防止异常输入导致 `setTimeout` 行为异常。
- **TF2-010/TF2-011**：`backend/app/main.py` 收紧文档与调试模式开关——`enable_docs`
  仅在 `debug=True` 时被尊重，`FastAPI(debug=...)` 仅在显式 `DEBUG=true` 时开启，
  生产环境强制关闭，防止泄露 OpenAPI 文档与详细错误堆栈。
- **TF2-012**：`backend/app/utils/validator.py` `validate_git_url` 改用
  `socket.getaddrinfo` 取全部 A/AAAA 记录，任一解析到内网地址即拒绝，防御 DNS 重绑定
  SSRF。TF-019 因此由「部分修复」升级为「已修复」。
- **TF-016**：`backend/app/utils/logger.py` 引入 `RedactingFormatter` + `redact()`，
  日志输出前自动遮蔽 password / token / secret / api_key / authorization / Bearer
  等敏感字段。
- **TF-018/TF2-013**：CI workflow（`ci.yml`/`fuzz.yml`）安装依赖前先
  `pip install --upgrade pip>=26.1.2`，修复 PYSEC-2026-196 / CVE-2026-3219 /
  CVE-2026-6357；`requirements-build.txt` 已锁 `pip==26.1.2`。
- **TF2-014**：`.github/workflows/build-android.yml` 收窄工件上传范围，移除 `dist/`
  整目录上传，仅保留 `*-report.txt` 报告文件。
- **文档测试基线滞后**：`README.md` / `README.zh-CN.md` / `docs/index.html` 中
  的测试数由滞后的 668（移动端 339）统一更新为 838（移动端 509），与 ROADMAP 一致。

### Added

- **统一安全问题跟踪表**（`docs/security/SECURITY_TRACKER.md`）：合并 TF-001~019 与
  TF2-001~017 两轮独立审计的 36 项发现为单一真相表。列含编号 / 标题 / 严重级别 / 状态 /
  修复位置 / 关联编号 / 来源报告。状态取值固定为「已修复 / 部分修复 / 已废弃 / 未修复 /
  已知限制」。状态判定以 TF2 报告的「已修复的上期问题」回填表为优先来源（覆盖 9 个 TF
  编号），review-report 补充 13 项，ROADMAP Phase 1 跟踪 9 项 TF2，其余按报告正文证据
  判定。SECURITY.md 新增「Audit Findings Tracker」小节链接到本表。
- **OpenAPI/Swagger 自动生成**（`backend/scripts/export_openapi.py` +
  `backend/docs/openapi.json`）：FastAPI app 补全 description / openapi_tags /
  contact / license_info 元数据；36 个端点全部补 `summary`（中文，动词开头）与
  `responses`（401/404/422/204 按场景）；13 个缺 `response_model` 的端点补模型
  （`GitOperationResponse` / `PluginOperationResponse` / `RootResponse` /
  `HealthResponse`）或显式声明 `response_model=None` + 204。CI 新增「Export & validate
  OpenAPI spec」步骤：导出 openapi.json + openapi-spec-validator 校验，防 schema 漂移。
  产物 96741 字节，23 path / 36 operation。
- **桌面端用户手册**（`docs/desktop-user-guide.md`，442 行）：11 章 + 附录，覆盖安装
  （三平台 / 系统要求 / 首次主密码）、主密码与解锁（不可找回原因 / 自动锁定）、隐私外壳
  （启动锁 / 自动锁定 / 隐私模式 Esc / 剪贴板清空 / 截图保护 / 全局快捷键）、加密保险库
  （AES-256-GCM / 密码生成器）、生物识别（Touch ID / Windows Hello / fprintd 三平台
  矩阵）、E2EE 同步（配对 host/join / 设备吊销 / LAN vs Relay / 冲突解决 / 故障排查）、
  备份与恢复（V2 加密 / JSON 明文）、设置项详解（8 行表格）、常见问题（含 FAQ.md
  「无法同步」认知纠正）、安全最佳实践。所有事实与源码核对一致。

### Changed

- **后端 DELETE 端点行为统一**：`DELETE /api/v1/files/{file_id}` 原返回 200 + JSON
  body，改为 204 + 空响应，与 tasks 模块的 4 个 DELETE 一致。集成测试仅覆盖 404 场景，
  70 项测试全通过。

## [Unreleased] — Phase 8 同步质量收口

### Added

- **移动端同步 UI 组件测试基础设施**（`src/test-utils/rn-queries.ts`）：基于
  `react-test-renderer` 自建的轻量查询层，提供与 @testing-library/react-native 接口
  对齐的 API（`render` / `getByText` / `getByTestId` / `getByLabelText` / `getByProp` /
  `getByType` / `allHostNodes` / `fireEvent` / `fireEventHelpers` / `rerender` / `unmount`）。
  不直接用 @testing-library/react-native 的根因：其内部 CJS `require('react-native')`
  走 Node 原生 resolver 而非 vitest transform 管线，`vi.mock('react-native')` 无法拦截，
  会加载真实 RN 包，其 `index.js` 第 27 行的 Flow 专有语法
  `import typeof * as ... from './index.js.flow'` 触发 `SyntaxError: Unexpected token
  'typeof'`，esbuild / rolldown 均无法解析。`react-test-renderer` 不依赖 react-native
  （纯 React），在 node 环境下可用；查询层在其 TestInstance 树上做深度优先遍历按谓词
  匹配，`fireEvent` 通过 `act()` 包裹调用节点 props 上的回调。
- **PairingDialog 组件测试**（`src/shared/components/sync/PairingDialog.test.tsx`，14 项）：
  覆盖 none 模式 null 渲染、host 模式（无码生成按钮 / 大字码 + 倒计时展示 / 倒计时归零
  自动 onClose / inFlight 等待提示）、join 模式（8 格输入框渲染 / 输入数字自动跳格 /
  满 8 位自动 onClaim / 7 位不触发 / 非数字字符过滤 / 空格退格跳回上一格 / error 展示 /
  inFlight 按钮禁用 / 手动点击按钮提交）。倒计时用 `vi.useFakeTimers` 推进，
  useEffect 的 setTimeout 自动聚焦也由 fake timers 隔离避免失控状态更新。
- **DeviceList 组件测试**（`src/shared/components/sync/DeviceList.test.tsx`，17 项）：
  覆盖空态提示文案、单设备渲染（名称 / fallback 名称 / 设备 ID / 配对时间 + 最近在线
  时间）、多设备渲染、在线徽章（active + success → 「在线」/ active + syncing →
  「同步中」/ 非 active 无徽章）、移除按钮（label / 回调带 deviceId / 多设备独立触发）、
  错误展示（active 时显示 / 非 active 隐藏）、`formatLastSeen` 边界（null → 「未知」 /
  最近 → 「刚刚」）。
- **SyncSettingsPanel 组件测试**（`src/shared/components/sync/SyncSettingsPanel.test.tsx`，
  26 项）：mock `useSyncRuntime` 返回可控 stub + mock Card/Button/ConfirmModal/
  PairingDialog/DeviceList 为简单 stub 透传关键 props。覆盖 5 节标题文案渲染（设备身份 /
  中继服务器 / 设备配对 / 同步状态 / 已配对设备）、设备身份（identityLoading 加载提示 /
  加载完成显示设备名 + ID + SMK 状态 / bootstrapError 展示）、中继服务器 relayUrl 草稿
  回显、配对按钮（添加 / 加入 / inFlight 禁用）、同步状态机（idle/connecting/syncing/
  success/error 文案与颜色 + 仅 e2ee-p2p 协议下显示）、已配对设备（数量标题 + 有设备时
  显示「重置」链接 + 重置确认对话框 + 移除设备确认对话框）。

### Changed

- **ESLint 配置放宽测试代码的 `no-explicit-any`**（`eslint.config.js`）：业务代码仍维持
  `error`，但 `**/*.test.{ts,tsx}` / `vitest.setup.ts` / `src/test-utils/**` 放宽为 `off`。
  vi.mock 工厂内的 stub 组件无法精确推导被 mock 组件的 props 类型（那需要导入真实组件
  的 Props 类型，与 mock 的目的相悖），显式 `any` 是最诚实的写法——比 `unknown` + 多处
  类型断言更简洁，且测试代码的类型安全由被测组件自身的类型定义保证。
- **`vitest.setup.ts` 的 react-native mock 工厂补充 TS 注解**：factory 体内的 `props` /
  `ref` 参数显式标注 `any`。注释说明：factory 体在 esbuild 转换 .tsx 时按 JS 处理，
  不能有 TS 类型断言（如 `as typeof import('react')` 会触发 `SyntaxError: Unexpected
  token 'typeof'`），但参数注解是合法 TS 语法会被正常 strip。

### Tests

- 前端测试由 304 增至 361（+57）：PairingDialog 14 项 / DeviceList 17 项 /
  SyncSettingsPanel 26 项。三项均基于自建 `rn-queries.ts` 查询层，不依赖
  @testing-library/react-native。`vitest.setup.ts` 新增 `IS_REACT_ACT_ENVIRONMENT = true`
  全局标志（react-test-renderer 在 React 19 下需要此标志才不会刷 act() 警告），TextInput
  mock 通过 `useImperativeHandle` 暴露 `focus` / `blur` / `clear` / `isFocused` /
  `setNativeProps`（PairingDialog 的 8 格分拆输入框用 `inputRefs.current[i].focus()`
  自动跳格，mock 必须暴露这些命令式方法）。
- TypeScript typecheck 通过（tsc --noEmit）；ESLint 全通过（0 errors）。
- 跨平台连贯性验证：3 套组件测试覆盖 Phase 6b 的全部 UI 组件（PairingDialog /
  DeviceList / SyncSettingsPanel），与 Phase 6a/6b 的 304 项逻辑测试（store slices /
  hooks / 同步加密栈 / 配对服务）合计 361 项全通过，移动端同步子系统的 UI 层与逻辑层
  均有测试覆盖。

### Docs

- **同步设计规格 7 处实现偏差回写**：
  - `docs/superpowers/specs/2026-06-21-taskflow-2.0-sync-design.md` 新增「实现偏差回写
    （Phase 8）」章节，记录 5 处偏差：(1) SMK_TRANSFER 消息类型——设计未列，实现新增
    用于 responder 在握手 ready 后立即把本机 SMK 加密发给 initiator；(2) 方向性会话密钥
    ——设计写 sendKey/recvKey，实现按「我发我用 sendKey / 我收我用 recvKey」的方向语义
    派生，两端对称；(3) HKDF salt 构造——设计写「双方 ECDH 公钥」，实现为双方 deviceId +
    双方握手 nonce 排序 + sha256（deviceId 绑定身份防 MITM，nonce 引入熵防重放）；
    (5) 移动端 `?token=` 认证 + 活动检测——设计写 headers + ping/pong，实现因 RN 内置
    WebSocket headers 支持非标准 + 不暴露 ping/pong，改走 query param 认证 + 90s 活动超时；
    (7) `sync_records.id` 格式 + 版本向量——设计写 UUID，实现为 `<deviceId>-<recordHash>`
    天然去重 + 版本向量字段从 `vector` 改名 `vv` 缩减帧体积。
  - `docs/superpowers/specs/2026-06-21-taskflow-2.0-sync-phase4a-pairing-settings-design.md`
    新增「实现偏差回写（Phase 8）」章节，记录 2 处偏差：(4) 早期重放保护——设计写握手
    ready 后启序列号，实现在 HELLO 阶段即开始（握手帧也走序列号 + 滑窗）；(6) SMK 一致性
    检查——设计未列，实现新增 initiator 收到 SMK 后恒定时间比对，不一致拒绝配对（防
    后续同步全部解密失败）。

## [Unreleased] — Phase 6b 移动端同步传输与配对

### Added

- **移动端 relay WebSocket 长连接 transport**（`src/shared/sync/relayTransport.ts`）：
  把桌面端 `RelayTransport` 端口到 RN。`WebSocketFactory` 注入式——生产环境用 RN 内置
  WebSocket，测试环境注入 Node `ws` 或 loopback mock。RN 内置 WebSocket 的 headers 支持
  因平台而异且非标准，认证改走 `?token=<token>` query param（relay 服务端同步扩展，
  与 `Authorization: Bearer` header 路径并存向后兼容）。心跳改用「活动检测」——relay
  服务端每 30s 发 TCP ping（RN 自动回 pong），transport 监听任何 message 更新最后活动
  时间，90s（3 倍 ping 间隔）无活动判半开连接，`terminate + 重连`。重连指数退避
  1s→30s 上限 + ±10% jitter（移动网络更不稳定，jitter 防雪崩）。握手 ready 后按
  `trim → peek → 逐帧 send → clear(已发 id)` 补发离线 outbox，clear 按 id 精确删除
  避免误删补发过程中新入队帧。
- **移动端 SyncSession 握手状态机**（`src/shared/sync/syncSession.ts`）：HELLO→OFFER→ANSWER
  三步握手（X25519 ECDH + Ed25519 签名防 MITM），6 状态有限机
  （idle→hello_sent→hello_received→offered→ready→closed，非法转换直接抛错）。8 字节 BE 序列号 + 滑动窗口（默认 64）防重放。全异步 + 回调式——
  Web Crypto 的 ECDH / AES-GCM / Ed25519 都是 async，桌面端 Node crypto 是同步；
  回调式替代 EventEmitter 避免 RN 引入 `events` 依赖。`feedRawFrame` 内部 promise chain
  串行化，保证 WS message 串行到达但解密/验签异步的状态机不会因并发转换错乱。
- **移动端 SyncEngine 记录交换编排**（`src/shared/sync/syncEngine.ts`）：与桌面端协议
  一致——session 'ready' → sendManifest → 收到 MANIFEST 做 diff → REQUEST（缺失 id，
  按 500 分块）→ BATCH（按 500 分块，每条 pendingAcks）→ ACK → 清 pendingAcks。
  四条件完成判定（localManifestSent && remoteManifestReceived && pendingRequests==0
  && pendingAcks==0）。onMessage 内部 promise chain 串行化保证异步状态下
  pendingRequests / pendingAcks 内存一致性。
- **移动端配对流程编排**（`src/shared/sync/pairingService.ts`）：三入口
  `generatePairingCode` / `respondToPairing` / `claimPairingCodeAndPair`。responder
  握手 ready 后立即用会话 sendKey 加密本机 SMK 发出 SMK_TRANSFER；initiator 收到后
  解密落盘并恒定时间比对（防 SMK 不一致静默继续，导致后续同步全部解密失败）。
  relay bearer token 通过 `AsyncTokenStorage` 异步存储（默认 secureStorage，可注入
  内存 mock）。`relayHttpUrlToWsUrl` 手写正则解析避免依赖 RN URL polyfill，且保留
  query string 和 hash（与桌面端 `new URL().toString()` 行为一致）。
- **移动端 relay HTTP 客户端**（`src/shared/sync/relayClient.ts` + `relayAuth.ts`）：
  四端点 `POST /register-device` / `/pairing-codes` / `/claim-pairing-code` /
  `/refresh-token`，用 fetch（RN 内置）替代桌面端 fetch（Node 18+ 内置）。签名走
  Ed25519（`syncIdentity.signMessage`），与桌面端 Node crypto.sign 字节一致。
  `buildAuthMessage` 三段 `deviceId:timestamp:purpose`，purpose 内含 code 时整体作为
  第三段（relay 服务端只取前两段拆分，purpose 内 `:` 不影响解析），绑定请求语义防
  跨端点重放。
- **移动端 SMK 持久化与 SyncStore 抽象**（`src/shared/sync/syncStorage.ts`）：
  `loadSyncMasterKey` / `saveSyncMasterKey` / `deleteSyncMasterKey` 走 secureStorage
  （Keychain/Keystore，base64 编码）。`SyncStore` 接口异步化（移动端加密用 Web Crypto），
  内存实现 `createMemorySyncStore` 用于测试与初始运行时。`createTrustedKeyLookup` 从
  `pairedDevices` 派生 `getTrustedPublicKey`，供 SyncSession 非配对握手校验。
- **移动端离线发件箱**（`src/shared/sync/outboxQueue.ts`）：与桌面端容量约束对齐——
  TTL 7 天 / 单对端最大 10000 帧 / 单对端最大 64 MB。内存 Map 默认实现（进程退出即丢失），
  可注入基于 AsyncStorage 的持久化实现（outbox 内容是加密帧 mode=1，密文落盘安全）。
  补发流程握手 ready 后 `flushOutbox → trim → peek → 逐帧 send → clear(已发 id)`。
- **移动端 SHA-256 工具**（`src/shared/sync/hashUtils.ts`）：基于 Web Crypto subtle.digest，
  与桌面端 Node `createHash('sha256')` 字节一致。用于 manifest record hash 计算
  （`sha256(base64(encryptedPayload))`）和 batch 落库时的 hash 校验。
- **移动端 E2EE 同步设置面板**（`src/shared/components/sync/SyncSettingsPanel.tsx` +
  `DeviceList.tsx` + `PairingDialog.tsx` + `index.ts`）：5 节面板（身份指纹 / relay URL /
  配对 / 状态机 / 设备列表 + 重置）。配对对话框双模式：host 展示 8 位码 + 倒计时，
  join 输入 8 位码。8 格分拆输入框自动跳格 + 满 8 位自动提交（移动端友好）。
  与桌面端视觉对齐但用 RN 组件 + 主题 token（Card 阴影、MaterialIcons、主题色）。
  不通过 IPC 调 main process，所有逻辑在 RN 进程内完成。
- **移动端同步运行时编排 hook**（`src/shared/hooks/useSyncRuntime.ts`）：把 slice 的纯状态
  与 pairingService 的副作用粘合。`startResponderPairing` / `startInitiatorPairing`
  调 pairingService → 结果回写 slice。取消语义通过包装 `createWebSocket` 工厂捕获最新
  WS 引用，cancel 时主动 `close()`——transport 监听 onClose 触发 finish() destroy
  session/outbox，最终 Promise reject。这种「切断信号源」方式比 abortSignal 改动更小，
  且不破坏 pairingService 接口。身份/SMK 懒加载 + in-flight 去重防重复生成。
- **syncSlice 扩展 E2EE 配对状态**（`src/shared/store/slices/syncSlice.ts`）：新增
  `PairingState`（active/role/code/codeExpiresAt/error）与 `E2EESyncState`
  （status/error/lastSyncAt/activePeerDeviceId）两个可序列化子状态。新增方法
  `startPairing` / `cancelPairing` / `addPairedDevice` / `removePairedDevice` /
  `ensureSyncMasterKey` / `setRelayUrl` / `resetE2EESync` 仅操作 state，不直接调
  pairingService（保持 slice 可在纯 Node 测试）。`performSync` 行为零变更，HTTP REST
  同步与既有 170 测试全通过。`ensureSyncMasterKey` in-flight 缓存防多设备配对并发
  重复生成 SMK 覆盖已有密钥。

### Changed

- **relay 服务端双认证路径**（`relay/src/wsRelay.ts`）：WebSocket 连接认证从仅接受
  `Authorization: Bearer` header 扩展为同时接受 `?token=` query param。query param 路径
  为 RN 内置 WebSocket 提供跨平台一致的认证方式（headers 支持因平台而异且非标准）；
  header 路径保留，桌面端 Node `ws` 继续使用，向后兼容。两路径都走相同的
  `store.validateToken` 校验。
- **`syncMessages.ts` 类型收紧**：`serializeMessage` 返回类型与 `ParsedFrame.payload`
  从 `Uint8Array` 收紧为 `Bytes`（`Uint8Array<ArrayBuffer>`）。TS 5.7 起 lib.dom 把
  Web Crypto 的 BufferSource 收紧为 `ArrayBufferView<ArrayBuffer>`，裸 `Uint8Array`
  默认带 `ArrayBufferLike`（含 SharedArrayBuffer），导致 `relayTransport.ts:189` 和
  `syncSession.ts:291` 两处把帧 payload 喂给 Web Crypto 时类型不兼容。收紧源头类型后
  沿调用链自动传播窄类型，无需逐处断言。

### Tests

- 前端测试由 282 增至 304（+22）：pairingService 17 项（loopback WebSocket 工厂端到端
  集成：responder↔initiator 握手 + SMK_TRANSFER 全链路 / SMK 不一致拒绝配对 / 配对码
  过期与复用 / token 刷新 / relay URL 转换保留 query/hash），syncMessages 增量类型守卫
  与边界用例。测试基础设施关键点：MockWebSocket.close 同步 flush 队列里未派发消息再
  延迟 8 拍 macrotask 触发 onclose，给对端异步 Web Crypto 解密链留足时间；测试用真实
  Ed25519 身份（`generateDeviceIdentity`）而非 mock PEM 字符串，因 Web Crypto importKey
  对 PKCS8 DER 严格校验，mock PEM 会触发 `ERR_OSSL_ASN1_HEADER_TOO_LONG`。
- TypeScript typecheck 通过（tsc --noEmit）；ESLint 全通过。
- 跨平台连贯性验证：移动端 `RelayTransport` + `SyncSession` + `SyncEngine` +
  `pairingService` 与桌面端协议字节完全一致（relay HTTP 签名消息、HELLO/OFFER/ANSWER
  握手帧、SMK_TRANSFER 加密、MANIFEST/REQUEST/BATCH/ACK 数据交换），relay 服务端双
  认证路径让移动端可与桌面端连同一自托管 relay 同步。Phase 6a 互操作脚本
  （`.interop-check.js`）已验证两端加密栈字节一致，6b 接入传输层后端到端链路打通。

## [Unreleased] — Phase 6a 移动端同步核心层

### Added

- **移动端字节工具层**（`src/shared/sync/bytes.ts`）：React Native 没有 Node Buffer，
  同步子系统的所有二进制操作统一基于 Uint8Array。集中提供 UTF-8 编解码、base64
  编解码、hex 编解码、PEM↔DER 转换、字节拼接、恒定时间比较。base64 实现直接操作
  字节，不依赖 RN 的 btoa/atob（后者对多字节 UTF-8 不友好），输出与 Node 的
  `Buffer.toString('base64')` 完全相同。PEM 按 64 字符换行，与 Node
  `keyObject.export({ format: 'pem' })` 一致。
- **`Bytes` 类型别名**（`src/shared/sync/bytes.ts`）：`type Bytes = Uint8Array<ArrayBuffer>`。
  TS 5.7 起 lib.dom 把 Web Crypto 的 BufferSource 收紧为 `ArrayBufferView<ArrayBuffer>`，
  而裸 `Uint8Array` 默认带 `ArrayBufferLike`（含 SharedArrayBuffer），导致 16 处
  「Uint8Array 不能赋给 BufferSource」类型报错。同步子系统从不使用 SharedArrayBuffer，
  所有字节都基于真实 ArrayBuffer，因此统一用 `Bytes` 标注返回值与密钥/密文参数，
  既匹配运行时事实，又能直接喂给 Web Crypto 而无需逐处断言。
- **移动端同步加密层**（`src/shared/sync/syncCrypto.ts`）：基于 Web Crypto API 实现，
  与桌面端 Node crypto 二进制兼容。协议栈完全对齐：
  - 对称加密 AES-256-GCM（IV 12B / authTag 16B）
  - 密钥协商 X25519 ECDH
  - 密钥派生 HKDF-SHA256（info='taskflow-sync-v1'）
  - 会话密钥 sendKey/receiveKey 按角色方向派生
  关键适配点：Web Crypto 的 `encrypt` 输出为 `ciphertext+authTag`（authTag 拼尾部），
  桌面端线格式为 `iv+authTag+ciphertext`。移动端在加密后/解密前做一次 authTag 位置
  重排，保证线上字节完全一致。X25519 公钥 `importKey` 的 keyUsages 必须为空数组
  （Web Crypto 对 X25519 公钥的限制），ECDH 操作在私钥侧用 deriveBits。
- **移动端设备身份**（`src/shared/sync/syncIdentity.ts`）：Ed25519 密钥对生成 / 加载 /
  删除 / 指纹计算。指纹 = sha256(raw SPKI 公钥字节) 前 16 hex，与桌面端算法字节一致。
  私钥经 expo-secure-store 持久化（iOS Keychain / Android Keystore），无明文回退。
  `buildSignedData` 用 4 字节 BE 长度前缀拼接 deviceId/peerDeviceId/nonce/peerNonce/
  ecdhPublicKeyPem，供握手签名验签。
- **移动端同步消息层**（`src/shared/sync/syncMessages.ts`）：9 种消息类型
  （HELLO/OFFER/ANSWER/MANIFEST/REQUEST/BATCH/ACK/ERROR/SMK_TRANSFER）+ 逐字段类型守卫
  + JSON+UTF-8 序列化（与桌面端字节一致）+ 帧协议（mode[1]+length[4 BE]+payload）。
  `FrameParser` 改用回调式（非 EventEmitter），避免在 RN 环境引入 events 依赖；
  增量喂入任意分片字节流，按 mode+length 边界切分完整帧，超限帧报错并清空缓冲。
- **移动端冲突解决器**（`src/shared/sync/conflictResolver.ts`）：版本向量因果偏序判定，
  逻辑与桌面端字节一致。判定顺序：先比 updatedAt（last-write-wins），仅当时间戳相等
  时才用版本向量做因果偏序判定——版本向量细化「同一毫秒并发写入」这一 LWW 无法区分的
  场景，而非取代时间戳。返回 'local'/'remote'/'concurrent'，concurrent 按 strategy 映射。
- **syncSlice 接入同步核心层**（`src/shared/store/slices/syncSlice.ts`）：
  - `ensureDeviceIdentity(name?)`：优先复用已加载 deviceId，其次从 secure-store 加载，
    不存在则生成新 Ed25519 身份；持久化恢复路径补回 `currentDeviceId`，避免后续读取
    一直命中 null 分支。
  - `resolveTaskConflict`：当 local/remote 都携带 deviceVersion 时委托 conflictResolver，
    任一侧缺失则退化为纯 updatedAt LWW，保证既有行为不变。
  - `syncProtocol` 字段区分 'http-rest'（当前）与 'e2ee-p2p'（6b 启用）。
- **expo-secure-store 集成**（`src/shared/utils/secureStorage.ts` + `package.json`）：
  设备私钥等敏感数据走 iOS Keychain / Android Keystore，`taskflow_` 前缀命名空间。
  vitest.setup.ts 注入内存 mock（`secureMemoryStorage` Map），每个 beforeEach 清空，
  保证测试隔离。
- **跨平台互操作验证脚本**（`.interop-check.js`）：手动运行的 Node 脚本，验证 Web Crypto
  ↔ Node crypto 全协议栈字节一致——Ed25519 签名/验签双向、X25519 ECDH 共享密钥、
  AES-256-GCM 加解密双向、SPKI/PKCS8 DER 字节一致。

### Fixed

- **`base64ToBytes` padding 处理 bug**（`src/shared/sync/bytes.ts`）：原实现先用正则
  `[^\A-Za-z0-9+/]` 剥除所有非 base64 字符（含 `=` padding），再从已剥除的字符串判断
  padding——`=` 已被替换掉，padding 永远算成 0；同时循环条件 `si+3 < len` 跳过末尾残组。
  这导致 44 字节 Ed25519 SPKI 解码成 42 字节，破坏所有 PEM 导入的密钥，引发 Ed25519
  验签失败、ECDH 共享密钥不一致、指纹错配。重写为按「完整组 + 残组」直接累加输出长度，
  不依赖 padding 计算长度，与 Node `Buffer.from(str,'base64')` 行为一致。
- **`ensureDeviceIdentity` 持久化恢复 bug**（`src/shared/store/slices/syncSlice.ts`）：
  当 `syncConfig.deviceId` 已落盘但内存 `currentDeviceId` 为 null 时，原实现走早返回
  路径直接 `return existing`，未回填 `currentDeviceId`，导致后续读取一直命中 null 分支。
  修复后在早返回路径补上 `set({ currentDeviceId: existing })`。

### Changed

- **`eslint.config.js`**：把 `.interop-check.js`（CommonJS 互操作脚本）纳入 test/tooling
  files 块，允许 `require()`；删除脚本中未使用的 `wcXPriv` / `xNodePrivDer` 变量。
- **`src/shared/types/index.ts`**：新增 `SyncProtocol`、`deviceVersion`、`PairedDevice`
  类型，扩展 `SyncConfig`（deviceId/relayUrl/pairedDevices/syncProtocol）。
- **`src/shared/sync/syncCrypto.ts` / `syncIdentity.ts`**：所有参数和返回类型从
  `Uint8Array` 窄化为 `Bytes`，匹配 Web Crypto 的 BufferSource 严格类型。

### Tests

- 前端测试由 170 增至 282（+112）：bytes（base64/hex/PEM/UTF-8 round-trip + 边界）、
  syncCrypto（SMK/AES-GCM/ECDH/HKDF/会话密钥 + Node crypto 互操作）、syncIdentity
  （Ed25519 生成/存储/签名/验签/指纹 + Node crypto 互操作）、syncMessages（9 种消息
  序列化 + 类型守卫 + 帧协议分片重组）、conflictResolver（版本向量因果偏序 + LWW 优先）、
  syncSlice（ensureDeviceIdentity 5 项 + 版本向量冲突解决 10 项）。
- TypeScript typecheck 通过（tsc --noEmit）；ESLint 全通过。
- 跨平台连贯性验证：移动端 Web Crypto 加密栈与桌面端 Node crypto 在 Ed25519 签名验签、
  X25519 ECDH 共享密钥、AES-256-GCM 加解密、HKDF 派生上字节完全一致，确认 6a 核心层
  可与桌面端同步协议互通（6b 接入传输层后即可端到端同步）。

## [Unreleased] — Phase 5 多设备并发同步

### Added

- **SyncPeerController 对端状态机**（`desktop/src/main/services/sync/syncPeerController.ts`）：
  把原先散落在 `SyncPeerManager` 里的状态判断收口为一个有限状态机
  （connecting → handshaking → syncing ↔ idle，error/closed 终态）。
  所有转换走 `transition()`，`ALLOWED_TRANSITIONS` 表校验合法性，非法转换直接抛错——
  开发期就能暴露逻辑漏洞，而不是让 peer 静默进入没人处理的中间态。`canSync()` 把
  广播门控条件显式化。Controller 不拥有 session/engine 生命周期（仍由 transport 创建
  并驱动），只管状态机 + 引用，避免破坏现有 onSession 回调流。
  `peerFromController` 适配层用 getter/setter 委托到 controller，旧调用点无需改动。
- **SyncScheduler 并发控制 + 优先级队列**（`desktop/src/main/services/sync/syncScheduler.ts`）：
  在原有 WiFi/电量门控之上叠加调度队列。优先级 `scheduled < broadcast < manual`，
  同优先级 FIFO；`maxConcurrency`（默认 2）限制并发同步 peer 数；`maxQueueAgeMs`
  （默认 60s）防饿死——超时任务强制分派（临时突破并发上限 1 个，长期平均仍受控）。
  队列按 deviceId 合并（用户连点 5 次"立即同步"只排队一次），且 **不刷新** 入队时间
  （保留首次入队时间戳，保证 FIFO 公平 + 饿死检测稳定）。新增 `schedulePeer(deviceId,
  priority)` 供 UI"同步这台设备"按钮调用，`getQueueStats()` / `snapshotQueue()` 供观测。
- **5000+ 任务同步吞吐基准**（`desktop/src/tests/integration/sync/syncThroughput.benchmark.test.ts`）：
  端到端验证 5000 条加密记录的 manifest → REQUEST → BATCH(500/批) → ACK 全流程，
  断言对端落库数量正确 + 总耗时 < 30s（软约束，仅防 O(n²) 退化）。用直连 SyncSession
  绕开 transport IO，纯测引擎协议开销。基准结果：5000 records / 649ms（7699 rec/s）。

### Changed

- **SyncEngine REQUEST 分块**（`desktop/src/main/services/sync/syncEngine.ts`）：
  修复了一个生产级 bug——当对端 manifest 报告的缺失记录超过 `MAX_REQUEST_IDS`（500）
  时，引擎原本一次性发出单条 REQUEST 会被对端判定 `REQUEST_TOO_LARGE` 拒绝，导致
  5000+ 任务场景同步卡死。现在按 `MAX_REQUEST_IDS` 分块发出，与 BATCH 的分块策略对称。
  `pendingRequests` 仍一次性记入全部缺失 id，分块只影响线上消息条数，不影响完成判定。
- **SyncEngine 事务化批量落库**（`desktop/src/main/services/sync/syncEngine.ts`）：
  `handleBatch` 原先逐条 `insertRecord` + `applyRecord`（每条 2 次 auto-commit INSERT），
  5000 条 = 10000 次 fsync，耗时 52s。现在先在内存里完成 hash 校验 + 冲突判定，收集
  `toApply` 后一次性 `store.applyBatch(records, smk)` 提交事务——10000 次写压缩到 1 次
  fsync，提速 80 倍（52s → 0.65s）。`SyncStore` 接口新增可选 `applyBatch`，DB 实现用
  `db.transaction()` 包装，内存 mock store 不实现则退化为逐条写（兼容现有单测）。
- **SyncPeerManager 握手转换**（`desktop/src/main/services/sync/syncPeerManager.ts`）：
  `bindPeerEvents` 新增监听 session `'ready'` 事件，握手完成时调用 `ctrl.markReady()`
  把 controller 从 connecting 推到 idle——这是 `broadcastLocalChange` 的 `canSync()`
  门控能放行的关键。`addPeer` 额外检查 `session.isReady()`：若 session 已握手完成
  （复用场景），直接以 idle 初始状态注册，避免错过 ready 事件导致 peer 永远卡在 connecting。
- `syncPeer.ts` 转为 re-export shim，`SyncPeer` / `PeerState` 类型单一来源指向
  `syncPeerController.ts`，消除两处定义漂移风险。

### Tests

- 桌面端测试由 227 增至 256（+29）：syncPeerController 状态机 18 项、syncScheduler
  并发/优先级/饿死保护 18 项（重写）、syncEngine REQUEST 分块 + 事务化批量 2 项、
  syncPeerManager 握手转换回归 1 项、syncThroughput 基准 1 项。syncPeerManager /
  syncPeerBroadcast / syncScheduler 测试同步迁移到读 controller 适配后的实时状态。
- TypeScript 主进程 / 渲染进程 typecheck 均通过；ESLint `src` 全通过。
- 集成测试连贯性验证：multiPeerSync（3 设备并发 + 版本向量冲突）、pairing（SMK
  传输）、lanSync（TCP 直连）、syncThroughput（5000 条基准）全通过，确认 Phase 5
  改动未破坏 Phase 3/4a/4b/4c 已有行为。

## [Unreleased] — Phase 4b/4c 调度与传输增强

### Added

- **SyncScheduler 门控**（`desktop/src/main/services/sync/syncScheduler.ts`）：
  新增 `NetworkPowerMonitor` 探针接口和 `wifiOnly` / `pauseOnBattery` 两个门控开关。
  周期性 `tick()` 在网络或电源条件不满足时跳过广播并发出 `skipped` 事件，
  便于上层观测；用户主动 `triggerNow()` 始终绕过门控，显式意图优先于省电策略。
  默认 `createElectronNetworkPowerMonitor` 惰性 `require('electron')`，仅在
  `pauseOnBattery` 开启时才触碰 powerMonitor，避免测试环境触发 electron 二进制下载。
- **TransportRouter 路由选择器**（`desktop/src/main/services/sync/transportRouter.ts`）：
  新增 LAN/Relay 自动选择层。`selectTransport(deviceId)` 先用短超时 TCP 探测
  LAN 对端可达性（默认 800ms），可达则优先 LAN，否则回退 Relay；当对端无 LAN
  地址或无 Relay 配置时分别返回对应 `null`。`preferLan` / `lanProbeTimeoutMs`
  / `probeLan` 均可注入以便单测。
- **设备吊销贯通**（`desktop/src/main/services/sync/deviceRevocation.ts`）：
  `revokeDevice(deviceId, deps)` 编排四步流程：
  1. 通过 `SyncPeerManager.removePeer` 终止运行时会话（阻止在途数据）；
  2. 从 `sync_devices` 删除设备记录（撤销信任）；
  3. 调用 `clearOutboxForPeer` 清空该对端的待发 outbox 帧（防重放）；
  4. 仅当没有其他已配对设备时才调用 `deleteSyncMasterKey` 重置 SMK
     （多设备场景共享 SMK，重置会破坏剩余设备）。
  返回 `RevocationResult` 携带每步完成标志，便于上层观测。
- **SyncRuntime 单例注册表**（`desktop/src/main/services/sync/syncRuntime.ts`）：
  集中管理 `SyncPeerManager` / `SyncScheduler` 生命周期，提供
  `getSyncPeerManager` / `getSyncScheduler` / `setSyncRuntime` / `resetSyncRuntime`
  供主进程和吊销流程访问活跃会话。惰性创建，测试可注入自定义实例。

### Changed

- **IPC `REMOVE_DEVICE`**（`desktop/src/main/ipc/syncChannels.ts`）改为调用
  `revokeDevice(deviceId)`，替换原先仅删除设备记录的 `removeSyncDevice`，
  让 UI 的"移除设备"按钮真正终止运行时会话并清理 outbox。
- `outboxQueue.ts` 新增 `clearOutboxForPeer(peerDeviceId, db?)`，删除该对端全部
  outbox 帧并返回删除条数，供吊销流程调用。
- `syncCrypto.ts` 新增 `deleteSyncMasterKey(filePath?)`，删除 SMK 文件；不存在时
  返回 `false`（幂等，供吊销末台设备时安全调用）。

### Tests

- 桌面端测试由 205 增至 227（+22）：syncScheduler 门控 5 项、transportRouter
  选择策略 7 项、deviceRevocation 吊销流程 6 项、outboxQueue 清对端 2 项、
  syncCrypto 删除 SMK 2 项。`syncScheduler.test.ts` / `deviceRevocation.test.ts`
  添加 `vi.mock('electron')` 以避免在未安装二进制的 CI 环境卡住。
- TypeScript 主进程 / 渲染进程 typecheck 均通过。

## v1.2.0 — 2026-06-03

### Docs/config consistency pass — 2026-07-02

No source or behaviour changes — docs and config only.

- `package.json` / `package-lock.json` / `app.json` bumped to `1.2.0`
  so the in-tree version matches this changelog entry (it was stuck at
  `1.1.0`).
- README "Tech stack" updated to the real versions: React Native 0.86,
  Expo 56, TypeScript 6, Zustand 5, React Navigation v7.
- README "Known caveats" rewritten: `npm audit` now reports 0
  vulnerabilities on Expo SDK 56 (the old "29 advisories, SDK 56 not
  done yet" note was stale); the hard-coded ~5.5 MB web bundle size
  was replaced with a pointer to `npm run build:web`.
- README / ARCHITECTURE store description fixed: `store/index.ts` is no
  longer a single ~1100-line file — it composes the slice creators in
  `src/shared/store/slices/` into one `useAppStore`.
- ARCHITECTURE navigation section: React Navigation v6 → v7.
- `QUICK_START.md` / `GITHUB_BUILD.md` no longer reference the
  non-existent `.github/workflows/deploy-web.yml`; the Pages workflow
  is `pages-intro.yml` and ships only the `docs/` intro page. The
  fabricated cache-busting narrative in `GITHUB_BUILD.md` was removed.
- `verify.yml` doc note corrected: it runs typecheck only (lint runs
  in `ci.yml`).
- Repo URL consistency: `CITATION.cff`, `verify.yml`, and the question
  issue template now point at the canonical `MS33834/taskflow` repo
  instead of the stale `badhope/TaskFlow` path.
- `releases/README.md` and the question issue template bumped from
  v1.1.0 to v1.2.0.

### Release notes — 2026-06-03

- ESLint v9 flat config (`eslint.config.js`) replaces the old `.eslintrc.*`.
  Type-aware checks are off by default to keep CI fast; we re-evaluate
  on a per-file basis when the project grows.
- `verify.yml` now exits 0 with the new config (warnings only, on
  pre-existing `any` sprawl from the prototype phase).
- Added an `ErrorBoundary` wrapper in `App.tsx` so a render error in one
  screen doesn't blank the navigator.
- `TaskCard` and `Button` now expose `accessibilityLabel` / `accessibilityRole`
  / `accessibilityState` so screen readers announce task titles,
  priorities, and the disabled/loading state.
- `DraggableList` now keeps a local visual order during a drag and only
  pushes the final order to the store on drop, so the moving row can
  animate without re-rendering the whole list.
- `types/index.ts` lost its ASCII-art section dividers. The file is
  still grouped, just not shouting about it.
- A few real "why" comments added in `store/index.ts` (flat vs normalised
  tasks) and `DraggableList.tsx` (local order during drag).

## v1.1.0 — 2026-06-02

The "polish for the portfolio" release.

- App icon (1024×1024), splash (1284×1284), favicon, Apple touch icon
- 3 SVG preview images for the README
- AI suggestions: time-of-day, priority, category, merge, split
  (all local-statistical, no model)
- White-noise player: white / pink / brown + rain / ocean / forest
  (Web Audio API; on native, a Vibration fallback with a tip)
- @-mentions in comments with live member suggestions
- Draggable list reordering (PanResponder + LayoutAnimation)
- Focus mode: Forest-style full-screen + Pomodoro
- Multi-select bulk actions (Things 3 style bottom bar)
- Task dependencies (blockedBy / blocks)
- Voice input via Web Speech API (web only)
- Global keyboard shortcuts (Cmd/Ctrl+N to add, Esc to cancel selection)

## v1.0.0 — 2025-06-01

Initial feature-complete build.

- 15 screens, 20 reusable components, 6 non-list views
- Zustand store with AsyncStorage persistence
- Categories, tags, projects, goals, habits, notes, templates, automations
- Undo (last delete) via a custom hook
- Search with history
- Light / dark theme + custom color tokens
- Data export / import (JSON)
