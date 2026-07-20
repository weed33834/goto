# TaskFlow 安全审计报告

**审计日期**：2026-06-20  
**审计范围**：`MS33834/taskflow` 全仓库（Python FastAPI 后端、Electron + Vite + React 桌面端、React Native/Expo 前端、CI/CD、依赖）  
**审计人员**：AI 安全审计专家（Trae IDE sub-agent）  
**仓库路径**：仓库根目录

---

## 执行摘要

TaskFlow 是一款面向个人隐私的日程管理桌面应用，当前代码在基础加密（AES-256-GCM、SQLCipher v4、PBKDF2 600k 次迭代）和 Electron 进程隔离（`contextIsolation: true`、`nodeIntegration: false`）方面做得较好，CI/CD 也启用了 gitleaks、CodeQL、Dependency Review 与 OSSF Scorecard。

但本次审计仍发现 **2 项 Critical、4 项 High、8 项 Medium、5 项 Low** 安全问题。最严重的问题包括：后端插件 API 允许任意 Python 文件执行（RCE）、CORS 配置允许任意来源并携带凭证、桌面端备份文件包含密码校验盐与哈希（可离线暴力破解）、以及主密钥通过 `getMasterKey()`  exported 给多个模块导致攻击面扩大。

---

## 问题分级汇总

| 严重级别 | 数量 | 编号范围 |
|---------|------|----------|
| Critical | 2 | TF-001 ~ TF-002 |
| High | 4 | TF-003 ~ TF-006 |
| Medium | 8 | TF-007 ~ TF-014 |
| Low | 5 | TF-015 ~ TF-019 |

---

## Critical

### TF-001：后端插件 API 任意代码执行（RCE）

**影响**：任何能够访问后端 API 的攻击者，可通过 `/api/v1/plugins/load` 指定本地任意 `.py` 文件路径，动态导入并执行该模块，获得与后端进程同等的代码执行权限，进而读取加密数据库、写入文件或横向移动。

**涉及文件/行号**：
- `backend/app/api/plugins.py:35-55`
- `backend/app/plugins/manager.py:23-68`

**具体代码**：
```python
# backend/app/api/plugins.py:43-52
spec = importlib.util.spec_from_file_location(request.name, request.module_path)
...
module = importlib.util.module_from_spec(spec)
sys.modules[request.name] = module
spec.loader.exec_module(module)
plugin_manager.load_plugin(request.name, module)
```

`request.module_path` 未校验是否位于允许的插件目录内，也未对插件来源做签名或哈希校验。

**修复建议**：
1. **禁止通过 API 动态加载任意路径插件**。插件加载应仅限管理员在启动时从配置的 `plugins_dir` 白名单目录加载。
2. 如必须支持运行时扩展，要求插件文件具有可验证的数字签名或 SHA-256 哈希，并在加载前校验。
3. 删除或严格限制 `/api/v1/plugins/load` 接口，增加身份认证与授权（仅管理员）。
4. 对 `plugins_dir` 设置文件系统权限，防止非授权写入。

---

### TF-002：FastAPI CORS 允许任意来源并携带凭证

**影响**：`allow_origins=["*"]` 与 `allow_credentials=True` 组合，使任意恶意网站可发起跨域请求并携带用户凭证（如浏览器中保存的 session/cookie），导致 CSRF/越权操作、数据窃取等。

**涉及文件/行号**：
- `backend/app/main.py:27-33`

**具体代码**：
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**修复建议**：
1. 生产环境禁止 `allow_origins=["*"]` 与 `allow_credentials=True` 同时使用。
2. 将允许来源配置为精确白名单（如 `http://localhost:5173`、`http://localhost:8081`），通过环境变量 `CORS_ORIGINS` 注入。
3. 移动端/桌面端若不需要浏览器跨域，可直接关闭 CORS 或限定 `allow_origins`。

---

## High

### TF-003：桌面端备份文件包含密码校验盐与哈希

