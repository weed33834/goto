# GitHub Actions

The build- and deploy-related workflows under `.github/workflows/`.
The repo ships only `ci.yml`.

## `ci.yml`

Runs on every push and PR. Four parallel jobs:

- **desktop**: `pnpm install` → `typecheck` → `lint` → `test` (vitest) → `build` (vite)
- **e2e**: installs Playwright chromium, starts dev server, runs `playwright test`
- **backend**: `pip install` → `ruff` → `mypy` → `pytest`
- **relay**: `pnpm install` → `vitest`

If any job is red, the PR isn't getting merged. Full run ~3-5 minutes.

## Triggering manually

`ci.yml` can be triggered from the Actions tab → select the
workflow → "Run workflow".

## Local equivalent of the CI

```bash
# Web app
cd desktop && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build

# Backend
cd backend && pip install -r requirements.txt && ruff check . && mypy app && pytest

# Relay
cd relay && pnpm install && pnpm test
```

If you can run all three, the CI will be green.
