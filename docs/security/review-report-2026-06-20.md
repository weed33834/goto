# TaskFlow 代码安全与质量审查报告

**审查日期**：2026-06-20  
**审查范围**：全仓库（FastAPI 后端、Electron 桌面端、React Native/Expo 移动端）  
**审查人员**：Trae IDE 安全审计 sub-agent  

---

## 执行摘要

本次审查针对 TaskFlow 项目的后端、桌面端与移动端进行了深度安全与质量检查。仓库此前已进行过一轮安全加固，但仍有部分中高级问题可进一步修复。本次在原有基础上完成了 **3 项新增修复**，并验证了全量测试、类型检查与 Lint 命令均通过。剩余未修复项已按严重程度排序并给出整改建议。

---

## 已修复问题（按严重程度排序）

### 1. 中危：模板变量替换存在 ReDoS 风险（TF-013）

**严重程度**：Medium  
**影响**：`applyTemplate` 使用用户可控的 `variables` key 直接拼入正则表达式。若 key 包含嵌套量词（如 `(a+)+`），对较长的 `JSON.stringify(content)` 执行全局替换可能导致灾难性回溯，造成 UI 线程阻塞甚至拒绝服务。

**涉及文件/行号**：
- `src/shared/store/index.ts:2140-2155`

**修复方式**：
新增 `escapeRegExp` 辅助函数，对占位符字符串中的正则元字符进行转义后再构造 `RegExp`，彻底消除 key 被解析为正则表达式的风险。

**修复后代码**：
```typescript
applyTemplate: (templateId, variables = {}) => {
  const template = get().templates.find((t) => t.id === templateId);
  if (!template) return null;

  // 对模板变量 key 做正则转义，防止 key 中的特殊字符被解析为正则元字符，
  // 避免 ReDoS（灾难性回溯）与意外替换行为。
  const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let content = deepClone(template.content);
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    content = JSON.parse(JSON.stringify(content).replace(new RegExp(escapeRegExp(placeholder), 'g'), String(value)));
  });

  return content;
},
```

---

### 2. 中危：桌面端安全设置 IPC 未校验输入（TF-009）

**严重程度**：Medium  
**影响**：`IPC_CHANNELS.SECURITY.SET_SETTINGS` 直接将渲染进程传入的任意对象写入持久化存储。恶意或缺陷的渲染进程可设置负数 `autoLockMinutes`、超大 `clipboardClearSeconds` 等，影响功能可用性或造成拒绝服务。

**涉及文件/行号**：
- `desktop/src/main/services/securitySettingsState.ts:21-53`
- `desktop/src/main/index.ts:45-48`（调用侧已通过内部校验函数得到保护）

**修复方式**：
新增 `validateSecuritySettings(input: unknown): SecuritySettings` 函数，对字段类型与取值范围做严格清洗：
- `lockMethod` 仅允许 `'password' | 'pin' | 'biometric'`；
- `autoLockMinutes` 限制在 `[1, 120]`；
- `clipboardClearSeconds` 限制在 `[1, 3600]`；
- 布尔字段做类型校验，非法值回退到当前内存默认值。

**修复后代码**：
```typescript
const VALID_LOCK_METHODS: SecuritySettings['lockMethod'][] = ['password', 'pin', 'biometric'];
const MIN_AUTO_LOCK_MINUTES = 1;
const MAX_AUTO_LOCK_MINUTES = 120;
const MIN_CLIPBOARD_CLEAR_SECONDS = 1;
const MAX_CLIPBOARD_CLEAR_SECONDS = 3600;

export function validateSecuritySettings(input: unknown): SecuritySettings {
  const settings = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  const lockMethod = VALID_LOCK_METHODS.includes(settings.lockMethod as SecuritySettings['lockMethod'])
    ? (settings.lockMethod as SecuritySettings['lockMethod'])
    : 'password';

  const rawAutoLock = Number(settings.autoLockMinutes);
  const autoLockMinutes = Number.isFinite(rawAutoLock)
    ? Math.max(MIN_AUTO_LOCK_MINUTES, Math.min(MAX_AUTO_LOCK_MINUTES, Math.floor(rawAutoLock)))
    : currentSettings.autoLockMinutes;

  const rawClipboard = Number(settings.clipboardClearSeconds);
  const clipboardClearSeconds = Number.isFinite(rawClipboard)
    ? Math.max(MIN_CLIPBOARD_CLEAR_SECONDS, Math.min(MAX_CLIPBOARD_CLEAR_SECONDS, Math.floor(rawClipboard)))
    : currentSettings.clipboardClearSeconds;

  const screenshotProtection = typeof settings.screenshotProtection === 'boolean'
    ? settings.screenshotProtection
    : currentSettings.screenshotProtection;

  const privacyModeEnabled = typeof settings.privacyModeEnabled === 'boolean'
    ? settings.privacyModeEnabled
    : currentSettings.privacyModeEnabled;

  return {
    lockMethod,
    autoLockMinutes,
    clipboardClearSeconds,
    screenshotProtection,
    privacyModeEnabled,
  };
}
```

---

