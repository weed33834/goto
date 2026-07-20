# Goto architecture

Notes for someone reading the code for the first time. Read this
top-to-bottom for the tour; the table of contents below is for
navigation.

> **Architecture reality check**: Goto is currently a **pure
> browser Web application** plus a backend API and a relay service.
> There is **no** React Native / Expo mobile app and **no** Electron
> desktop shell in this repository. The Web app (`desktop/`) is a Vite
> + React 18 single-page app; it persists to **IndexedDB** (not
> SQLite/SQLCipher) and performs encryption in the browser via the
> **Web Crypto API** (AES-256-GCM, key derived from the master password
> with PBKDF2-SHA256). Older docs that mention "mobile", "Electron",
> "SQLCipher", "AsyncStorage", or `app.config.ts` describe a previously
> removed architecture and are obsolete.

## Contents

1. Components at a glance
2. Web app layering
3. State model
4. Types
5. Components & theme
6. Persistence & crypto (Web Crypto / IndexedDB)
7. Dual data layer (local-first vs backend REST)
8. Sync subsystem (E2EE)
9. Relay
10. Backend
11. Conventions

## 1. Components at a glance

```
desktop/    Pure-browser Web app  (Vite + React 18 + Zustand 4 + TS 5)
backend/    REST API              (FastAPI + Python 3.11+)
relay/      WebSocket relay       (Node.js 18+, forwards ciphertext only)
```

The three are independent processes. The Web app can run fully
offline against IndexedDB; the backend is an optional remote store,
and the relay is an optional middleman for E2EE device-to-device sync
when peers can't reach each other directly.

## 2. Web app layering

`desktop/src/` has two trees:

```
desktop/src/renderer/   # React UI entry (App.tsx, pages, components) — Vite root
desktop/src/shared/     # domain logic, shared by the renderer
    api/                # backend REST client (tasks)
    components/         # presentational + view components
    hooks/              # reusable stateful logic (incl. useSyncRuntime)
    store/              # Zustand store (single source of truth)
    sync/               # E2EE sync protocol (Web Crypto based)
    types/              # TypeScript types for every persisted shape
    utils/              # secureStorage, crypto helpers
renderer/lib/webAPI.ts  # local-first data access layer → IndexedDB
```

Hard rule: `components/` never imports navigation state directly and
stays free of store mutations where possible; the store is the single
source of truth and may be imported anywhere.

## 3. State model

A single Zustand store (`shared/store/index.ts`) composes ~20 slice
creators (`shared/store/slices/`) into one `useAppStore`. Consumers read
state via `useAppStore(s => s.xxx)`. The dataset is small (<5k tasks for
any realistic user), so a single store (not store-per-domain) avoids
cross-store selector fiddliness while keeping one source of truth.

Tasks are kept as a flat array (matches list rendering; lookups are
cheap at this scale). Computed values (filtered/sorted views) live in
components via `useMemo`, keeping the store dumb.

## 4. Types

Every persisted shape lives in `shared/types/index.ts`. The store and
components reference these types; no parallel type system. The `Task`
interface is the largest (~25 fields); most fields are nullable
(`dueDate: Date | null`) because most tasks have no due date.

## 5. Components & theme

`shared/components/` splits into `common/` (generic UI primitives) and
`views/` (Kanban, Gantt, Timeline, Table, TimeBlock, MindMap — they know
about tasks but not navigation). Components worth memoizing (`React.memo`)
are the list rows and view cards.

A single `Theme` object lives in the store; all colors are read from it
via token names (`text`, `surface`, `border`, `priorities.{level}`,
`status.{status}`). Don't hardcode hex.

## 6. Persistence & crypto (Web Crypto / IndexedDB)

There is **no** native encrypted database. The Web app persists the
Zustand store to **IndexedDB** (via `renderer/lib/webAPI.ts` and the
storage helpers in `shared/utils/`). The *vault* (sensitive fields) is
additionally encrypted **in the browser**:

- Master key derived from the master password via **PBKDF2-SHA256**.
- Vault records encrypted with **AES-256-GCM** (Web Crypto API).
- Without the master password the vault ciphertext is unusable; there
  is no OS biometric gate in the Web build (no Touch ID / Windows Hello
  in-browser — that was an Electron-era feature and does not exist here).

The backend, by contrast, stores data server-side and authenticates with
a **Bearer token read from a local file** (`get_or_create_api_token`).
There is **no** login endpoint; the Web client currently has no code path
that fetches/refreshes that token, so end-to-end sync over the backend
REST API is not wired up in the UI today.

## 7. Dual data layer (local-first vs backend REST)

Two data-access paths coexist in the Web app:

- **Local-first (`renderer/lib/webAPI.ts`)** — talks to IndexedDB.
  Used by the vault, auth/bootstrap, backup/export, and the sync panel.
- **Backend REST (`shared/api/*`)** — `client.ts`/`tasks.ts` talk to the
  FastAPI backend. Used by the task store/actions.

This split is intentional (local-first by default, optional remote
store) but means "tasks" and "vault/backup/sync" currently persist
through different layers. See `shared/store/` for how slices dispatch to
each.

## 8. Sync subsystem (E2EE)

Device-to-device sync is end-to-end encrypted and lives entirely under
`shared/sync/` (Web Crypto based — there is no separate Node-crypto
desktop service anymore, since the only client is the browser). A hook,
`useSyncRuntime` (`shared/hooks/useSyncRuntime.ts`), glues the store's
sync slice to `pairingService`'s side effects. Cancellation captures the
latest WebSocket reference and `close()`-s it, which triggers
`finish()` and tears down the session/outbox.

