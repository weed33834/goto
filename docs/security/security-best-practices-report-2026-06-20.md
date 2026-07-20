# TaskFlow 安全审计报告（跟进版）

**审计日期**：2026-06-20  
**审计范围**：全仓库（Python FastAPI 后端、Electron + Vite + React 桌面端、React Native/Expo 移动端、CI/CD、依赖）  
**审计工具**：代码审查、`npm audit`、`pip-audit`、grep 关键词扫描  
**报告路径**：`docs/security/security-best-practices-report-2026-06-20.md`

---

## 执行摘要

本次审计基于 2026-06-20 的上一份审计报告进行跟进。过去一个周期内，项目已修复多项高危问题：后端 `/api/v1/*` 已统一接入 Bearer Token 认证、CORS 默认不再使用通配符、插件加载增加路径/哈希校验、桌面端备份文件名增加路径穿越过滤、主密钥 `getMasterKey()` 已不再导出、渲染进程安全设置通过 schema 校验、模板变量替换增加正则转义等。

然而，仓库仍存在 **2 项 Critical、4 项 High、6 项 Medium、5 项 Low** 安全问题。最严重的是：旧版备份（V1）仍会导出密码校验盐与哈希、Git 克隆在禁用钩子前即可完成钩子执行、以及调试模式下 CORS 通配符与凭证的组合。建议优先修复 Critical 与 High 问题。

---

## 问题分级汇总

| 严重级别 | 数量 | 编号范围 |
|---------|------|----------|
| Critical | 2 | TF2-001 ~ TF2-002 |
| High | 4 | TF2-003 ~ TF2-006 |
| Medium | 6 | TF2-007 ~ TF2-012 |
| Low | 5 | TF2-013 ~ TF2-017 |

---

## Critical

### TF2-001：旧版备份（V1）仍包含密码校验盐与哈希，可被离线暴力破解

**影响**：`restoreBackup()` 为了兼容旧版本，仍支持 `BackupPayload version=1` 格式。V1 备份在 payload 中明文保存 `auth.salt` 与 `auth.hash`。攻击者拿到旧备份即可在离线环境下对密码进行暴力/字典破解，一旦密码被破解即可解密整个备份，完全绕过“本地加密”安全模型。

**涉及文件/行号**：
- `desktop/src/main/services/backupService.ts:32-40`（LegacyBackupPayload 定义）
- `desktop/src/main/services/backupService.ts:198-228`（restoreLegacyBackup 实现）

**具体代码**：
```typescript
// desktop/src/main/services/backupService.ts:35-38
interface LegacyBackupPayload {
  auth: {
    salt: string;
    hash: string;
  };
}
```

**修复建议**：
1. 尽快废弃 V1 备份格式，发布版本声明不再支持 V1 恢复。
2. 若必须保留兼容性，应在恢复时要求用户重新设置密码，恢复成功后立即重新派生 verifier，且不再将旧 salt/hash 写入任何持久化位置。
3. 在文档中明确建议用户重新导出 V2 备份并删除所有 V1 备份文件。

---

### TF2-002：Git 克隆在禁用钩子前完成，可导致远程代码执行

**影响**：`GitManager.clone_repository()` 调用 `pygit2.clone_repository()` 完成整个克隆流程后，才打开仓库设置 `core.hooksPath = /dev/null` 并检查 `.git/hooks` 目录。若远程仓库包含恶意 `post-checkout` 等钩子，克隆过程中的 checkout 阶段即可触发任意代码执行，获得与后端进程同等的权限。

**涉及文件/行号**：
- `backend/app/core/git_manager.py:72-115`

**具体代码**：
```python
# backend/app/core/git_manager.py:96-105
pygit2.clone_repository(validated_url, str(repo_path), callbacks=CloneProgress())
repo = pygit2.Repository(str(repo_path))
self._disable_hooks(repo)
self._check_hooks_directory(repo_path)
```

**修复建议**：
1. 在调用 `pygit2.clone_repository()` 之前，通过环境变量或全局 Git 配置预先禁用钩子执行（例如设置 `GIT_CONFIG_GLOBAL` 指向 `core.hooksPath=/dev/null`）。
2. 或改用 `pygit2.clone_repository()` 的 bare/不 checkout 选项，完成后再手动 checkout，并在 checkout 前禁用钩子。
3. 对克隆来源增加域名白名单/组织白名单，禁止匿名互联网仓库。
4. 在隔离环境（临时目录、低权限用户）中执行克隆操作。

