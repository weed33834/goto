# 分支保护设置

本文件记录 `main` 分支的保护规则。该规则已启用，后续所有变更必须通过 Pull Request 合并。

## 当前配置

| 控制项 | 状态 | 说明 |
|-------|------|------|
| 禁止 force push | ✅ | `allow_force_pushes=false` |
| 禁止删除 | ✅ | `allow_deletions=false` |
| 要求 PR review | ✅ | `required_approving_review_count=1` |
| 要求分支最新 | ✅ | `required_status_checks[strict]=true` |
| 要求 status check | ✅ | `Lint`、`Backend Tests & Fuzz`、`Verify Project Setup` |
| 禁止管理员绕过 | ✅ | `enforce_admins=true` |

## 验证

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/MS33834/taskflow/branches/main/protection" \
  | jq '.enforce_admins.enabled'
```

返回 `true` 表示管理员也无法绕过分支保护规则。

## 说明

- 该配置于 2026-06-20 生效。
- 若后续需要调整，请通过 GitHub API 或仓库 Settings 修改，并同步更新本文件与 `cii-best-practices.md`。
