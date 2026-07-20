> ⚠️ **架构已废弃**：本文档描述的是已删除的 Electron / 移动端 / SQLCipher 桌面端架构。当前 TaskFlow 为**纯浏览器 Web 应用**（仓库 `desktop/`：Vite + React 18 + Zustand 4 + TypeScript 5，数据存于 IndexedDB，密钥经 Web Crypto / PBKDF2 派生）。请以 [README.md](../README.md) / [ARCHITECTURE.md](../ARCHITECTURE.md) 为准。

# TaskFlow 桌面端用户手册

本手册面向 TaskFlow 桌面端（Electron）的使用者。桌面端是 TaskFlow 的本地优先（local-first）客户端，所有数据落盘在本地、由 SQLCipher 整库加密，敏感字段再叠加一层 AES-256-GCM 加密。这份文档不只罗列功能，也会解释每个安全开关背后的设计取舍，以及你在不同平台会遇到的真实差异。

> 代码引用均使用相对路径，便于你直接对照源码。例如主进程入口在 `desktop/src/main/index.ts`。

---

## 1. 概述

### 这是什么

TaskFlow 桌面端是一个基于 Electron 的本地优先任务与密钥管理应用。它不依赖任何云端账号即可运行：任务、分类、保险库条目全部存在本地一个 SQLite 文件里，并使用 SQLCipher 做整库加密（见 `desktop/src/main/services/dbService.ts` 中的 `cipher = 'sqlcipher'` 与 `db.key(key)`）。

### 与移动端 / Web 端的关系

三端共享同一套数据模型（每个持久化对象都带 `updatedAt`）。桌面端与移动端之间可以通过两种方式互通：

- **JSON 明文导出/导入**：跨平台迁移用，驼峰字段命名，与移动端 `persistenceSlice` 兼容（见 `desktop/src/main/services/backupService.ts` 的 `exportJson`）。
- **端到端加密同步（E2EE）**：实时双向同步，数据离开设备前已加密，中继服务器无法读取。

### 核心特性一览

| 能力 | 说明 |
| --- | --- |
| 加密保险库 | AES-256-GCM 字段级加密的敏感信息存储，敏感字段单独加密后入库 |
| 隐私外壳 | 启动锁、自动锁定、隐私模式、剪贴板自动清空、截图保护、全局快捷键 |
| 生物识别 | macOS Touch ID / Windows Hello / Linux fprintd 三平台解锁 |
| E2EE 同步 | P2P 配对、LAN 优先 Relay 兜底、版本向量冲突解决、设备吊销编排 |
| 加密备份 | V2 密码保护备份，含 `keySalt`/`iv`/`ciphertext`，可跨机恢复 |

---

## 2. 安装

### 系统要求

| 平台 | 最低版本 | 备注 |
| --- | --- | --- |
| macOS | 11 (Big Sur) 及以上 | Touch ID 解锁需要支持的 Mac 机型 |
| Windows | 10 及以上 | Windows Hello 解锁需要支持的面容/指纹硬件 |
| Ubuntu | 20.04 及以上 | 生物识别需自行安装 `fprintd` 并录入指纹；截图保护为 best-effort |

### 下载与安装

构建配置见 `desktop/electron-builder.yml`（`appId: com.taskflow.app`），三平台产物如下：

- **macOS**：`.dmg` 镜像，拖入「应用程序」即可。首次启动若被 Gatekeeper 拦截，到「系统设置 → 隐私与安全性」点击「仍要打开」。
- **Windows**：`.exe`（NSIS 安装器），按向导完成安装。
- **Linux**：`.AppImage`，赋予执行权限后直接运行：
  ```bash
  chmod +x TaskFlow-*.AppImage
  ./TaskFlow-*.AppImage
  ```

### 首次启动：创建主密码

首次启动时应用没有任何 verifier（见 `desktop/src/main/services/authService.ts` 的 `hasVerifier()`），你需要创建一个主密码。主密码长度下限是 `MIN_PASSWORD_LENGTH = 12`（见 `authService.ts`），低于 12 字符会被拒绝。

> **主密码不可找回。** 没有 服务端、没有后门、没有重置邮件。一旦遗忘，数据永久不可访问。请把主密码离线记下来（比如写在纸上锁进抽屉），这比任何「找回」功能都可靠。