**影响**：`createBackup()` 将 `auth.salt` 与 `auth.hash` 打包进备份。虽然备份整体使用主密钥加密，但主密钥由用户密码通过 PBKDF2 派生。攻击者拿到备份文件即可在离线环境下对密码进行暴力/字典破解，一旦密码被破解即可解密整个备份，严重削弱“本地加密”安全模型。

**涉及文件/行号**：
- `desktop/src/main/services/backupService.ts:73-83`

**具体代码**：
```typescript
const payload: BackupPayload = {
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  auth: {
    salt: verifier.salt,
    hash: verifier.hash,
  },
  tables,
};
return encrypt(JSON.stringify(payload), key);
```

**修复建议**：
1. **备份中不再包含 `auth.salt` 与 `auth.hash`**。恢复时应要求用户输入当前解锁密码，重新派生主密钥后解密备份。
2. 如需保留“恢复后密码不变”的体验，可在恢复成功后由用户确认是否覆盖当前 verifier，且必须在恢复流程中再次校验密码。
3. 为备份文件增加版本化的密钥派生参数（PBKDF2 迭代次数）与完整性校验（HMAC/AEAD）。

---

### TF-004：主密钥通过 `getMasterKey()`  exported 扩大攻击面

**影响**：`authService.ts` 将 `masterKey` 通过 `getMasterKey()` 导出给 `vaultRepository.ts`、`backupService.ts` 等模块。只要主进程任意 IPC 通道或未来代码路径存在漏洞，攻击者即可直接获取 32 字节原始主密钥，完全绕过密码保护。

**涉及文件/行号**：
- `desktop/src/main/services/authService.ts:13-15`
- `desktop/src/main/repositories/vaultRepository.ts:3, 62-80`
- `desktop/src/main/services/backupService.ts:3, 59, 87`

**具体代码**：
```typescript
export function getMasterKey(): Buffer | null {
  return masterKey;
}
```

**修复建议**：
1. **移除 `getMasterKey()` 的 export**，将主密钥封装在 `authService` 内部。
2. 提供高阶加密/解密接口（如 `encryptWithMasterKey(plaintext: string): Buffer` 与 `decryptWithMasterKey(ciphertext: Buffer): string`），让调用方无法接触原始密钥。
3. 对需要派生子密钥的场景，使用 HKDF 从主密钥派生用途隔离的子密钥。

---

### TF-005：后端未启用身份认证与授权

**影响**：所有 `/api/v1/*` 接口均无认证/授权。任何本地或网络可达的攻击者均可读取、修改、删除任务/项目/分类/标签/文件元数据，调用 Git/插件/LLM 功能。结合 TF-001 的 RCE，可实现完全系统接管。

**涉及文件/行号**：
- 全后端路由：`backend/app/api/tasks.py`、`backend/app/api/files.py`、`backend/app/api/git.py`、`backend/app/api/plugins.py`
- `backend/app/main.py:51-54`

**修复建议**：
1. 引入基于 HTTP Basic Auth、JWT 或 OAuth2 的认证中间件，并在所有路由上依赖 `Depends(get_current_user)`。
2. 为 Git/插件/文件等高风险接口增加管理员角色校验。
3. 如后端仅用于本地桌面应用，可绑定 `127.0.0.1` 并在启动时生成随机 token，由桌面端通过环境变量或本地文件读取。

---

### TF-006：Git 克隆与拉取可能执行远程钩子导致 RCE

**影响**：`git.py` 的 `clone_repository` 接受外部 URL 并通过 `pygit2.clone_repository` 克隆。若远程仓库包含恶意 `post-checkout` 等 Git 钩子，可在克隆或拉取时执行任意代码。虽然 `validate_git_url` 限制了 http/https/ssh 格式，但仍无法阻止服务端钩子攻击。

**涉及文件/行号**：
- `backend/app/api/git.py:39-51`
- `backend/app/core/git_manager.py:39-77`

**修复建议**：
1. 在克隆前设置 Git 配置禁用钩子执行（如 `--config core.hooksPath=/dev/null` 或等价的 libgit2/pygit2 选项）。
2. 对克隆来源实施 URL 白名单/域名限制，禁止匿名互联网仓库。
3. 在隔离环境（临时目录、低权限用户）中执行克隆操作。

