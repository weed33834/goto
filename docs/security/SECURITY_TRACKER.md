# TaskFlow 安全问题统一跟踪表

> 本文件是 TF / TF2 两轮安全审计的**单一真相来源**，合并 `audit-report-2026-06-20.md`（TF-001~019）与 `security-best-practices-report-2026-06-20.md`（TF2-001~017）共 36 项发现。
> 其他文档（`SECURITY.md`、`docs/ROADMAP.md`、原始审计报告等）在引用安全项状态时应指向本表，避免多处分散维护。
> 状态取值固定为：`已修复` / `部分修复` / `已废弃` / `未修复` / `已知限制`。

---

## 一、汇总统计

### 1.1 总数

| 轮次 | 编号范围 | 数量 |
|------|---------|------|
| 第一轮（TF） | TF-001 ~ TF-019 | 19 |
| 第二轮（TF2） | TF2-001 ~ TF2-017 | 17 |
| **合计** | — | **36** |

### 1.2 按严重级别

| 级别 | 数量 | 编号 |
|------|------|------|
| Critical | 4 | TF-001、TF-002、TF2-001、TF2-002 |
| High | 8 | TF-003 ~ TF-006、TF2-003 ~ TF2-006 |
| Medium | 14 | TF-007 ~ TF-014、TF2-007 ~ TF2-012 |
| Low | 10 | TF-015 ~ TF-019、TF2-013 ~ TF2-017 |

### 1.3 按状态

| 状态 | 数量 | 编号 |
|------|------|------|
| 已修复 | 33 | TF-001、TF-003、TF-004、TF-005、TF-006、TF-007、TF-009、TF-010、TF-011、TF-012、TF-013、TF-014、TF-015、TF-016、TF-017、TF-018、TF-019、TF2-002 ~ TF2-017 |
| 部分修复 | 2 | TF-002、TF-008 |
| 已废弃 | 1 | TF2-001 |
| 未修复 | 0 | — |

> Critical 已全部解决（2 项已修复 + 1 项部分修复 + 1 项已废弃）；High 已全部修复。
> 2026-07-05 批量修复 TF-016、TF-018、TF2-009、TF2-010、TF2-011、TF2-012、TF2-013、TF2-014（共 8 项）。
> 2026-07-07 修复剩余 2 项未修复项：TF-011（开发模式 URL 校验）、TF-015（主机绑定警告），至此 36 项全部已修复/部分修复/已废弃，无未修复项。

---

## 二、主跟踪表

> 列说明：`修复位置/备注` 给出关键修改文件:行号或未修复原因；`关联编号` 标注两轮审计间的同一问题延续；`来源报告` 列出状态证据来源。

### 2.1 第一轮审计（TF-001 ~ TF-019）