### 升级

覆盖安装新版本即可。应用启动解锁后会执行 `runMigrations()`（见 `desktop/src/main/services/dbService.ts`），通过 `schema_version` 表逐版本迁移（当前到 V3）。迁移对遗留库幂等，不会破坏已有数据。

### 卸载

删除应用本体之外，还需清理 userData 目录，否则加密数据库会残留在磁盘上：

- macOS：`~/Library/Application Support/TaskFlow/`
- Windows：`%APPDATA%\TaskFlow\`
- Linux：`~/.config/TaskFlow/`

数据库文件名是 `taskflow.db`，路径在 `desktop/src/main/index.ts` 中由 `app.getPath('userData')` 拼接得到。

---

## 3. 主密码与解锁

### 主密码的作用

主密码不直接加密数据库，而是通过 PBKDF2-SHA256（600000 轮、32 字节盐）派生出 master key（见 `desktop/src/main/services/cryptoService.ts` 中的 `ITERATIONS = 600000`）。这个 master key 有两个用途：

1. 作为 SQLCipher 的整库密钥（`db.key(key)`）；
2. 作为保险库敏感字段的 AES-256-GCM 字段级加密密钥（`encryptWithMasterKey` / `decryptWithMasterKey`）。

也就是说，主密码是根凭证：它解开数据库，也解开保险库字段。

### 不可找回的原因

- 派生算法是 PBKDF2 600000 轮，没有 服务端可以下发重置链接；
- verifier 只存了「密码哈希 + 盐」（`authStorage.ts` 的 `saveVerifier`），本身不能反推密码，也不能解密数据；
- master key 只在解锁后存在于内存，锁定后立即清空（`lock()` 把 `masterKey = null`）。

所以**遗忘主密码 = 数据永久不可访问**，唯一的「恢复」是卸载并重装，从一份加密备份重新导入。

### 解锁方式

启动后进入锁屏（`desktop/src/renderer/components/layout/LockScreen.tsx`），有两种解锁路径：

- **主密码**：始终可用，输入后 `unlock(password)` 校验 verifier 并派生 master key。
- **生物识别**：仅当设置页启用后，锁屏会出现「使用生物识别解锁」按钮，调用 `unlockWithBiometric()`。

### 自动锁定

- 取值范围：1–120 分钟（`MIN_AUTO_LOCK_MINUTES = 1`、`MAX_AUTO_LOCK_MINUTES = 120`，见 `authService.ts` 与 `securitySettingsState.ts`）。
- 默认 5 分钟。
- 空闲检测在渲染进程实现（`desktop/src/renderer/hooks/useAutoLock.ts`），监听 `mousedown` / `keydown` / `mousemove` 三个事件，任意一个事件都会重置倒计时。倒计时归零调用 `lock()`。
- 设置页用一个开关控制（开 = 5 分钟，关 = 关闭自动锁定）。底层模型支持任意 1–120 分钟值。

### 手动锁定

两种方式：

- 全局快捷键 `CommandOrControl+L`（见 `desktop/src/main/windowManager.ts` 的 `registerGlobalShortcuts`）。
- 也可以从托盘菜单触发（应用聚焦时按快捷键最直接）。

锁定后 master key 立即清空、数据库连接关闭，回到锁屏。

---

## 4. 隐私外壳

「隐私外壳」是一组面向物理环境风险的开关：你可能在咖啡馆、会议室、屏幕被旁人看到的场合使用 TaskFlow，这些功能让你在那种环境下也能控制信息暴露面。

### 启动锁

每次启动应用都必须解锁（`desktop/src/renderer/App.tsx` 中 `if (!isUnlocked) return <LockScreen />`）。不存在「关掉就直进主界面」的选项——因为 master key 不在内存里，数据库根本打不开。

### 自动锁定

见上一章。这里补充设计意图：空闲计时放在渲染进程监听 DOM 事件，而不是用 OS 级 idle API，是因为 OS idle 会在「屏幕亮着但鼠标没动」时也触发，对「我正在看任务列表」的场景不友好。代价是窗口失焦时不再重置计时——如果你切到别的应用很久，回来时可能已经锁了。

### 隐私模式

按 `Esc` 切换（实现见 `desktop/src/renderer/hooks/usePrivacyMode.ts`）。开启后：

- 任务列表只显示占位，不显示标题等明文内容；
- 保险库页面直接隐藏（`App.tsx` 中 `privacyMode && currentPage === 'vault'` 时显示「隐私模式下保险库已隐藏」）。

> 注意：`Esc` 不再作为全局快捷键注册。全局监听 Esc 会拦截其他应用的 Esc 行为（比如对话框取消），存在 UX 与安全风险，所以改为只在 TaskFlow 窗口聚焦时局部监听。这是有意的取舍。

### 剪贴板自动清空

当你从保险库复制密码到剪贴板（`VaultCard.tsx` 调用 `security.clearClipboard()`），主进程会按设置项 `clipboardClearSeconds` 启动一个定时器，到点调用 `clipboard.clear()`（见 `authService.ts` 的 `scheduleClipboardClear`）。

- 取值范围：1–3600 秒（`securitySettingsState.ts` 中 `MIN_CLIPBOARD_CLEAR_SECONDS = 1`、`MAX_CLIPBOARD_CLEAR_SECONDS = 3600`）。
- 默认 30 秒。

设计上把清空交给定时器而不是「粘贴即清空」，是因为应用无法可靠感知你有没有粘贴完，定时器是更可预测的兜底。

### 截图保护

- **Windows / macOS**：调用 Electron 的 `setContentProtection(true)`，截图和录屏工具无法捕获 TaskFlow 窗口内容（窗口显示为黑块或透明）。
- **Linux**：best-effort。`isScreenshotProtectionEffective()` 在 Linux 上返回 `false`（见 `securitySettingsState.ts`），X11/Wayland 无法可靠拦截截图。设置页会在 Linux 下显式提示「截图保护能力有限，建议注意物理环境安全」（见 `SettingsPage.tsx`）。

这是诚实的降级：与其假装能拦截，不如明确告诉你「这层保护在 Linux 上靠不住」，让你在物理环境上自己注意。

### 全局快捷键清单

| 快捷键 | 作用 | 实现位置 |
| --- | --- | --- |
| `CommandOrControl+L` | 立即锁定 | `windowManager.ts` → `app:lock` |
| `CommandOrControl+N` | 新建任务（切到今日页） | `windowManager.ts` → `app:newTask` |
| `Esc`（窗口内） | 切换隐私模式 | `usePrivacyMode.ts` |

`Esc` 不是全局快捷键，仅当 TaskFlow 窗口聚焦时生效。

---

## 5. 加密保险库

### 什么是保险库

保险库（Vault）是独立于任务库的敏感信息存储。每条保险库条目（`VaultItem`）有一个标题和若干字段（`VaultField`），其中标记为 `isSensitive` 的字段会单独用 master key 做 AES-256-GCM 加密后再写入数据库（见 `desktop/src/main/repositories/vaultRepository.ts` 的 `serializeFields`）。

### 与任务库的关系

任务库的 `tasks` 表是明文（受 SQLCipher 整库加密保护）；保险库的 `vault_items` 表在此基础上对敏感字段再加一层字段级加密。这样即使整库密钥泄露，保险库敏感字段仍有一层独立保护。模型支持三种类型：`password` / `card` / `secureNote`（见 `desktop/src/shared/types.ts`）。

### 创建条目

内置编辑器（`desktop/src/renderer/components/vault/VaultEditor.tsx`）当前提供：

- **名称**（如 GitHub）
- **账号**（非敏感，明文存储）
- **密码**（敏感，字段级加密）

数据模型本身是可扩展的（`VaultField` 是 `{ id, name, value, isSensitive }` 的开放结构），未来可以加 URL、备注等字段；当前编辑器先覆盖最常用的「账号 + 密码」组合。

### 内置密码生成器

「生成」按钮调用 `generatePassword(16)`（见 `cryptoService.ts` 的 `generatePassword`，默认长度 16）。字符集为大小写字母 + 数字 + `!@#$%^&*`，使用 `crypto.randomInt` 避免模偏置。长度可在调用时指定。

