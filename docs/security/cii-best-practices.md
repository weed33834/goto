# OpenSSF CII Best Practices 合规说明

TaskFlow 正在积极满足 [OpenSSF Best Practices Badge](https://www.bestpractices.dev/) Passing 级要求。本文件记录当前已满足的关键实践、待补齐项，并指引维护者完成在线申请。

## 已满足的 Passing 级关键实践

| 实践领域 | 状态 | 说明 |
|---------|------|------|
| 公开源码仓库 | ✅ | GitHub 主仓公开可读，所有源码纳入版本控制 |
| 版本控制 | ✅ | 使用 Git，提交历史完整可追溯 |
| FLOSS 许可证 | ✅ | 仓库根目录包含 [LICENSE](../../LICENSE)（MIT） |
| 项目网站/介绍 | ✅ | GitHub Pages 介绍页 + [README](../../README.md) |
| 基本文档 | ✅ | README、QUICK_START.md、SECURITY.md、CHANGELOG.md |
| 安装说明 | ✅ | README / QUICK_START.md 提供 `npm install` 等步骤 |
| 构建说明 | ✅ | README / QUICK_START.md 提供 `npm run build:web` 等步骤 |
| 行为准则 | ✅ | [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) |
| 贡献指南 | ✅ | [CONTRIBUTING.md](../../CONTRIBUTING.md) + [.github/CONTRIBUTING.md](../../.github/CONTRIBUTING.md) |
| 安全报告机制 | ✅ | SECURITY.md 提供漏洞报告方式 |
| 已知漏洞记录 | ✅ | README "Known caveats" 与 [安全审计报告](./audit-report-2026-06-20.md) 已记录已知问题；SECURITY.md 提供报告入口 |
| 可重复构建说明 | ✅ | 依赖通过 `package-lock.json` / `requirements.txt` 锁定，使用 `npm ci` 与 `pip install -r requirements.txt` 可复现安装；Release 工作流生成固定产物与 SHA256SUMS |
| 依赖扫描 | ✅ | Dependency Review（PR 级漏洞扫描，最新运行已通过）、CodeQL；依赖更新由维护者手动管理 |
| SAST | ✅ | CodeQL 工作流持续扫描（最新运行已通过） |
| 静态分析与测试 | ✅ | pytest 单元/集成测试 + hypothesis fuzz 测试 + ESLint |
| CI/CD 最小权限 | ✅ | workflow 使用最小 permissions |
| Pin 依赖 Action | ✅ | 所有 GitHub Actions 使用 commit SHA pin |
| 输入校验 | ✅ | 后端路径、URL、分类均经过校验 |
| 加密存储 | ✅ | 桌面端 AES-256-GCM + SQLCipher |
| 发布流程 | ✅ | `.github/workflows/release.yml` 在推送 `v*` 标签时构建桌面端并创建 GitHub Release |
| 签名发布 | ✅ | Release 工作流使用 cosign 对产物进行 keyless 签名 |

## 分支保护与代码审查

| 控制项 | 状态 | 说明 |
|-------|------|------|
| 禁止 force push | ✅ | `main` 分支保护已启用 `allow_force_pushes=false` |
| 要求 PR review | ✅ | `required_pull_request_reviews[required_approving_review_count]=1` |
| 要求 status check | ✅ | 要求 `Lint`、`Backend Tests & Fuzz`、`Verify Project Setup` 均通过，详见 [branch-protection-setup.md](./branch-protection-setup.md) |
| 禁止管理员绕过 | ✅ | `enforce_admins=true` 已启用 |

> 所有变更必须通过 Pull Request 合并，详见 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与 [branch-protection-setup.md](./branch-protection-setup.md)。

## 待完成事项

1. **在线申请 Badge（需仓库所有者手动登录完成）**
   - 访问 https://www.bestpractices.dev/
   - 使用 GitHub 账号（MS33834）登录并授权
   - 点击 "Add New Project"，填入仓库 URL `https://github.com/MS33834/taskflow`
   - 选择 metal 系列 Passing 级，依据本文件表格填写各条准则
   - 完成表单后系统会分配项目 ID，将 README 中 badge 链接的 `?q=...` 替换为真实项目页链接
   - **当前状态**：尚未创建项目，搜索 `MS33834/taskflow` 返回 Zero Projects

2. **启用管理员不可绕过**
   - 由仓库管理员运行 [branch-protection-setup.md](./branch-protection-setup.md) 中的命令，将 `enforce_admins` 设为 `true`
   - **注意**：执行后管理员也无法直接 push `main`，请在所有必要变更合并后再启用

3. **发布与签名（已完成 v0.1.1）**
   - ✅ 已推送 `v0.1.1` 标签并触发 `.github/workflows/release.yml`
   - ✅ GitHub Release、SHA256SUMS.txt 与 cosign 签名已生成
   - 参考 [release-signing.md](./release-signing.md) 验证签名

## 参考链接

- [OpenSSF Best Practices Criteria](https://www.bestpractices.dev/en/criteria)
- [TaskFlow Security Audit Report](./audit-report-2026-06-20.md)
- [Release 签名验证说明](./release-signing.md)
- [分支保护设置命令](./branch-protection-setup.md)