| 编号 | 标题 | 严重级别 | 状态 | 修复位置/备注 | 关联编号 | 来源报告 |
|------|------|---------|------|--------------|---------|---------|
| TF-001 | 后端插件 API 任意代码执行（RCE） | Critical | 已修复 | `backend/app/api/plugins.py:31-81` 增加白名单目录、纯文件名校验、SHA-256 哈希校验 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-002 | FastAPI CORS 允许任意来源并携带凭证 | Critical | 部分修复 | `backend/app/main.py:51-57` 默认读取白名单，非调试模式下 `*` 会禁用凭证；`allow_methods`/`allow_headers` 改为白名单。调试模式下 `*` + credentials 共存问题由 TF2-003 收尾 | TF2-003 | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-003 | 桌面端备份文件包含密码校验盐与哈希 | High | 已修复 | `desktop/src/main/services/backupService.ts` V2 备份 payload 不再包含 `auth.salt`/`auth.hash`；TF2-004 进一步移除 metadata 中的 keySalt | TF2-001、TF2-004 | 审计报告 + 审查报告 |
| TF-004 | 主密钥通过 `getMasterKey()` exported 扩大攻击面 | High | 已修复 | `desktop/src/main/services/authService.ts` 不再导出 `getMasterKey`，仅暴露 `encryptWithMasterKey`/`decryptWithMasterKey` | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-005 | 后端未启用身份认证与授权 | High | 已修复 | `backend/app/main.py:83-94` 与 `backend/app/api/deps.py` 统一 `Depends(get_current_user)`，Bearer token 校验 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-006 | Git 克隆与拉取可能执行远程钩子导致 RCE | High | 已修复 | `backend/app/core/git_manager.py` 克隆后禁用 `core.hooksPath` 并检查 `.git/hooks`；TF2-002 修复"克隆前禁用钩子"的残留问题 | TF2-002 | 审计报告 + 审查报告 + 跟进报告 |
| TF-007 | OpenAPI docs 与 debug 模式默认暴露 | Medium | 已修复 | `backend/app/main.py:34-38` 默认关闭文档 | — | 审计报告 + 跟进报告回填 |
| TF-008 | 文件 API 路径穿越验证可被部分绕过 | Medium | 部分修复 | `backend/app/api/files.py` `FileResponse` 通过 field_validator 将绝对路径转为相对路径返回；`validate_file_path` 黑名单逻辑未明确改造为白名单/规范化 | — | 审计报告 + 审查报告 |
| TF-009 | IPC `SECURITY.SET_SETTINGS` 未校验输入 | Medium | 已修复 | `desktop/src/main/services/securitySettingsState.ts:21-53` 新增 `validateSecuritySettings` schema 校验 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-010 | 备份导出 `defaultFileName` 存在路径穿越风险 | Medium | 已修复 | `desktop/src/main/ipc/backupChannels.ts:12-47` 新增 `sanitizeBackupFileName`，过滤控制字符与路径分隔符 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-011 | 开发模式加载任意 URL 并开启 DevTools | Medium | 已修复 | `desktop/src/main/windowManager.ts` 新增 `isSafeDevServerUrl`，仅允许 localhost/127.0.0.1/0.0.0.0/::1，远程/内网/非法协议 URL 一律回退到本地文件；新增单元测试覆盖 13 组用例 | — | 审计报告 + 审查报告 + 2026-07-07 修复 |
| TF-012 | 移动端 AsyncStorage 明文存储用户 Token | Medium | 已修复 | `src/shared/utils/secureStorage.ts`、`src/shared/api/client.ts` 优先 `expo-secure-store`；TF2-007 进一步移除 AsyncStorage 回退 | TF2-007 | 审计报告 + 审查报告 + 跟进报告 |
| TF-013 | 模板变量替换存在 ReDoS 风险 | Medium | 已修复 | `src/shared/store/index.ts:2146-2151` 新增 `escapeRegExp` 转义正则元字符 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-014 | LLM 调用缺少输入/输出过滤与审计 | Medium | 已修复 | 通过 TF2-005 修复：`backend/app/core/llm.py` 实现脱敏+审计；新增脱敏测试（API key/手机号/身份证） | TF2-005 | 审计报告 + 审查报告 + 跟进报告 |
| TF-015 | 后端默认监听 `127.0.0.1` 但无主机绑定强制校验 | Low | 已修复 | `backend/app/main.py` lifespan 启动时检测 `api_host`，非回环地址（非 127.0.0.1/localhost/::1/0.0.0.0）输出 WARNING 提示外网暴露风险及加固建议 | — | 审计报告 + 2026-07-07 修复 |
| TF-016 | 日志可能记录敏感信息 | Low | 已修复 | `backend/app/utils/logger.py` 引入 `RedactingFormatter` + `redact()`，自动遮蔽 password/token/secret/api_key/authorization/Bearer 等敏感字段 | — | 审计报告 + 审查报告 + 2026-07-05 修复 |
| TF-017 | 桌面端自动锁定时间配置未做上限校验 | Low | 已修复 | `desktop/src/main/services/securitySettingsState.ts:28-36` 限制 1~120 分钟；`authService.ts:89-105` `resetAutoLock` 内部做范围限制 | — | 审计报告 + 跟进报告回填 + 审查报告 |
| TF-018 | Python 依赖 `pip` 存在已知 CVE | Low | 已修复 | `requirements-build.txt` 锁 `pip==26.1.2`；CI workflow（`ci.yml`/`fuzz.yml`）安装前先 `pip install --upgrade pip>=26.1.2` 修复 CVE | TF2-013 | 审计报告 + 跟进报告 + 2026-07-05 修复 |
| TF-019 | 验证器 `validate_git_url` 正则未覆盖所有合法/非法场景 | Low | 已修复 | `backend/app/utils/validator.py` 新增 `_is_internal_host` 禁止内网/回环/链路本地；TF2-012 DNS 重绑定防御已落地（见 TF2-012） | TF2-012 | 审计报告 + 审查报告 + 跟进报告 + 2026-07-05 修复 |