### 3. 中危：桌面端自动锁定时间未做范围校验（TF-017）

**严重程度**：Medium  
**影响**：`authService.ts` 的 `resetAutoLock` 直接使用 `minutes * 60 * 1000` 设置定时器。渲染进程可传入极大值导致定时器行为异常，或传入极小/负值绕过自动锁定。

**涉及文件/行号**：
- `desktop/src/main/services/authService.ts:89-105`

**修复方式**：
在 `resetAutoLock` 内部对 `minutes` 做数值转换与范围限制 `[1, 120]`，超出范围时按边界值处理。

**修复后代码**：
```typescript
const MIN_AUTO_LOCK_MINUTES = 1;
const MAX_AUTO_LOCK_MINUTES = 120;

export function resetAutoLock(minutes: number): void {
  if (autoLockTimer) clearTimeout(autoLockTimer);

  // 限制自动锁定时间在合理范围，防止渲染进程传入极大/极小值导致定时器异常或拒绝服务
  const safeMinutes = Math.max(
    MIN_AUTO_LOCK_MINUTES,
    Math.min(MAX_AUTO_LOCK_MINUTES, Math.floor(Number(minutes) || 0))
  );
  if (safeMinutes <= 0) return;

  autoLockTimer = setTimeout(() => {
    lock();
  }, safeMinutes * 60 * 1000);
}
```

---

## 本轮审查前已完成的其他关键修复

以下问题在本次任务启动前已由上游工作完成，本次审查对其进行了复核，确认代码已生效且测试通过：

| 问题 | 涉及文件 | 修复要点 |
|------|---------|---------|
| Git URL SSRF（TF-019） | `backend/app/utils/validator.py` | 新增 `_is_internal_host`，禁止 Git URL 指向内网、回环、链路本地地址 |
| 文件 API 敏感路径泄露（TF-008） | `backend/app/api/files.py` | `FileResponse` 通过 field_validator 将绝对路径转为相对路径返回 |
| 全局 Escape 快捷键风险 | `desktop/src/main/windowManager.ts`、`desktop/src/renderer/hooks/usePrivacyMode.ts` | 移除全局 `Escape` 注册，改为渲染进程局部键盘事件 |
| 数据导入校验 | `src/shared/store/index.ts` | 导入数据增加对象/数组类型校验与 10,000 条上限，防止原型污染与 DoS |
| CORS 配置收紧（TF-002） | `backend/app/main.py` | `allow_methods` / `allow_headers` 从通配符改为白名单 |
| 后端认证中间件（TF-005） | `backend/app/main.py`、`backend/app/api/deps.py`、`backend/app/core/security.py` | 所有 `/api/v1/*` 路由依赖 `get_current_user`，通过 Bearer token 校验 |
| 插件加载 RCE 缓解（TF-001） | `backend/app/api/plugins.py` | 增加插件名标识符校验、路径白名单、SHA-256 哈希校验 |
| 备份文件名路径穿越（TF-010） | `desktop/src/main/ipc/backupChannels.ts` | 新增 `sanitizeBackupFileName`，过滤控制字符与路径分隔符 |
| 密码生成长度校验 | `desktop/src/main/ipc/vaultChannels.ts` | 限制生成密码长度在 `[8, 128]` |
| 移动端 token 安全存储（TF-012） | `src/shared/utils/secureStorage.ts`、`src/shared/api/client.ts` | 优先使用 `expo-secure-store`，回退 AsyncStorage；API 请求附加 Bearer 头 |
| Git 钩子执行风险（TF-006） | `backend/app/core/git_manager.py` | 克隆/拉取后禁用 `core.hooksPath`，并检查 `.git/hooks` 异常可执行文件 |
| 主密钥封装（TF-004） | `desktop/src/main/services/authService.ts` | `getMasterKey` 不再 export，仅暴露 `encryptWithMasterKey` / `decryptWithMasterKey` |
| 备份不再包含 verifier（TF-003） | `desktop/src/main/services/backupService.ts` | V2 备份 payload 不再包含 `auth.salt`/`auth.hash`，仅保留恢复所需 metadata |

---

## 未修复问题与建议

### 1. 中危：备份 metadata 仍包含 keySalt，存在离线暴力破解风险（TF-003 残留）

**说明**：V2 备份文件前 4 字节后的 metadata 仍保存 `keySalt`，攻击者拿到备份文件即可在离线环境下对密码进行暴力/字典破解。该设计是为了“无 verifier 环境也能恢复备份”的体验，但削弱了加密强度。

**建议**：
- 在恢复流程中要求用户同时提供当前应用密码或恢复密码，使用 HKDF 派生独立的“备份加密密钥”，使备份文件不直接依赖用户登录密码的 salt；
- 或在无 verifier 设备上恢复时，通过安全信道（如已认证的另一台设备/二维码）传输恢复密钥，而非把 salt 写入备份。

---

### 2. 中危：LLM 调用缺少输入脱敏与审计（TF-014）

**说明**：`backend/app/core/llm.py` 将用户任务/保险库内容直接提交给外部 LLM，未做敏感信息检测或用户二次确认。

