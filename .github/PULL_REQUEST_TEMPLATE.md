> **注意**：本仓库以 GitCode（https://gitcode.com/badhope/goto）为主仓库。请确认此 PR 是提交到 GitCode 主仓库的。
>
> **必须**：本仓库禁止直接向 `main` 分支 push，所有代码变更必须通过 Pull Request，并至少需要 1 个 approving review。

## What

<!-- One-paragraph description of the change. -->

## Why

<!-- Motivation. Link any issue this PR fixes (Fixes #123). -->

## How

<!-- Approach: list the changes, files touched, design decisions. -->

## Test plan

<!-- How did you verify? Which commands, which test suites? -->

- [ ] Existing tests pass
- [ ] Added tests for new behaviour
- [ ] Manually verified in dev / staging

## Security self-check

- [ ] Dependencies are pinned (lockfile updated if packages changed)
- [ ] New tests added for new behaviour, especially security-relevant code
- [ ] SECURITY.md or other security docs updated if reporting/response process changed
- [ ] No secrets, tokens, credentials, or `.env` files committed
- [ ] I ran `gitleaks` locally (or confirmed CI will run it)
- [ ] Known vulnerabilities assessed and documented if accepted
- [ ] This PR targets a feature branch, not `main` via direct push

## Risk & rollout

<!-- What can break? Is rollback straightforward? Is there a feature flag? -->

## Checklist

- [ ] My branch is up-to-date with the base branch
- [ ] I ran `gitleaks` locally (or let CI do it)
- [ ] I added / updated tests for new behaviour
- [ ] I updated documentation (README, CHANGELOG, …)
- [ ] I did **not** commit any secrets, tokens, or credentials
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

> **Never commit secrets.** If you accidentally committed a token,
> rotate it **immediately** in the provider's settings, then update
> the PR to remove the secret. See [SECURITY.md](./SECURITY.md).