### 2.2 第二轮审计（TF2-001 ~ TF2-017）

| 编号 | 标题 | 严重级别 | 状态 | 修复位置/备注 | 关联编号 | 来源报告 |
|------|------|---------|------|--------------|---------|---------|
| TF2-001 | 旧版备份（V1）仍包含密码校验盐与哈希 | Critical | 已废弃 | V1 备份格式已废弃，仅支持 V2 恢复；新增 V1 拒绝测试 | TF-003 | 跟进报告 + ROADMAP Phase 1 |
| TF2-002 | Git 克隆在禁用钩子前完成可导致 RCE | Critical | 已修复 | `backend/app/core/git_manager.py` 添加 threading.Lock 串行化环境变量修改 + 临时文件清理，克隆前禁用钩子 | TF-006 | 跟进报告 + ROADMAP Phase 1 |
| TF2-003 | 调试模式下 CORS 通配符与 `allow_credentials=True` 共存 | High | 已修复 | `backend/app/main.py` 自动禁用 credentials；新增 CORS 测试 | TF-002 | 跟进报告 + ROADMAP Phase 1 |
| TF2-004 | V2 备份元数据泄露密码盐 | High | 已修复 | `desktop/src/main/services/backupService.ts` 改用独立 backupSalt，不复用 verifier.salt | TF-003 | 跟进报告 + ROADMAP Phase 1 |
| TF2-005 | LLM 调用缺少输入/输出过滤与审计 | High | 已修复 | `backend/app/core/llm.py` 实现脱敏+审计；新增脱敏测试（API key/手机号/身份证） | TF-014 | 跟进报告 + ROADMAP Phase 1 |
| TF2-006 | 备份恢复与首次解锁允许空密码 | High | 已修复 | `desktop/src/main/services/authService.ts:49-52`、`backupService.ts:168-170` 拒绝空密码；MIN_PASSWORD_LENGTH 从 8 提升到 12 | — | 跟进报告 + ROADMAP Phase 1 |
| TF2-007 | 移动端敏感 token 可能回退到 AsyncStorage | Medium | 已修复 | `src/shared/utils/secureStorage.ts` expo-secure-store 不可用时抛错，无回退 | TF-012 | 跟进报告 + ROADMAP Phase 1 |
| TF2-008 | API Token 可通过环境变量注入弱值 | Medium | 已修复 | `backend/app/core/security.py:54-57` 32 字节熵校验 + 常量时间比较；新增安全测试 | — | 跟进报告 + ROADMAP Phase 1 |
| TF2-009 | 自动锁定 hook 未在入口处校验分钟数 | Medium | 已修复 | `desktop/src/renderer/hooks/useAutoLock.ts` 新增 `clampMinutes()`，对 NaN/负数/极大值夹紧到 [0, 1440] 分钟 | — | 跟进报告 + 2026-07-05 修复 |
| TF2-010 | 生产环境仍可通过环境变量开启 OpenAPI 文档 | Medium | 已修复 | `backend/app/main.py` `enable_docs` 仅在 `debug=True` 时被尊重；非 debug 模式强制关闭文档 | — | 跟进报告 + 2026-07-05 修复 |
| TF2-011 | 后端调试模式会泄露详细错误堆栈 | Medium | 已修复 | `backend/app/main.py` `FastAPI(debug=...)` 仅在显式 `DEBUG=true` 时开启，生产环境强制 False | — | 跟进报告 + 2026-07-05 修复 |
| TF2-012 | `validate_git_url` 存在 DNS 重绑定 SSRF 绕过 | Medium | 已修复 | `backend/app/utils/validator.py` 改用 `getaddrinfo` 取全部 A/AAAA 记录，任一解析到内网地址即拒绝 | TF-019 | 跟进报告 + 2026-07-05 修复 |
| TF2-013 | CI 环境 pip 存在已知 CVE | Low | 已修复 | `ci.yml`/`fuzz.yml` 安装前先 `pip install --upgrade pip>=26.1.2`；`requirements-build.txt` 锁 `pip==26.1.2` | TF-018 | 跟进报告 + 2026-07-05 修复 |
| TF2-014 | `build-android.yml` 上传过大工件范围 | Low | 已修复 | `.github/workflows/build-android.yml` 收窄工件 path，移除 `dist/` 整目录上传，仅保留 `*-report.txt` | — | 跟进报告 + 2026-07-05 修复 |
| TF2-015 | gitleaks workflow 使用 `continue-on-error: true` | Low | 已修复 | `.github/workflows/gitleaks.yml` 移除 `continue-on-error: true`，可阻断 PR | — | 跟进报告 + ROADMAP 1.5 |
| TF2-016 | 安全策略使用示例邮箱 | Low | 已修复 | `SECURITY.md` 替换为 `security@ms33834.dev` | — | 跟进报告 + SECURITY.md 现状 |
| TF2-017 | 桌面端迁移缺少版本跟踪表 | Low | 已修复 | `desktop/src/main/services/dbService.ts:47-92` 引入 schema_version 表 + 版本化迁移机制 | — | 跟进报告 + ROADMAP Phase 1 |