---

## High

### TF2-003：调试模式下 CORS 通配符与 `allow_credentials=True` 共存

**影响**：`backend/app/main.py` 默认 `allow_credentials=True`，仅当 `*` 在允许来源中且 `DEBUG=false` 时才禁用凭证。若开发/测试人员在 `DEBUG=true` 时设置 `CORS_ORIGINS=*`，任意恶意网站可发起跨域请求并携带浏览器自动附带的凭证（如 Basic/Digest 凭据或未来可能引入的 Cookie），导致 CSRF/越权操作。

**涉及文件/行号**：
- `backend/app/main.py:50-65`
- `backend/app/config.py:26`

**具体代码**：
```python
# backend/app/main.py:52-57
allow_credentials = True
if "*" in _origins and not settings.debug:
    allow_credentials = False
```

**修复建议**：
1. 明确禁止 `*` 与 `allow_credentials=True` 同时出现，不受 `DEBUG` 影响。
2. 若 `*` 在来源中，始终将 `allow_credentials` 设为 `False`。
3. 在 `.env.example` 与启动日志中加入醒目警告，禁止生产环境设置 `CORS_ORIGINS=*`。

---

### TF2-004：V2 备份元数据泄露密码盐，降低离线破解成本

**影响**：新版备份（V2）虽然不再在 payload 中保存 verifier，但在未加密的文件头元数据中保存了 `keySalt`。攻击者拿到备份即可直接获得与用户当前密码派生相关的盐值，离线字典攻击无需猜测盐，显著降低破解门槛。

**涉及文件/行号**：
- `desktop/src/main/services/backupService.ts:42-45`（BackupMetadata 定义）
- `desktop/src/main/services/backupService.ts:122-131`（createBackup 写入 keySalt）

**具体代码**：
```typescript
// desktop/src/main/services/backupService.ts:128-129
const metadata: BackupMetadata = { version: BACKUP_VERSION, keySalt: verifier.salt };
return buildBackupFile(encrypted, metadata);
```

**修复建议**：
1. 备份元数据不再包含 `keySalt`；恢复时要求用户输入当前解锁密码，使用当前 verifier 的 salt 重新派生主密钥后解密。
2. 若需支持跨设备恢复（无当前 verifier），可要求用户在导出备份时输入一个独立的“备份密码”，并使用独立的随机盐派生备份密钥，与日常解锁密码解耦。
3. 为备份文件增加版本化的密钥派生参数（PBKDF2 迭代次数）与完整性校验（HMAC/AEAD）。

---

### TF2-005：LLM 调用缺少输入/输出过滤与审计

**影响**：`llm.py` 将用户消息直接传给 LangChain/OpenAI/Ollama，未做敏感信息脱敏、输出过滤或调用审计。用户可能在任务、保险库或模板中包含密码、API 密钥、身份证号等敏感数据，这些数据会被上传至第三方 LLM 服务，存在数据泄露与合规风险。

**涉及文件/行号**：
- `backend/app/core/llm.py:92-116`

**具体代码**：
```python
# backend/app/core/llm.py:97-101
async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
    llm = self.get_llm()
    converted_messages = self._convert_messages(messages)
    response = await llm.ainvoke(converted_messages, **kwargs)
    return response.content
```

**修复建议**：
1. 在调用 LLM 前对消息进行敏感实体检测/脱敏（如正则匹配 API key、密码模式、信用卡号、身份证/手机号）。
2. 记录 LLM 调用审计日志（不记录明文内容，仅记录调用时间、provider、model、token 数、是否命中脱敏规则）。
3. 提供明确的用户授权开关，默认不上传任何数据到外部 LLM；对 Ollama 等本地模型默认允许。
4. 对 LLM 输出做安全过滤，防止返回的 HTML/JS 被直接渲染到前端。

---

### TF2-006：备份恢复与首次解锁允许空密码

**影响**：`authService.setupPassword()` 与 `backupService.restoreV2Backup()` 均未校验密码非空。用户在无 verifier 时恢复备份，若输入空字符串作为 `newPassword`，应用将使用空密码加密数据库，导致任意本地访问者均可解锁。

**涉及文件/行号**：
- `desktop/src/main/services/authService.ts:49-52`
- `desktop/src/main/services/backupService.ts:168-170`