**建议**：
- 默认关闭外部 LLM，提供显式授权开关；
- 对上传内容做正则/NER 脱敏（API key、密码、身份证、手机号等）；
- 记录调用元数据（时间、token 数、模型），不记录明文 prompt/response。

---

### 3. 低危：日志可能记录敏感信息（TF-016）

**说明**：`logger.py` 未对请求体、异常详情做脱敏，DEBUG 模式下可能泄露任务内容、文件路径、LLM 提示词等。

**建议**：
- 生产环境默认 `DEBUG=false`；
- 在日志 formatter 中过滤 `password`、`token`、`api_key`、`secret` 等字段；
- 限制日志文件权限（`chmod 600`）。

---

### 4. 低危：开发模式加载任意 URL 并开启 DevTools（TF-011）

**说明**：`windowManager.ts` 在 `VITE_DEV_SERVER_URL` 存在时加载任意 URL 并开启 DevTools，若环境变量被篡改可能导致生产包加载恶意页面。

**建议**：
- 仅在 `!app.isPackaged` 时允许加载开发服务器 URL；
- 校验 URL 主机为 `localhost`/`127.0.0.1`；
- 生产包中完全移除 DevTools 开启逻辑。

---

### 5. 代码异味：`importData` 中显式使用 `any`

**说明**：`src/shared/store/index.ts:2501` 使用 `const importData = parsed as Record<string, any>;`，ESLint 报 `@typescript-eslint/no-explicit-any` warning。该写法是为了兼容现有宽松类型推断，不直接构成安全漏洞，但降低了类型安全性。

**建议**：
- 逐步为导入数据结构定义严格的 TypeScript interface；
- 或至少使用 `unknown` 并在访问每个字段时做类型收窄。

---

## TypeScript 与 ESLint 配置检查

### 根目录（React Native）

- `tsconfig.json`：`strict: true`，但保留了 `noImplicitAny: false`；
- `moduleResolution: bundler`，配合 `paths` 配置；
- ESLint 使用 `@eslint/js` + `typescript-eslint` + `eslint-plugin-react`。

### desktop（Electron）

- 拆分为 `tsconfig.main.json` / `tsconfig.renderer.json`，便于分别编译主进程与渲染进程；
- ESLint 使用 `@typescript-eslint` 插件；
- 主进程 TS 配置未显式开启 `strict`，建议统一开启以匹配安全编码要求。

---

## 验证命令结果

### 后端测试

```bash
cd backend
PYTHONPATH=. pytest -q
```

**结果**：`54 passed in 3.31s` ✅

### 桌面端测试

```bash
cd desktop
npm test
```

**结果**：`13 passed` ✅

### 根目录类型检查

```bash
npm run typecheck
```

**结果**：`tsc --noEmit` 通过 ✅

### 根目录 Lint

```bash
npm run lint
```

**结果**：通过，仅 1 个 warning
```
src/shared/store/index.ts
  2501:51  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

✖ 1 problem (0 errors, 1 warning)
```

### 桌面端类型检查

```bash
cd desktop
npm run typecheck
```

**结果**：`tsc --noEmit -p tsconfig.main.json && tsc --noEmit -p tsconfig.renderer.json` 通过 ✅

### 桌面端 Lint

```bash
cd desktop
npm run lint
```

**结果**：`eslint src` 通过 ✅

---

## 修改文件清单

本次审查直接修改/新增的文件：

1. `src/shared/store/index.ts` — 修复模板变量 ReDoS
2. `desktop/src/main/services/securitySettingsState.ts` — 新增安全设置校验
3. `desktop/src/main/services/authService.ts` — 自动锁定时间范围校验

此前已完成并复核的修改（未在本次任务中再次改动）：

- `backend/app/utils/validator.py`
- `backend/app/api/files.py`
- `backend/app/api/plugins.py`
- `backend/app/api/git.py`
- `backend/app/main.py`
- `backend/app/core/git_manager.py`
- `backend/app/api/deps.py`
- `backend/app/core/security.py`
- `desktop/src/main/windowManager.ts`
- `desktop/src/renderer/hooks/usePrivacyMode.ts`
- `desktop/src/main/ipc/backupChannels.ts`
- `desktop/src/main/ipc/vaultChannels.ts`
- `desktop/src/main/services/backupService.ts`
- `desktop/src/main/services/authService.ts`（主密钥封装部分）
- `src/shared/api/client.ts`
- `src/shared/utils/secureStorage.ts`
- `src/types/expo-secure-store.d.ts`
- `backend/tests/test_plugins.py`

---

## 结论

- 本次审查共修复 **3 个真实可修复安全问题**（均为 Medium 级别）：模板 ReDoS、IPC 安全设置未校验、自动锁定时间未校验；
- 后端、桌面端、移动端此前已完成的多项关键安全加固均通过测试与类型检查；
- 后端 pytest 54 项、桌面端 vitest 13 项全部通过；
- 根目录与 desktop 的 `typecheck`、`lint` 均通过；
- 剩余未修复项主要为设计权衡（备份 keySalt）、LLM 数据安全与日志脱敏，已给出整改建议。

**未执行 git commit / push。**