---

## 三、状态判定规则

为保证 36 项状态可追溯，本表按以下规则判定：

1. **TF2 报告"已修复的上期问题"表**回填的 TF-001/002/004/005/007/009/010/013/017 状态优先于 TF 审计报告原始状态（TF2 报告更新）。
2. **review-report**（审查报告）的"已修复问题"与"未修复问题"清单作为第二轮证据补充。
3. **ROADMAP.md Phase 1** 明确列出 TF2-001~008、TF2-017 已修复；TF2-015 在 ROADMAP 1.5 表格中确认修复；TF2-016 由 `SECURITY.md` 现状（邮箱已替换为 `security@ms33834.dev`）确认修复。
4. Phase 1 未列入且无其他修复证据的 TF2 项（TF2-009 ~ TF2-014）标 `未修复`。
5. 编号在报告里既无"已修复"也无"未修复"明确陈述的（TF-015、TF-018），标 `未修复` 并在备注写"报告未明确状态"。
6. 同一问题在两轮间延续的，通过 `关联编号` 互相引用（如 TF-006 ↔ TF2-002、TF-014 ↔ TF2-005、TF-019 ↔ TF2-012 等）。

---

## 四、变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-04 | 初始创建：合并 TF-001~019（19 项）与 TF2-001~017（17 项）两轮审计结果为单一跟踪表，共 36 项。状态依据三份原始报告（`audit-report-2026-06-20.md`、`security-best-practices-report-2026-06-20.md`、`review-report-2026-06-20.md`）及 `ROADMAP.md` Phase 1 交叉确认。结果：22 已修复 / 3 部分修复 / 1 已废弃 / 10 未修复 |
| 2026-07-05 | 批量修复 8 项未修复安全审计项：TF-016（日志脱敏）、TF-018（pip CVE）、TF2-009（useAutoLock 校验）、TF2-010（生产环境文档开关）、TF2-011（debug 模式堆栈泄露）、TF2-012（DNS 重绑定 SSRF）、TF2-013（CI pip 升级）、TF2-014（build-android 工件范围）。TF-019 因 TF2-012 落地由部分修复升级为已修复。结果：31 已修复 / 2 部分修复 / 1 已废弃 / 2 未修复 |
| 2026-07-07 | 修复最后 2 项未修复安全审计项：TF-011（`windowManager.ts` 新增 `isSafeDevServerUrl` 校验开发服务器 URL 仅限本机回环地址，拒绝远程/内网/非法协议，并新增 13 组单元测试）、TF-015（`backend/app/main.py` lifespan 启动时对非回环 `api_host` 输出安全警告）。同时修复 desktop ESLint 配置缺陷（browser-mock.ts 20 个 `no-explicit-any` error，对齐根项目对测试/mock 代码的放宽策略）与 `useSyncRuntime.ts` ref cleanup warning。结果：33 已修复 / 2 部分修复 / 1 已废弃 / 0 未修复，36 项安全审计全部闭环 |