**修复建议**：
1. 在 `setupPassword()`、`unlock()`（首次设置分支）以及 `restoreV2Backup()` 中强制要求密码长度至少 8 位（或按安全策略配置）。
2. 在 UI 层与 IPC handler 层同时校验，避免仅依赖渲染进程校验被绕过。
3. 记录弱密码/空密码尝试日志。

---

## Medium

### TF2-007：移动端敏感 token 可能回退到 AsyncStorage

**影响**：`secureStorage.ts` 尝试动态加载 `expo-secure-store`，失败时回退到 `@react-native-async-storage/async-storage`。AsyncStorage 在 iOS/Android 上未加密，设备被 root/越狱或应用沙箱被突破后，攻击者可读取 token 与用户对象冒充用户。

**涉及文件/行号**：
- `src/shared/utils/secureStorage.ts:1-58`

**修复建议**：
1. 将 `expo-secure-store` 加入生产依赖，并在构建配置中确保其被链接。
2. 移除 AsyncStorage 回退逻辑，或在回退时发出安全警告并限制敏感操作。
3. 仅持久化必要字段（如 token），避免将整个 user 对象写入存储。

---

### TF2-008：API Token 可通过环境变量注入弱值

**影响**：`backend/app/config.py` 允许通过 `API_TOKEN` 注入固定 token，`security.py` 直接使用而无非空/熵校验。若运维人员使用短token或常见字符串，攻击者可能通过猜测或社工获得，从而越权调用所有 `/api/v1/*` 接口。

**涉及文件/行号**：
- `backend/app/config.py:33`
- `backend/app/core/security.py:54-57`

**修复建议**：
1. 若使用环境变量注入 token，启动时校验 token 长度至少 32 字节且来自 `secrets.token_urlsafe` 或等价高熵源。
2. 记录警告：检测到自定义 `API_TOKEN` 时提示用户确保其高熵。
3. 优先使用内存中生成的随机 token，并通过受保护的本地文件（权限 0600）或安全 IPC 传递给桌面端。

---

### TF2-009：自动锁定 hook 未在入口处校验分钟数

**影响**：`securitySettingsState.ts` 已对设置值做边界校验，但 `useAutoLock.ts` 直接接收 `minutes` 参数并计算 `minutes * 60 * 1000`。若未来有代码绕过状态管理直接调用该 hook（如测试代码、第三方组件），超大值可能导致 setTimeout 行为异常或渲染进程假死。

**涉及文件/行号**：
- `desktop/src/renderer/hooks/useAutoLock.ts:4-24`

**修复建议**：
1. 在 `useAutoLock` 内部对 `minutes` 做上下限校验（如 1~120 分钟），非法值 fallback 到默认值。
2. 将校验常量抽离到共享包，确保主进程、渲染进程、测试用例使用同一套边界。

---

### TF2-010：生产环境仍可通过环境变量开启 OpenAPI 文档

**影响**：`backend/app/main.py` 允许通过 `ENABLE_DOCS=true` 在生产环境开启 `/docs`、`/redoc`、`/openapi.json`。虽然默认关闭，但若误配置会暴露完整 API Schema 与接口，降低攻击者 recon 成本。

**涉及文件/行号**：
- `backend/app/main.py:34-38`

**修复建议**：
1. 增加额外校验：即使 `ENABLE_DOCS=true`，也要求 `DEBUG=true` 才开启文档，避免生产误开。
2. 或在文档路由上增加认证中间件，仅管理员可访问。

---

### TF2-011：后端调试模式会泄露详细错误堆栈

**影响**：`FastAPI(debug=settings.debug)` 在 `DEBUG=true` 时会向客户端返回完整错误堆栈，可能泄露代码路径、数据库结构、文件系统布局等敏感信息。

**涉及文件/行号**：
- `backend/app/main.py:43`
- `backend/app/config.py:19`

**修复建议**：
1. 生产环境强制 `DEBUG=false`，启动脚本检查并警告。
2. 自定义异常处理器，确保即使 DEBUG 开启也不向客户端返回内部堆栈。

---

### TF2-012：`validate_git_url` 存在 DNS 重绑定 SSRF 绕过

**影响**：`_is_internal_host()` 对无法解析为 IP 的域名返回 `False`，但 DNS 解析发生在实际克隆时。攻击者可注册一个先解析到公网、再解析到内网/元数据地址（如 `169.254.169.254`）的域名，从而绕过内网保护，发起 SSRF。

**涉及文件/行号**：
- `backend/app/utils/validator.py:79-127`

