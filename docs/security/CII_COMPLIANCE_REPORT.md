# OpenSSF CII Best Practices 合规审计报告

> **自动生成**：由  在每次推送 main 或每周一 09:00 UTC 自动运行。
> **生成时间**：2026-07-16 00:57:35 UTC
> **运行编号**：[29462858957](https://github.com/bad-hope/taskflow/actions/runs/29462858957)

## 总览

| 指标 | 值 |
|------|----|
| 通过项 | 15 / 18 |
| 未通过项 | 3 |
| 通过率 | 83% |

本报告替代 [bestpractices.dev](https://www.bestpractices.dev/) 在线填表，
用代码侧自动审计保证合规状态实时反映仓库实际情况。

## 详细检查结果

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 公开源码仓库 | ✅ PASS |
| 2 | 版本控制 | ✅ PASS |
| 3 | FLOSS 许可证 | ✅ PASS (CNCL-1.0) |
| 4 | 项目网站/介绍 | ✅ PASS (README + Pages) |
| 5 | 基本文档 | ✅ PASS (README/SECURITY/CHANGELOG) |
| 6 | 安装说明 | ✅ PASS |
| 7 | 构建说明 | ✅ PASS |
| 8 | 行为准则 | ✅ PASS |
| 9 | 贡献指南 | ✅ PASS |
| 10 | 安全报告机制 | ✅ PASS |
| 11 | 已知漏洞记录 | ✅ PASS (docs/security/) |
| 12 | 可重复构建说明 | ✅ PASS (lockfile + requirements.txt) |
| 13 | 依赖扫描 | ✅ PASS (Dependency Review，依赖更新手动管理) |
| 14 | SAST | ✅ PASS (CodeQL) |
| 15 | 静态分析与测试 | ❌ FAIL: 缺 ESLint 或 Vitest |
| 16 | CI/CD 最小权限 | ✅ PASS (workflow 显式声明 permissions) |
| 17 | Pin 依赖 Action | ❌ FAIL: 部分 action 未用 SHA pin |
| 18 | 分支保护 | ❌ FAIL: main 未启用分支保护（或 token 无权限读取） |

## 实施细节

审计脚本检查 18 项 Passing 级关键实践，对应
[cii-best-practices.md](./cii-best-practices.md) 中的合规表格。
每项检测逻辑见 workflow 文件  的
 step。

### 与 bestpractices.dev 的关系

本报告是 bestpractices.dev 在线申请的**代码侧替代方案**：
- 维护者无需手动登录 bestpractices.dev 填表
- 仓库自带实时合规报告，外部用户可直接查看
- 若未来仍需 bestpractices.dev 官方徽章，可凭本报告快速填表

## 历史报告

历史报告可在 [Actions 运行记录](https://github.com/bad-hope/taskflow/actions/workflows/ossf-compliance.yml) 中查看。