---

## Medium

### TF-007：OpenAPI docs 与 debug 模式默认暴露

**影响**：`FastAPI(debug=settings.debug)` 在 `DEBUG=true` 时会暴露详细错误堆栈；同时 `/docs` 与 `/redoc` 默认启用，会暴露完整 API Schema，降低攻击者 recon 成本。

**涉及文件/行号**：
- `backend/app/main.py:18-23`
- `backend/app/config.py:19`

**修复建议**：
1. 生产环境设置 `DEBUG=false`，并通过环境变量控制。
2. 显式关闭 docs：`FastAPI(..., docs_url=None, redoc_url=None, openapi_url=None)`，或至少通过认证访问。

---

### TF-008：文件 API 路径穿越验证可被部分绕过

**影响**：`validate_file_path` 采用黑名单（检查 `..`、`~`、`$`、`` ` ``、`|`、`&`、`;`）而非白名单/规范化，若出现 URL 编码、`....//` 等变体可能绕过字符检查。虽然后续 `resolve()` + `relative_to()` 能防御真实穿越，但黑名单逻辑本身不可靠，且会误伤合法路径。

**涉及文件/行号**：
- `backend/app/utils/validator.py:11-38`
- `backend/app/api/files.py:68-112`

**修复建议**：
1. 移除危险字符黑名单，改为：解析为绝对路径 -> `resolve()` -> 使用 `Path.is_relative_to()` 校验必须在 `base_dir` 下。
2. 对 `source`/`target_dir` 统一做 basenamify 或白名单字符校验。
3. 文件响应模型 `FileResponse` 不应返回服务器绝对路径，避免信息泄露。

---

### TF-009：IPC `SECURITY.SET_SETTINGS` 未校验输入

**影响**：`ipcMain.handle(IPC_CHANNELS.SECURITY.SET_SETTINGS, async (_, settings) => { ... })` 直接接受并保存渲染进程传入的任意对象。恶意或缺陷的渲染进程可设置负数 `autoLockMinutes`、超大 `clipboardClearSeconds` 等，影响功能可用性或造成拒绝服务。

**涉及文件/行号**：
- `desktop/src/main/index.ts:43-46`
- `desktop/src/main/services/securitySettingsState.ts:21-29`

**修复建议**：
1. 在 IPC handler 中使用 `SecuritySettings` schema（zod/io-ts）严格校验字段类型与取值范围。
2. 对 `autoLockMinutes`、`clipboardClearSeconds` 设置上限（如 1440 分钟 / 3600 秒）。
3. 拒绝未知字段，防止 schema 外属性被写入数据库。

---

### TF-010：备份导出 `defaultFileName` 存在路径穿越风险

**影响**：`backupChannels.ts` 将渲染进程传入的 `defaultFileName` 直接拼接到 `path.join(app.getPath('documents'), defaultFileName)`。若 `defaultFileName` 包含 `../evil.taskflow-backup`，可能导致备份文件写入用户文档目录之外的敏感位置。

**涉及文件/行号**：
- `desktop/src/main/ipc/backupChannels.ts:9-17`

**修复建议**：
1. 对 `defaultFileName` 做 basenamify 处理（`path.basename`），去除目录分隔符与 `..`。
2. 校验扩展名必须为 `.taskflow-backup`。
3. 限制文件名长度与允许字符集。

---

### TF-011：开发模式加载任意 URL 并开启 DevTools

**影响**：`windowManager.ts` 在 `VITE_DEV_SERVER_URL` 环境变量存在时，通过 `mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)` 加载页面并自动打开 DevTools。若该环境变量被篡改，可能加载恶意远程页面并在生产包中暴露 Node/Electron 调试能力。

**涉及文件/行号**：
- `desktop/src/main/windowManager.ts:20-22`

**修复建议**：
1. 仅在 `!app.isPackaged` 时允许加载开发服务器 URL，并校验 URL 主机为 `localhost`/`127.0.0.1`。
2. 生产构建中完全移除 DevTools 开启逻辑；可考虑在打包时通过 `ELECTRON_IS_DEV` 等显式标志控制。