**修复建议**：
1. 对域名增加显式白名单（允许访问的代码托管平台域名列表）。
2. 在 `pygit2.clone_repository()` 前后解析目标 IP 并再次校验 `_is_internal_host()`，拒绝解析到内网/元数据地址的请求。
3. 使用网络隔离（禁止出站访问内网段）作为纵深防御。

---

## Low

### TF2-013：CI 环境 pip 存在已知 CVE

**影响**：`pip-audit` 检测到当前虚拟环境中 `pip 26.0.1` 存在 `PYSEC-2026-196`、`CVE-2026-3219`、`CVE-2026-6357`。pip 不是运行时依赖，但可能影响 CI 构建安全。

**涉及文件/行号**：
- `backend/pyproject.toml`（构建系统依赖间接涉及 pip 工具链）

**修复建议**：
1. 在 CI 与本地开发环境升级 pip 至 `>=26.1.2`。
2. 在 CI 的 Python 安装步骤后执行 `python -m pip install --upgrade pip>=26.1.2`。

---

### TF2-014：`build-android.yml` 上传过大工件范围

**影响**：`build-android.yml` 在 `Upload artifacts` 步骤中使用 `path: ./` 并仅排除 `node_modules` 与 `.git`，保留 30 天。若构建过程中任何步骤将 secrets、临时凭证或敏感日志写入工作区文件，都会被持久化工件。

**涉及文件/行号**：
- `.github/workflows/build-android.yml:48-57`

**修复建议**：
1. 仅上传真正需要的产物（如 `build-report.txt`、APK 路径），不要上传整个工作区。
2. 缩短保留时间，敏感工件限制在 7 天内。
3. 在 EAS 构建完成后通过 API 拉取产物并单独上传，而非整个目录。

---

### TF2-015：gitleaks workflow 使用 `continue-on-error: true`

**影响**：`.github/workflows/gitleaks.yml` 设置 `continue-on-error: true`，导致 gitleaks 发现 secrets 时不会阻断 CI，可能让泄露被忽略。

**涉及文件/行号**：
- `.github/workflows/gitleaks.yml:32-33`

**修复建议**：
1. 移除 `continue-on-error: true`，或在 gitleaks 发现严重泄露时通过 `fail` 输出让 job 失败。
2. 如需先收集报告再处理，可拆分为“扫描”与“上传报告”两个 job，扫描 job 失败时不上传。

---

### TF2-016：安全策略使用示例邮箱

**影响**：`SECURITY.md` 使用 `security-taskflow@example.com` 作为漏洞报告邮箱，并明确标注为示例。正式仓库应替换为真实可用的安全团队邮箱，否则外部安全研究者无法 responsible disclosure。

**涉及文件/行号**：
- `SECURITY.md:14-18`

**修复建议**：
1. 替换 `security-taskflow@example.com` 为项目维护者真实邮箱或漏洞赏金平台入口。
2. 删除“仅为示例”的注释。

---

### TF2-017：桌面端迁移缺少版本跟踪表

**影响**：`dbService.runMigrations()` 使用 `CREATE TABLE IF NOT EXISTS`，没有 `schema_version` 或 `migrations` 表。未来 schema 变更时可能导致重复/冲突迁移，虽然不属于直接安全漏洞，但会增加密钥/数据完整性风险。

**涉及文件/行号**：
- `desktop/src/main/services/dbService.ts:47-92`

**修复建议**：
1. 引入 `schema_version` 表，按版本号顺序执行迁移。
2. 对破坏性迁移（如加密算法升级）要求用户重新输入密码并重新加密数据。

---

## 已修复的上期问题（值得肯定）

