# Security Policy

## Supported Versions

The following versions of TaskFlow are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in TaskFlow, please report it responsibly.

- **Do not** open a public issue for security vulnerabilities.
- Email the maintainer at [security@ms33834.dev](mailto:security@ms33834.dev) with details.
- Include steps to reproduce, affected versions, and any suggested fixes.

We aim to respond within 7 days and release a patch within 30 days for confirmed vulnerabilities.

## Security Practices

TaskFlow follows these security practices:

- Local-first architecture with optional end-to-end encrypted synchronization.
- Web app persists to IndexedDB; the vault is encrypted with the Web Crypto API
  (AES-256-GCM) and the key is derived from the master password via PBKDF2-SHA256.
  There is no native encrypted disk (SQLCipher) — encryption happens in the browser.
- Sensitive settings protected by user-defined lock methods (master password,
  in-memory unlock state; the web build has no OS biometric unlock).
- **Master password rotation**: Settings → Security → Change master password
  validates the old password, derives a new verifier, and clears the in-memory
  key cache. Previously exported encrypted backups still need the old password
  to restore — the new password only protects backups generated after the change.
- **Brute-force cooldown**: three consecutive wrong passwords trigger a 30-second
  lockout (`failedAttempts` + `lockedUntil`), reset on successful unlock.
- **Auto-lock**: configurable to off / 1 / 5 (default) / 15 / 30 / 60 minutes of
  inactivity, or manual via `Mod+L` / the top-bar lock button.
- **Clipboard auto-clear**: copying a vault field clears the system clipboard
  after a configurable delay (default 30 s) — the copy button shows a countdown.
- **Danger zone** (Settings, red-bordered, two-step confirm): "clear all data"
  wipes tasks / vault / projects / categories / tags / search history / sync
  identity but keeps the master password and existing backups; "factory reset"
  additionally deletes the master password and security settings, then reloads
  to first-run state (existing encrypted backups still recover with the old
  password).
- Automated secret scanning via gitleaks in CI (default rules enabled).
- Dependency review and OSSF Scorecard monitoring enabled.
- Property-based fuzz testing with Hypothesis (see [docs/fuzzing.md](docs/fuzzing.md)).
- All changes require PR review before merge.

## Audit Findings Tracker

TaskFlow has completed two rounds of security audits (TF-001~019 and TF2-001~017), totaling 36 findings. The unified status of all findings is tracked in [docs/security/SECURITY_TRACKER.md](docs/security/SECURITY_TRACKER.md), which serves as the single source of truth.

## Disclosure Policy

Once a fix is released, we will publish a security advisory and credit the reporter unless they prefer to remain anonymous.