---

### TF-012：移动端 AsyncStorage 明文存储用户 Token

**影响**：React Native/Expo 前端在 `src/shared/store/index.ts:787-789` 将 `{ user, token }` 明文写入 `AsyncStorage`。若设备被 root/越狱或应用沙箱被突破，攻击者可读取会话 token 冒充用户。

**涉及文件/行号**：
- `src/shared/store/index.ts:787-789`
- `src/shared/store/index.ts:745-769`

**修复建议**：
1. 敏感 token 应使用平台安全存储：`expo-secure-store`（Expo）或 `Keychain`/`Keystore` 原生模块。
2. 仅存储必要字段，避免将整个 user 对象持久化。
3. 实现 token 过期与刷新机制，logout 时彻底清除安全存储。

---

### TF-013：模板变量替换存在 ReDoS 风险

**影响**：`applyTemplate` 使用用户可控的 `variables` key 构造正则表达式 `new RegExp(`{{${key}}}`, 'g')`。若 key 包含嵌套量词（如 `(a+)+`），对 `JSON.stringify(content)` 的长字符串执行替换可能导致灾难性回溯（ReDoS）。

**涉及文件/行号**：
- `src/shared/store/index.ts:2134-2137`

**具体代码**：
```typescript
Object.entries(variables).forEach(([key, value]) => {
  content = JSON.parse(JSON.stringify(content).replace(new RegExp(`{{${key}}}`, 'g'), String(value)));
});
```

**修复建议**：
1. 将 key 先做 `escapeRegExp` 转义后再拼入正则，避免 key 被解析为正则元字符。
2. 或使用字符串 split/join 替换（如 Mustache 风格），完全避免正则。
3. 对变量 key 做白名单校验（仅允许 `[A-Za-z0-9_]`）。

---

### TF-014：LLM 调用缺少输入/输出过滤与审计

**影响**：`llm.py` 将用户消息直接传给 LangChain/OpenAI/Ollama，未做敏感信息脱敏、输出过滤或调用审计。用户可能在任务/保险库中包含密码、密钥等敏感数据并被上传至第三方 LLM 服务。

**涉及文件/行号**：
- `backend/app/core/llm.py:74-116`

**修复建议**：
1. 在调用 LLM 前对消息进行敏感实体检测/脱敏（如正则匹配 API key、密码模式）。
2. 记录 LLM 调用日志（不记录明文内容，仅记录调用时间与 token 数）。
3. 提供明确的用户授权开关，默认不上传任何数据到外部 LLM。

---

## Low

### TF-015：后端默认监听 `127.0.0.1` 但无主机绑定强制校验

**影响**：`config.py` 默认 `api_host=127.0.0.1`，但若通过环境变量改为 `0.0.0.0`，则后端会暴露到所有接口。当前无文档或启动脚本提醒此风险。

**涉及文件/行号**：
- `backend/app/config.py:22-23`

**修复建议**：
1. 在 `.env.example` 与 README 中明确标注：生产环境必须绑定 `127.0.0.1` 或配合反向代理 + TLS。
2. 启动脚本打印当前监听地址并给出安全警告。

---

### TF-016：日志可能记录敏感信息

**影响**：`logger.py` 未对日志内容做脱敏，且 `debug` 模式会记录 DEBUG 级别信息。后端 API 若记录请求体或异常详情，可能泄露任务内容、文件路径、LLM 提示词等。

**涉及文件/行号**：
- `backend/app/utils/logger.py:14, 37`

**修复建议**：
1. 对日志 formatter 增加敏感字段过滤（如 `password`、`token`、`api_key`、`fields`）。
2. 生产环境关闭 DEBUG，限制日志文件权限（`chmod 600`）。

---

### TF-017：桌面端自动锁定时间配置未做上限校验

**影响**：`authService.ts` 的 `resetAutoLock` 与 `useAutoLock` 直接使用 `minutes * 60 * 1000` 设置定时器。超大值可能导致定时器行为异常或用户误以为已启用自动锁定。