### 编辑与删除

编辑走 `updateVaultItem`，删除走 `deleteVaultItem`，均为逻辑直接的 SQL 操作，敏感字段在写入时重新加密。

### 与同步、备份的关系（重要）

- **E2EE 同步**：保险库**参与**同步。任务和保险库条目都会被写成 `sync_records`，用同步主密钥（SMK）加密后传输（见 `desktop/src/main/services/sync/syncRecordWriter.ts` 的 `writeVaultSyncRecord`，以及 `syncRecordApplier.ts` 的 `applyVaultItem`）。接收端解密后会把敏感字段用本机 master key 重新加密入库。
- **加密备份（V2）**：包含 `vault_items` 表（见 `backupService.ts` 的 `createBackup`）。
- **JSON 导出**：**不包含**保险库。JSON 导出只含 `tasks` 和 `categories`，且为明文，用于与移动端互通。所以「把保险库通过 JSON 发给移动端」是做不到的——这是为了防止密钥以明文形式落到不安全渠道。

---

## 6. 生物识别

### 三平台支持矩阵

| 平台 | 机制 | 实现位置 | 前置依赖 |
| --- | --- | --- | --- |
| macOS | Touch ID（`systemPreferences.promptTouchID`） | `biometricService.ts` | 系统自带 |
| Windows | Windows Hello（`@nodert-win10-rs4` 的 `UserConsentVerifier`） | `biometricService.ts` | 系统自带 + 兼容硬件 |
| Linux | fprintd（通过 `gdbus` 探测 D-Bus 服务 + `fprintd-verify` 验证） | `biometricService.ts` | 需自行安装 fprintd 并录入指纹 |

