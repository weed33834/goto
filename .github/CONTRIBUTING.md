# Contributing

Thanks for your interest in contributing! This document covers the
ground rules so your PR can land quickly and cleanly.

## Branch & PR workflow

> **Direct pushes to `main` are blocked by branch protection.**

1. **Fork** (or create a feature branch if you have write access).
2. **Branch off `main`**: `git switch -c feat/short-description`
3. **Make focused commits** following
   [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: …`        — new feature
   - `fix: …`         — bug fix
   - `refactor: …`    — no behaviour change
   - `docs: …`        — documentation only
   - `chore(deps): …` — dependency bumps
   - `security: …`    — security fix
4. **Push your branch**: `git push -u origin feat/short-description`
5. **Open a Pull Request** against `main`. Fill in the PR template.
6. **Wait for CI** (desktop lint/typecheck/test/build + e2e + backend
   ruff/mypy/pytest + relay vitest on every push and PR).
7. **Squash-merge** is the default. One commit per logical change.
   The merge commit subject will become the PR title.

## Code style

- Match the existing style of the file you are editing.
- Keep diffs minimal — don't reformat unrelated code.
- Add tests for new behaviour. Bug fixes should add a regression test
  that fails on `main` and passes on your branch.
- No dead code, no commented-out code, no orphan TODO comments.

## Security

- **Never commit secrets, tokens, API keys, or `.env` files.**
  The repo has a `.gitleaks.toml` config; if you accidentally commit a
  credential, **rotate it immediately**. See [SECURITY.md](./SECURITY.md).
- Don't paste stack traces that contain real user data in issues.
- If you find a vulnerability, follow the
  [private disclosure process](./SECURITY.md) — do not open a public
  issue.

## Dependencies

- Dependency updates are managed manually by maintainers. There is no
  bot that auto-opens or auto-merges dependency PRs.
- When updating a dependency, open a normal PR, run CI, and merge after
  review.
- Major-version bumps that touch lockfiles require extra care and a
  full review.

## Issue triage

- New issues are auto-labelled **bug** / **enhancement** / **security**
  via the issue templates.
- Please use the right template. Issues without a template take longer
  to triage.

## License

By submitting a contribution, you agree that your work will be
licensed under the same license as the repository.