**涉及文件/行号**：
- `desktop/src/main/services/authService.ts:57-63`
- `desktop/src/renderer/hooks/useAutoLock.ts:5-24`

**修复建议**：
1. 在 IPC handler 与设置 UI 中对 `autoLockMinutes` 设置合理上下限（如 1 ~ 120 分钟）。
2. 对非法值fallback到默认值并记录警告。

---

### TF-018：Python 依赖 `pip` 存在已知 CVE

**影响**：`pip-audit` 检测到当前环境中 `pip 26.0.1` 存在 `PYSEC-2026-196`、`CVE-2026-3219`、`CVE-2026-6357`。虽然 pip 不是运行时依赖，但可能影响 CI 构建安全。

**涉及文件/行号**：
- `backend/pyproject.toml`（构建系统依赖）

**修复建议**：
1. 在 CI 与本地开发环境升级 pip 至 `>=26.1.2`。
2. 在 `pyproject.toml` 的构建系统要求中指定 `setuptools>=61.0` 并保持 pip 工具链更新。

---

### TF-019：验证器 `validate_git_url` 正则未覆盖所有合法/非法场景

**影响**：`validate_git_url` 使用两个正则校验 URL，但未覆盖 `http://user:pass@host` 凭证嵌入、`ssh://` 协议等；同时黑名单方式无法阻止恶意但格式合法的 HTTPS 域名。

**涉及文件/行号**：
- `backend/app/utils/validator.py:41-54`

**修复建议**：
1. 使用 `urllib.parse.urlparse` 解析 URL，显式校验 scheme（仅允许 `https`、`git`）、netloc 白名单。
2. 禁止 URL 中嵌入用户名/密码（`@` 前内容）。
3. 对 ssh URL 使用 `git@host:path` 标准格式并校验 host 白名单。

---

## 值得肯定的方面

1. **Electron 进程隔离**：`contextIsolation: true`、`nodeIntegration: false`、`preload` 脚本暴露最小 API，符合安全最佳实践。
2. **加密实现**：桌面端使用 AES-256-GCM + 随机 IV/AuthTag、PBKDF2-SHA256 600k 迭代、SQLCipher v4 数据库加密，算法选择正确。
3. **截图保护**：通过 `setContentProtection` 启用，对 Windows/macOS 有效，Linux 降级处理合理。
4. **CI/CD 安全**：workflow 使用 pinned action、最小权限、`step-security/harden-runner`、gitleaks、dependency review、Scorecard。
5. **依赖扫描**：`npm audit` 无高危漏洞；`pip-audit` 仅发现 pip 自身漏洞，项目 Python 运行时依赖暂无已知高危 CVE。

---

## 修复优先级建议

| 优先级 | 问题编号 | 修复目标 |
|--------|----------|----------|
| P0 | TF-001, TF-002 | 消除 RCE 与跨域凭证窃取风险 |
| P1 | TF-003, TF-004, TF-005, TF-006 | 保护主密钥、备份文件与访问控制 |
| P2 | TF-007 ~ TF-014 | 加固输入校验、信息泄露、ReDoS、LLM 数据安全 |
| P3 | TF-015 ~ TF-019 | 文档、日志脱敏、依赖更新、URL 校验完善 |

---

## 附录：检查清单

- [x] Python 后端：路径遍历、命令注入、SQL 注入、反序列化、SSRF、文件上传下载、CORS、debug/OpenAPI、输入验证
- [x] Electron 桌面端：IPC、preload、contextIsolation、nodeIntegration、本地文件、密钥管理、autoStorage、截图保护
- [x] React 前端：XSS、URL/redirect、localStorage、第三方脚本
- [x] CI/CD：workflow 权限、pinned action、secrets、硬编码凭证
- [x] 依赖：npm/pip 已知漏洞扫描
- [x] 无真实 secrets 或用户凭证写入报告

---

*本报告仅包含审计发现与修复建议，不包含任何真实凭据或用户数据。*