### Linux 前置依赖

Linux 不会自带指纹栈。你需要：

```bash
sudo apt install fprintd
fprintd-enroll <你的用户名>   # 按提示录入指纹
```

录入后，TaskFlow 通过 `gdbus` 调用 D-Bus 检查 `net.reactivated.Fprint` 服务是否注册（见 `isFprintdAvailable`），未注册则视为不可用。

### 启用流程

1. 在「设置 → 安全 → 解锁方式」选择「生物识别」（见 `SettingsPage.tsx`）。
2. 弹窗提示「启用生物识别需要先验证主密码」——输入主密码。
3. 主进程 `enableBiometric(password)` 校验密码正确后，派生 master key 并存为 biometric key（`saveBiometricKey`）。
4. 此后锁屏出现「使用生物识别解锁」按钮。

为什么要先验主密码？因为生物识别只是「便捷解锁」，把 master key 用生物识别保护起来；要启用它，必须先证明你掌握根凭证（主密码）。

### 禁用流程

在设置页切回「主密码」，会调用 `disableBiometric()` 清除 biometric key（`clearBiometricKey`）。切换时无需再次输入主密码（因为你已经处于解锁状态、持有 master key）。

### 安全说明

生物识别**仅作便捷解锁**，主密码仍是唯一根凭证。原因：

- 生物识别特征存在系统层，可被系统策略、硬件重置等改变；
- 生物识别失败时始终可以回退主密码（`unlockWithBiometric` 失败返回 `false`，锁屏仍保留密码输入框）；
- 在共享设备上不要启用生物识别——任何能解锁你系统账户的人都能解锁 TaskFlow。

---

## 7. 端到端加密同步

### 什么是 E2EE 同步

同步在两台已配对设备之间直接进行，数据在离开设备**之前**就由 SMK（Sync Master Key）加密，中继服务器只看到密文帧，无法读取内容。SMK 在首次配对时由 host 生成，通过配对会话加密传给 join 端（见 `desktop/src/main/services/sync/pairingService.ts` 的 `SmkTransferMessage`）。

### 启用前提

你需要一个自托管的中继（relay）地址。relay 是一个轻量 WebSocket/HTTP 转发服务，部署文档见 [`relay-deployment.md`](./relay-deployment.md)。relay 不可达时同步会回退或排队，但配对必须经过 relay 完成首次握手。

### 启用步骤

「设置 → 同步」（`desktop/src/renderer/components/sync/SyncSettingsPanel.tsx`）：

1. 打开「启用端到端加密同步」开关。
2. 在「自托管中继地址」填入你的 relay 地址（如 `ws://relay.local:8787` 或 `http://relay.local:8787`）。
3. 此时「添加设备」「加入设备」按钮可用。

### 配对流程

