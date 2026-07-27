# Security Policy

## Supported Versions

The following versions of Goto are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Goto, please report it responsibly.

- **Do not** open a public issue for security vulnerabilities.
- Email the maintainer at [security@goto.app](mailto:security@goto.app) with details.
- Include steps to reproduce, affected versions, and any suggested fixes.

We aim to respond within 7 days and release a patch within 30 days for confirmed vulnerabilities.

## Security Practices

Goto follows these security practices:

- **Local-first architecture**: data lives in the browser's IndexedDB by default.
  Optional end-to-end encrypted synchronization via a self-hosted relay.
- **Master password**: verifier stored as argon2id(m=64MB t=3 p=4) hash;
  the password itself is never persisted. Legacy PBKDF2-SHA256 verifiers are
  still recognized for migration (verified once, then upgraded to argon2id).
- **Vault encryption**: sensitive fields encrypted in-browser with AES-256-GCM
  (Web Crypto API); the wrapping key is generated on first run and persisted
  to IndexedDB. Storage keys are bound as AAD to prevent ciphertext relocation.
- **Encrypted backups**: binary format with `GTFB` magic header;
  argon2id(m=64MB t=3 p=4) + AES-256-GCM by default; legacy PBKDF2-SHA256
  (600k iterations) backups readable for migration.
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
- **E2EE sync**: AES-256-GCM under a Sync Master Key; the relay only ever sees
  ciphertext. X25519 ECDH for session keys, Ed25519 for device identity,
  HKDF-SHA256 with role-bound info string for direction isolation. Replay
  protection via sequence numbers + sliding window. Pairing codes are 8-digit,
  5-minute TTL, one-shot.
- Property-based fuzz testing with Hypothesis (see [docs/fuzzing.md](docs/fuzzing.md)).
- All changes require PR review before merge.

## Disclosure Policy

Once a fix is released, we will publish a security advisory and credit the
reporter unless they prefer to remain anonymous.
