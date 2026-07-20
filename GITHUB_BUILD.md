> ⚠️ **架构已废弃**：本文档提及的 `build-android.yml`、`eas-build.yml`（Expo / EAS）等属于已删除的 Electron / 移动端架构，当前仓库已不存在对应构建。当前 TaskFlow 为**纯浏览器 Web 应用**（仓库 `desktop/`），相关 CI/CD 以 `ci.yml` 与 `web-deploy.yml` 为准。详见 [README.md](./README.md) / [ARCHITECTURE.md](./ARCHITECTURE.md)。

# GitHub Actions

The build- and deploy-related workflows under `.github/workflows/`.
(Security and housekeeping workflows — `codeql.yml`, `gitleaks.yml`,
`scorecard.yml`, `dependency-review.yml`, `stale.yml`, `fuzz.yml` —
run separately and aren't covered here.)

## `verify.yml`

Runs on every push and PR. Does:
- `npm ci` (uses the lockfile, fast)
- `npx tsc --noEmit` (the typecheck step)

Linting runs in `ci.yml` (the `Lint` job), not here. If either is red,
the PR isn't getting merged. Should take ~1 minute.

## `build-android.yml`

Builds a debug APK on every push to `main` and uploads it as an
artifact. Doesn't need any secrets. Useful for grabbing a recent
build without setting up Android Studio locally.

Note: this builds a **debug** APK, which is signed with the default
debug key and won't pass Play Store review. For a release build, use
EAS.

## `eas-build.yml`

Thin wrapper around `eas build`. Needs the `EXPO_TOKEN` secret set
in the repo settings. By default it builds the `preview` profile for
Android on every push to `main`. Override the profile in the
workflow's `with:` block if you need production.

## `pages-intro.yml`

Publishes the static project intro page (everything under `docs/`)
to GitHub Pages. Steps:

1. `actions/configure-pages` sets up the Pages environment
2. `actions/upload-pages-artifact` uploads `docs/` as the Pages artifact
3. `actions/deploy-pages` deploys it

Triggers on pushes to `main` that touch `docs/**` or the workflow
file itself, plus `workflow_dispatch`.

This workflow ships the **intro page only** — it does not build or
deploy the web app. The actual app must be run locally (see
[QUICK_START.md](QUICK_START.md)). If you want the web bundle on
GitHub Pages, you'd need to host `dist/` (from `npm run build:web`)
yourself; nothing in the repo automates that today.

## Triggering manually

Any of the above can be triggered from the Actions tab → select the
workflow → "Run workflow". The `pages-intro.yml` workflow is also
safe to re-run after fixing the intro page; it republishes `docs/`.

## Local equivalent of the verify workflow

```bash
npm ci
npm run typecheck
npm run lint
```

If you can run those three, the verify job will be green.