配对用 8 位码，有效期 5 分钟（relay 侧 `expiresAt: Date.now() + 5 * 60 * 1000`，见 `relay/src/routes.ts`）。

- **添加设备（host）**：本机生成 8 位码（`generatePairingCode`），在新设备上输入此码。host 作为 responder，配对成功后把 SMK 加密发给对端（`respondToPairing`）。
- **加入设备（join）**：在新设备上点「加入设备」，输入对端展示的 8 位码（`claimPairingCodeAndPair`）。join 作为 initiator，claim 成功后建立加密会话并接收 SMK。

配对对话框（`PairingDialog.tsx`）会实时显示 8 位码和剩余有效期倒计时，归零自动关闭。配对会话本身有 120 秒超时（`PAIRING_TIMEOUT_MS`）。

### 已配对设备管理

「已配对设备」列表（`DeviceList.tsx`）显示每台设备的在线状态和最后同步时间。可以移除/吊销任意设备。

吊销是四步编排（见 `desktop/src/main/services/sync/deviceRevocation.ts` 的 `revokeDevice`），顺序很重要：

1. **终止运行时会话**——阻止该设备在吊销瞬间仍收发数据；
2. **删除设备记录**——此后其公钥不再被信任；
3. **清理其离线发件箱**——不再向已失联的它补发任何帧；
4. **若已无任何已配对设备，删除 SMK 文件**——本地不再保留无用密钥，下次配对重新生成。

> 移除最后一台设备会删除 SMK。这意味着「单机再开同步」需要重新配对，是安全且必要的设计：SMK 在多设备间共享，不能在还有别的设备时贸然删。

### LAN vs Relay

传输路由（`desktop/src/main/services/sync/transportRouter.ts`）自动选择：

- **LAN 优先**：若对端在局域网发现表里，先做一次 800ms 超时的 TCP 探测，可达则直连（低延迟、不经中继）。
- **Relay 兜底**：LAN 不可达时走 relay（跨网络、需鉴权）。

把「探测」单独抽出来是因为 LAN 发现包只代表对端「曾经」在线，选择前做一次轻量 TCP 握手确认，避免对着失联对端反复重试。

### 跨平台同步

桌面端可与移动端（Phase 6a/6b）互操作。任务和保险库条目都走同一条 E2EE 通道。

### 冲突解决

采用版本向量 + LWW（见 `desktop/src/main/services/sync/conflictResolver.ts`）：

1. 先比 `updatedAt`，时间戳新的胜出（LWW）；
2. 时间戳相等时比版本向量（`deviceVersion`，每台设备一个计数器），一方支配另一方则支配方胜；
3. 真正并发（互不支配）时回退到 `version`，再相等则按 `id` 字典序定胜负。

并发编辑的实际情况是「最后写入胜出」。这意味着同时编辑同一条任务时，会有一方覆盖另一方——同步前如果在意，先沟通或分时段编辑。

### 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 配对一直失败 | relay 校验时间戳，时钟偏差 >60 秒会返回 `timestamp out of tolerance`（`relay/src/routes.ts` 的 `TIMESTAMP_TOLERANCE_SECONDS = 60`）。先校准两机系统时间（NTP）。 |
| relay 不可达 | 同步回退排队（`relay_outbox` 表落盘），重连后补发。检查 relay 地址、网络、TLS。 |
| 设备吊销后无法同步 | 吊销后该设备公钥不再被信任，需在剩余设备上重新发起配对。 |
| 配对码失效 | 8 位码 5 分钟过期，重新生成即可。 |

---

## 8. 备份与恢复

桌面端提供两套导出，定位不同，不要混用。

### 加密备份（V2）

- 文件扩展名 `.taskflow-backup`，版本号 `BACKUP_VERSION = 2`。
- 结构：4 字节长度前缀 + 明文 metadata（`{ version, keySalt }`）+ AES-256-GCM 密文（`iv + authTag + ciphertext`，见 `cryptoService.ts` 的 `encrypt`）。
- 备份密钥由「你的备份密码 + 独立 backupSalt」派生，**不复用**认证 verifier.salt，避免攻击者仅凭备份文件就拿到认证盐（见 `backupService.ts` 的 `createBackup` 注释）。
- 包含 `tasks`、`vault_items`、`categories`、`security_settings` 四张表。
- V1 旧版备份（明文存 auth.salt/hash）已停止支持，恢复会提示「不支持的旧版备份格式」。