> **Honest status**: device pairing over the relay is wired up on the
> Web side. `webAPI.sync.claimPairingCode` calls through to
> `pairingService.claimPairingCodeAndPair`, which claims the code via
> the relay HTTP API, opens a WebSocket, completes the Ed25519 + ECDH
> handshake, receives the SMK_TRANSFER, decrypts it, and persists the
> paired device via `useAppStore.getState().addPairedDevice`. The
> responder side (`generatePairingCode` + `respondToPairing`) is not
> yet wired into `webAPI.sync.generatePairingCode`, which still returns
> a locally-generated placeholder code rather than a relay-issued
> 8-digit code, so a Web client can currently only be the *claimer*
> (initiator), not the *responder*.

### Protocol stack

```
identity    Ed25519 long-term keypair per device.
            Private key: stored in IndexedDB (wrapped by the vault key).
            deviceId = sha256(raw SPKI pubkey), first 16 hex.

handshake   HELLO → OFFER → ANSWER.
            X25519 ephemeral keys do ECDH; both sides Ed25519-sign
            deviceId ‖ peerDeviceId ‖ nonce ‖ peerNonce ‖ ecdhPub
            to bind identity into the transcript (MITM resistance).

derive      HKDF-SHA256 from the ECDH shared secret, info =
            'taskflow-sync-v1|initiator→responder' (role-bound).
            Two keys: sendKey / receiveKey, direction-isolated.

records     Sync Master Key (SMK) does AES-256-GCM.
            Wire: iv[12] ‖ authTag[16] ‖ ciphertext.
            SMK generated by the pairing host, transferred to the
            joiner over the encrypted pairing session, then
            constant-time compared. Mismatch → reject pairing.

conflict    updatedAt (last-write-wins) first. If timestamps tie,
            version vectors (deviceVersion: a counter per device)
            decide causal order. Truly concurrent edits fall back
            to version, then id lexicographic order.

transport   9 message types: HELLO/OFFER/ANSWER/MANIFEST/REQUEST/
            BATCH/ACK/ERROR/SMK_TRANSFER.
            Frame: mode[1] ‖ length[4 BE] ‖ payload.
            Replay protection: 8-byte BE sequence number + sliding
            window (default 64). Handshake timeout: 30s.
```

### Engine flow

```
session 'ready'
  → send MANIFEST (record id → hash of encrypted payload)
  → receive peer MANIFEST, diff against local
  → REQUEST missing ids (chunked at 500)
  → peer responds BATCH (chunked at 500, each entry pendingAcks)
  → ACK on apply
  → done when: localManifestSent && remoteManifestReceived
               && pendingRequests == 0 && pendingAcks == 0
```

The 5000-record benchmark sits at 649 ms (7699 rec/s). Two fixes got us
there from 52 s: REQUEST is chunked at `MAX_REQUEST_IDS`, and
`handleBatch` validates + collects in memory then commits once via
`store.applyBatch()`.

### Runtime

`SyncPeerManager` owns live peer connections; each peer is a
`SyncPeerController` finite state machine
(`connecting → handshaking → syncing ↔ idle`, `error`/`closed`
terminal). `SyncScheduler` sits above it (priority `scheduled <
broadcast < manual`, `maxConcurrency` default 2). `TransportRouter`
picks LAN or relay: short-timeout TCP probe to the LAN peer (default
800ms), direct if reachable, relay fallback otherwise.

## 9. Relay

The relay (`relay/`) is a small Node.js + WebSocket service. Its only
job is to forward ciphertext frames between two paired devices that
can't reach each other directly. It **cannot decrypt anything** — it
never has the SMK, the session keys, or the device private keys.

```
relay/src/
  index.ts        # entry
  server.ts       # HTTP + WS server setup
  routes.ts       # REST: register-device, pairing-codes, claim, refresh
  wsRelay.ts      # /sync WebSocket relay with offline queue
  auth.ts         # bearer token validation
  identity.ts     # Ed25519 signature verification on register/pair
  store.ts        # in-memory state (devices, pairing codes, tokens, outbox)
  connectionManager.ts  # track live WS connections per device
```

### What it stores
- **Devices**: public key, deviceId, registration timestamp.
- **Pairing codes**: 8-digit, 5-minute TTL, one-shot.
- **Bearer tokens**: issued on register/claim, TTL-bounded, refreshable.
- **Offline outbox**: encrypted frames for an offline peer. 7-day TTL,
  64 MB / 10000 frames per peer.

### Auth
`Authorization: Bearer <token>` header, plus a `?token=<token>` query
param for cross-platform compatibility (the Web client uses the header).
Registration and pairing-code claims require an Ed25519 signature over
`deviceId:timestamp:purpose`; the relay rejects timestamps outside ±60s.

### Deployment
Self-hosted via Docker (`relay/docker-compose.yml`). TLS terminates at
Nginx; see `docs/relay-deployment.md` for the full setup.

## 10. Backend

`backend/` is a FastAPI (Python 3.11+) REST service. It exposes the task
API consumed by `shared/api/*`. Authentication is a static **Bearer
token** read from a local file (`get_or_create_api_token`); there is no
user/login flow. The Web client does not currently acquire this token,
so the backend REST path is present in code but not end-to-end wired in
the UI.

## 11. Conventions

- No `any` outside `types/index.ts` and store action signatures; ESLint
  enforces this as a warning.
- All dates are `Date` in memory, ISO strings in storage.
- IDs are `nanoid`-style strings. Don't try to make them short.
- Comments explain *why*, not *what*.
- The Web app builds to `desktop/dist/renderer` (Vite `outDir`). Deploy
  that directory to GitHub Pages (see `.github/workflows/web-deploy.yml`).