| 上期编号 | 问题摘要 | 当前状态 | 关键修改位置 |
|---------|---------|---------|------------|
| TF-001 | 插件 API 任意路径执行 | 已修复 | `backend/app/api/plugins.py:31-81` 增加白名单目录、纯文件名校验、SHA-256 哈希校验 |
| TF-002 | CORS 通配符与凭证 | 部分修复 | `backend/app/main.py:51-57` 默认读取白名单，非调试模式下 `*` 会禁用凭证 |
| TF-004 | `getMasterKey()` 导出 | 已修复 | `desktop/src/main/services/authService.ts` 不再导出 `getMasterKey` |
| TF-005 | 后端接口无认证 | 已修复 | `backend/app/main.py:83-94` 与 `backend/app/api/deps.py` 统一 `Depends(get_current_user)` |
| TF-007 | OpenAPI docs 默认暴露 | 已修复 | `backend/app/main.py:34-38` 默认关闭文档 |
| TF-009 | IPC `SET_SETTINGS` 未校验 | 已修复 | `desktop/src/main/services/securitySettingsState.ts:21-53` 增加 schema 校验 |
| TF-010 | 备份文件名路径穿越 | 已修复 | `desktop/src/main/ipc/backupChannels.ts:12-47` 增加 basenamify 与字符过滤 |
| TF-013 | 模板变量 ReDoS | 已修复 | `src/shared/store/index.ts:2146-2151` 增加 `escapeRegExp` |
| TF-017 | 自动锁定时间无上限 | 已修复 | `desktop/src/main/services/securitySettingsState.ts:28-36` 限制 1~120 分钟 |

---

## 值得肯定的方面

1. **Electron 主进程安全**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`、`allowRunningInsecureContent: false`，并正确配置 CSP。
2. **加密实现**：桌面端使用 AES-256-GCM + 随机 IV/AuthTag、PBKDF2-SHA256 60 万次迭代、SQLCipher v4 数据库加密，算法与参数选择正确。
3. **截图保护**：`setContentProtection` 已启用，Linux 平台降级处理合理。
4. **CI/CD 安全**：actions 已固定 commit SHA，使用 `step-security/harden-runner`、CodeQL、Dependency Review、OSSF Scorecard、gitleaks。
5. **认证增强**：后端 `/api/v1/*` 已接入 `HTTPBearer` + `secrets.compare_digest` 的 token 校验。
6. **依赖扫描**：`npm audit` 无漏洞；`pip-audit` 仅发现 pip 工具链 CVE，项目运行时 Python 依赖暂无已知高危 CVE。

---

## 修复优先级建议

| 优先级 | 问题编号 | 修复目标 |
|--------|----------|----------|
| P0 | TF2-001, TF2-002 | 消除旧备份泄露与 Git 克隆 RCE 风险 |
| P1 | TF2-003, TF2-004, TF2-005, TF2-006 | 修复 CORS、备份盐泄露、LLM 数据安全、空密码 |
| P2 | TF2-007 ~ TF2-012 | 加固移动端存储、token 熵、自动锁定、文档暴露、SSRF |
| P3 | TF2-013 ~ TF2-017 | 更新 pip、收紧工件范围、调整 gitleaks 策略、完善安全文档、迁移版本化 |

---

## 附录：扫描结果

### npm audit

- 仓库根目录（移动端/前端）：`found 0 vulnerabilities`
- `desktop/`（桌面端）：`found 0 vulnerabilities`

### pip-audit

- 运行时 Python 依赖：无已知高危 CVE。
- 工具链 `pip 26.0.1`：存在 `PYSEC-2026-196`、`CVE-2026-3219`、`CVE-2026-6357`，建议升级至 `>=26.1.2`。

### 硬编码密钥扫描（grep）

- 未发现真实生产密钥、私钥或密码。
- 仅发现测试/示例凭证：
  - `backend/tests/integration/test_api.py:13`：`TEST_API_TOKEN = "test-token-for-integration"`
  - `desktop/src/tests/integration/backupService.test.ts:30-31`：测试用密码
  - `docs/superpowers/plans/2026-06-12-ai-dev-assistant.md:823`：`mock_settings.openai_api_key = "test-key"`
  - `backend/.env.example`：占位符示例值

### gitleaks

- 当前环境未安装 `gitleaks`，建议按 `.github/workflows/gitleaks.yml` 在本地/CI 运行；同时建议移除 `continue-on-error: true` 以保证泄露阻断效果。

---

## 附录：检查清单

- [x] Python 后端：路径遍历、命令注入、SQL 注入、反序列化、SSRF、文件操作、CORS、debug/OpenAPI、输入验证、认证授权
- [x] Electron 桌面端：IPC、preload、contextIsolation、nodeIntegration、本地文件、密钥管理、备份加密、截图保护、CSP
- [x] React/Expo 前端：XSS、URL/redirect、存储安全、第三方脚本、模板注入
- [x] CI/CD：workflow 权限、pinned action、secrets、工件范围、gitleaks 策略
- [x] 依赖：npm/pip 已知漏洞扫描
- [x] 无真实 secrets 或用户凭证写入报告

---

*本报告仅包含审计发现与修复建议，不包含任何真实凭据或用户数据。*