### JSON 导出

- 明文 JSON，驼峰命名，与移动端 `persistenceSlice` 兼容。
- 只含 `tasks` 和 `categories`，**不含保险库、不含安全设置**。
- 用途：跨平台迁移任务数据到移动端。

### 导入

- **导入备份**：覆盖当前所有数据（任务、保险库、分类、设置），需输入当前解锁密码确认（见 `SettingsPage.tsx` 的 `handleImport`）。全新环境（无 verifier）下可顺带设置新密码。
- **导入 JSON**：合并任务和分类到当前数据库，同 ID 任务按 `updatedAt` 较新者覆盖，导入前会自动创建一份加密备份兜底（见 `backupService.ts` 的 `importJson`）。

### 备份文件保管建议

- **离线存储**：U 盘、加密外置硬盘，不要丢到云盘明文区。
- **密码与文件分开**：备份密码别和备份文件放一起。两者同时泄露等于没加密；分开存，丢一个都不致命。
- 备份密码至少 12 字符（恢复时会校验 `MIN_PASSWORD_LENGTH`）。

---

## 9. 设置项详解

设置项分散在「设置」页（`desktop/src/renderer/pages/SettingsPage.tsx`）和安全设置模型（`securitySettingsState.ts`）中。下表给出每个设置项的取值范围、默认值与说明。

| 设置项 | 取值范围 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 解锁方式（`lockMethod`） | `password` / `biometric`（模型还允许 `pin`，UI 暂未暴露） | `password` | 切到生物识别需先验主密码；切回主密码会清除生物识别密钥 |
| 自动锁定（`autoLockMinutes`） | 1–120 分钟 | 5 | 空闲 `mousedown`/`keydown`/`mousemove` 重置倒计时；设置页以开关形式呈现（开=5 分钟） |
| 剪贴板自动清空（`clipboardClearSeconds`） | 1–3600 秒 | 30 | 从保险库复制后按此秒数清空系统剪贴板 |
| 截图/录屏保护（`screenshotProtection`） | `true` / `false` | `true` | Windows/macOS 有效；Linux 为 best-effort，UI 会提示 |
| 隐私模式（`privacyModeEnabled`） | `true` / `false` | `false` | 运行时按 `Esc` 切换；偏好存于安全设置 |
| 外观（主题） | `light` / `dark` / `system` | `system` | 跟随系统会随 OS 主题切换 |
| 同步开关（`enabled`） | `true` / `false` | `false` | 启用后才显示中继地址与配对入口 |
| 同步中继地址（`relayUrl`） | 字符串（`ws://` 或 `http://` URL） | 空 | 自托管 relay 地址，见 [`relay-deployment.md`](./relay-deployment.md) |

> 剪贴板清空和隐私模式当前没有独立的设置页控件，前者在复制保险库密码时按设置值触发，后者运行时按 `Esc` 切换。它们仍属于安全设置模型，可被备份/恢复。

---

## 10. 常见问题

### 忘记主密码怎么办？

数据**不可恢复**。PBKDF2 600000 轮派生 master key，没有 服务端、没有后门。唯一出路是卸载应用、删除 userData 目录、重装后用一份加密备份恢复（前提是你还记得备份密码）。如果连备份密码也忘了，数据彻底丢失——这是本地优先加密的代价，也是它不把你的密钥交给任何人的代价。

### 生物识别失败怎么办？

回退主密码。锁屏始终保留密码输入框，`unlockWithBiometric` 失败只返回 `false`，不会锁死你。常见失败原因：手指潮湿、传感器脏、Linux 上 fprintd 服务未运行（用 `systemctl status fprintd` 检查）。

### 同步不工作？

按顺序排查：

1. **relay 地址**：是否填对、是否带 `ws://` 或 `http://` 前缀、relay 服务是否在线。
2. **网络**：两台设备是否都能访问 relay（跨网络时尤其注意防火墙）。
3. **时钟**：两机系统时间偏差 >60 秒会导致配对/鉴权失败（relay 返回 `timestamp out of tolerance`），用 NTP 校准。
4. **配对状态**：对端是否还在「已配对设备」列表里；若已被吊销，需重新配对。

