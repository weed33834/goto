# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] — 2026-07-26

首个公开发布版本。本地优先 + 端到端加密的私人时间资产管理器,
三端解耦:纯浏览器 Web 应用 + 自部署中继 + 可选 Python 后端。

### Added

- **Web 应用核心**(12 页 + 时间织锦):Today / Calendar / Projects / Project detail /
  Categories / Tags / Search / Vault / Settings / Kanban / Insights / Weekly Review + Mosaic。
- **E2EE 同步**:AES-256-GCM(SMK)+ X25519 ECDH + Ed25519 身份 + HKDF-SHA256,
  9 种消息类型,序列号 + 滑动窗口防重放。Relay 仅转发密文,7 天离线队列。
- **加密备份**:argon2id(m=64MB t=3 p=4)+ AES-256-GCM,二进制头 `GTFB`。
  双算法兼容旧 PBKDF2 备份(只读路径)。
- **保险库**:字段级 AES-256-GCM,密码生成器,剪贴板自动清除(默认 30s,可配置)。
- **主密码**:argon2id verifier(双算法兼容旧 PBKDF2 verifier),3 次错锁 30s,
  自动锁定 0/1/5/15/30/60 分钟可配,修改主密码 inline 表单。
- **任务模型**:45 字段 Task 类型,子任务,附件,评论,依赖(blockedBy/blocks),
  RecurrenceRule 编辑器 + next-instance 生成,NLP 快速添加(明天 3点 高! 30分钟 #工作 +项目)。
- **视图**:Kanban 5 列拖拽改 status,Mosaic 时间织锦,Insights(Karma + 14 天趋势 + 分布),
  Weekly Review(周范围切换 + 反思 + 归档)。
- **体验**:PWA(Workbox 缓存 + manifest + SVG icons),vim 键盘快捷键(j/k/e/x/d/gg/G/),
  批量操作(全选/完成/改优先级/移项目/删除),@dnd-kit 拖拽排序,
  自然语言 parser 接入 TaskEditor,提醒系统(Notification API + SW)。
- **安全**:截图/录屏保护(桌面壳内有效,Web 端标注限制),隐私模式,
  危险区(清空数据 / 恢复出厂,两步确认)。
- **后端**:FastAPI 36 端点(tasks/projects/categories/tags + git 管理 + 插件系统),
  Bearer token 鉴权,OpenAPI 自动生成 + CI 校验。
- **中继**:Node.js 18+ + WebSocket + express-rate-limit,Docker 部署,
  Ed25519 签名验证,8 位配对码 5 分钟 TTL。

### Changed

- 同步协议 HKDF info = `goto-sync-v2`(不兼容旧设备,需重新配对)。
- 主密码 KDF:argon2id(m=64MB t=3 p=4)。旧 PBKDF2 verifier 与旧 PBKDF2 备份通过
  双算法兼容路径只读识别并升级。

### Security

- 加密备份 magic 头 `GTFB` + algo 字节,支持 argon2id(0x02)与 PBKDF2(0x01)双算法兼容。
- secureStorage 把 storage key 作为 AAD 绑定到 AES-GCM 密文,防止密文剪贴攻击。
- E2EE 配对流程:SMK 比对失败时拒绝配对(而非静默继续)。
- 设备注销四步编排:杀会话 + 删设备记录 + 清 outbox + 仅在无配对设备时重置 SMK。

### Tests

- Web 应用 unit:**550 passed** / 26 skipped(38 test files)。
- Web 应用 e2e:**108 passed**。
- 后端 pytest:**104 passed**。
- 中继 vitest:**9 passed**。
- 首屏 JS gzip ~103KB(≤ 250KB 预算)。
- 全量 verify:typecheck ✅ / build ✅ / vitest ✅ / playwright ✅。
