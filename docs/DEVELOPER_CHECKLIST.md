# Developer Checklist

This checklist must be reviewed before every commit and pull request.
It ensures consistent quality and prevents common issues.

## Before You Start

- [ ] Pull the latest `main` branch
- [ ] Create a properly named branch (`feat/`, `fix/`, `docs/`, etc.)
- [ ] Open an issue for non-trivial changes to align on the approach

## Before Every Commit

- [ ] Code compiles/builds without errors
- [ ] Linter passes (run `make lint` or equivalent)
- [ ] Formatter applied (run `make format` or equivalent)
- [ ] No `console.log`, `print()`, or debug statements in production code
- [ ] No commented-out code blocks
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] No `any` types in TypeScript (without justification)
- [ ] No unused imports or variables
- [ ] No trailing whitespace
- [ ] Files end with a newline
- [ ] Commit message follows Conventional Commits format
- [ ] One logical change per commit

## Before Every Pull Request

- [ ] All CI checks are green
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] PR description filled out completely
- [ ] Related issue referenced (`Closes #N`)
- [ ] PR is under 400 lines of diff (split if larger)
- [ ] No merge conflicts with `main`
- [ ] Branch is up to date with `main`
- [ ] Self-reviewed your own code
- [ ] Documentation updated if needed

## Open Issues and PRs

Check regularly and address:

- [ ] Any open issues assigned to you
- [ ] Any PRs awaiting your review
- [ ] Any failing CI pipelines
- [ ] Any dependency updates to evaluate and PR manually
- [ ] Any stale branches that should be deleted

## Redundant File Check

Before pushing, verify no junk files are included:

- [ ] No `.DS_Store`, `Thumbs.db`, or OS-specific files
- [ ] No `node_modules/`, `__pycache__/`, or build output
- [ ] No `.env` files (only `.env.example`)
- [ ] No `*.log`, `*.bak`, `*.orig`, `*.swp` files
- [ ] No large binary files unless necessary
- [ ] No IDE-specific config files (`.idea/`, `.vscode/` should be gitignored)

## Update Check

Periodically verify:

- [ ] Dependencies are up to date
- [ ] Security vulnerabilities addressed
- [ ] README and documentation reflect current state
- [ ] CHANGELOG updated for releases
- [ ] License information is current

## Warning and Alert Check

Before merging:

- [ ] No new TypeScript/ESLint warnings introduced
- [ ] No new Python linter (ruff/flake8) warnings
- [ ] No deprecation warnings from dependencies
- [ ] CI pipeline is fully green (not just passing with warnings)

## Codebase Cleanup Check

Periodically audit the repository for structural hygiene:

- [ ] No empty directories (except those with `.gitkeep`)
- [ ] No duplicate files (e.g. same asset in multiple locations)
- [ ] No obsolete / orphaned files (e.g. old frontend copies after migration)
- [ ] `package.json` version matches `app.json` and documentation badges
- [ ] LICENSE file matches `package.json`, `pyproject.toml`, and README badges
- [ ] `.editorconfig` only contains language configs actually used in the project
- [ ] No misplaced files (e.g. app entry points at wrong directory level)