> **关于同步能力：** 桌面端具备完整的 E2EE P2P 同步能力（见第 7 章），任务和保险库均可跨设备同步。仓库根目录 `FAQ.md` 的「Can two devices sync?」条目已同步更新为肯定回答，与本手册一致。

### Linux 截图保护无效？

已知限制。`isScreenshotProtectionEffective()` 在 Linux 上返回 `false`（见 `securitySettingsState.ts`），X11/Wayland 无法可靠拦截截图工具。设置页会在 Linux 下明确提示。建议在敏感场景下注意物理环境（屏幕朝向、肩窥），或开启隐私模式减少明文暴露面。

### JSON 导出里没有保险库？

是的，这是设计。JSON 导出是明文、面向移动端迁移，只含任务和分类。保险库只通过两种渠道离开本机：E2EE 同步（加密）和加密备份（V2，密码保护）。明文导出保险库会被拒绝，避免密钥落到不安全渠道。

---

## 11. 安全最佳实践

- **主密码用 passphrase 而非「乱码」**：12 字符是下限，建议用 4 个以上随机词组成的 passphrase（熵足够且好记）。`MIN_PASSWORD_LENGTH = 12` 是底线不是目标。
- **生物识别只用在个人设备**：共享设备、办公电脑不要开。任何能解锁你系统账户的人都能解锁 TaskFlow。
- **备份文件离线 + 密码分离**：备份文件和备份密码放一起等于没加密。U 盘存文件、密码记在脑子里或纸上。
- **公共场合开隐私模式**：咖啡馆、飞机上、会议室投屏时按 `Esc` 进入隐私模式，任务内容只显示占位，旁窥者看不到明文。
- **离开座位前手动锁定**：`CommandOrControl+L` 比等自动锁定更可靠，养成习惯。
- **relay 自托管**：同步用你自己的 relay，别用来源不明的公共 relay。relay 看不到明文，但能看到流量元数据（谁连谁、何时连），自托管能把这部分也攥在自己手里。
- **定期验证备份可恢复**：备份不能只「导出」就完事，隔段时间在一个干净环境试恢复一次，确认密码没忘、文件没坏。

---

## 附录：关键源码索引

| 主题 | 文件 |
| --- | --- |
| 主进程入口 | `desktop/src/main/index.ts` |
| 认证与主密码 | `desktop/src/main/services/authService.ts` |
| 加密原语（PBKDF2/AES-GCM/密码生成） | `desktop/src/main/services/cryptoService.ts` |
| SQLCipher 整库加密与迁移 | `desktop/src/main/services/dbService.ts` |
| 安全设置校验与默认值 | `desktop/src/main/services/securitySettingsState.ts` |
| 窗口、全局快捷键、截图保护 | `desktop/src/main/windowManager.ts` |
| 生物识别三平台分支 | `desktop/src/main/services/biometricService.ts` |
| 保险库字段级加密 | `desktop/src/main/repositories/vaultRepository.ts` |
| 备份与 JSON 导出 | `desktop/src/main/services/backupService.ts` |
| 配对流程 | `desktop/src/main/services/sync/pairingService.ts` |
| 冲突解决 | `desktop/src/main/services/sync/conflictResolver.ts` |
| 设备吊销 | `desktop/src/main/services/sync/deviceRevocation.ts` |
| LAN/Relay 路由 | `desktop/src/main/services/sync/transportRouter.ts` |
| 同步记录写入/应用 | `desktop/src/main/services/sync/syncRecordWriter.ts` / `syncRecordApplier.ts` |
| 设置页 UI | `desktop/src/renderer/pages/SettingsPage.tsx` |
| 同步设置 UI | `desktop/src/renderer/components/sync/SyncSettingsPanel.tsx` |
| 配对对话框 | `desktop/src/renderer/components/sync/PairingDialog.tsx` |
| 自动锁定 hook | `desktop/src/renderer/hooks/useAutoLock.ts` |
| 隐私模式 hook | `desktop/src/renderer/hooks/usePrivacyMode.ts` |
| 构建配置 | `desktop/electron-builder.yml` |
| relay 鉴权与配对码 TTL | `relay/src/routes.ts` |
