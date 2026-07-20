# TaskFlow 生物识别解锁设计文档

> 状态：已完成 1.0 跨平台基础实现（macOS Touch ID + Windows Hello），剩余 Linux 支持、配置持久化等由团队继续推进。
> 相关 PR：#19

## 1. 设计目标

- 允许用户在支持生物识别的设备上，通过指纹 / 面容 / Windows Hello 解锁 TaskFlow。
- 生物识别本身不替代主密码，只是用于安全地检索已保存的**数据库主密钥**。
- 不支持生物识别的平台应优雅降级，不影响现有密码解锁流程。

## 2. 平台支持矩阵

| 平台 | 实现方式 | 状态 |
|---|---|---|
| macOS | `systemPreferences.promptTouchID` (Electron) | ✅ 已实现 |
| Windows | `Windows.Security.Credentials.UI.UserConsentVerifier` (NodeRT) | ✅ 已实现 |
| Linux | fprintd / PAM / polkit（未实现） | ⏳ 待团队推进 |

## 3. 安全模型

1. 用户首次启用生物识别时，需要输入主密码验证身份。
2. 验证通过后，用该主密码派生出的 **master key**（与 SQLCipher 数据库加密密钥相同）被保存到本地。
3. 保存时使用 Electron `safeStorage` 加密（macOS Keychain / Windows DPAPI / Linux keyring）。
4. 解锁时，系统先通过生物识别 API 验证用户，验证成功后再从安全存储中读取 master key 并打开数据库。
5. 生物识别失败或取消 → 不读取密钥，保持锁定状态。

```
主密码 ──► PBKDF2 ──► master key
                         │
                         ├─► SQLCipher 数据库加密
                         └─► safeStorage 保存（启用生物识别时）

解锁：生物识别通过 ──► safeStorage 读取 master key ──► 打开数据库
```

## 4. 关键文件与职责

| 文件 | 职责 |
|---|---|
| `desktop/src/main/services/biometricService.ts` | 跨平台生物识别检测与提示 |
| `desktop/src/main/services/authService.ts` | 生物识别启用 / 禁用 / 解锁的业务逻辑 |
| `desktop/src/main/services/authStorage.ts` | 生物识别密钥的安全读写 |
| `desktop/src/main/ipc/biometricChannels.ts` | 渲染进程可调用的 IPC 通道 |
| `desktop/src/preload/index.ts` | 暴露 `window.taskflowAPI.biometric` |
| `desktop/src/renderer/components/layout/LockScreen.tsx` | 锁屏界面生物识别按钮 |
| `desktop/src/renderer/pages/SettingsPage.tsx` | 解锁方式切换 UI |
| `desktop/src/renderer/store/authStore.ts` | 生物识别解锁的状态流转 |
| `desktop/src/tests/unit/biometricService.test.ts` | 单元测试 |
| `desktop/src/main/types/windows-biometric.d.ts` | Windows Hello 类型声明 |

## 5. IPC 接口

```typescript
window.taskflowAPI.biometric = {
  isAvailable: () => Promise<boolean>,
  isEnabled: () => Promise<boolean>,
  unlock: () => Promise<boolean>,
  enable: (password: string) => Promise<boolean>,
  disable: () => Promise<void>,
};
```

## 6. Windows Hello 构建说明

Windows Hello 依赖可选包 `@nodert-win10-rs4/windows.security.credentials.ui`：

```json
"optionalDependencies": {
  "@nodert-win10-rs4/windows.security.credentials.ui": "^0.4.4"
}
```

- 该包是 NodeRT C++ 包装器，**只能在 Windows 上真正运行**。
- Linux / macOS 构建时，动态导入会失败并被捕获，功能自动降级为不可用。
- Windows 打包/发布时，确保在 Windows 构建机上执行 `npm install` 或 `npm rebuild`，使 native module 针对 Electron 版本重建。

### Electron 重建参考

```powershell
# 在 Windows 开发机上
npm install
npx electron-builder install-app-deps
```

## 7. 已知问题与待办

- [ ] **Linux 生物识别**：调研 fprintd D-Bus 接口或 `polkit` / `pam` 方案，实现 Linux 分支。
- [ ] **Windows 打包验证**：确认 electron-builder 在 Windows CI 上正确打包 NodeRT 依赖。
- [ ] **配对/恢复场景**：更换主密码后，生物识别保存的 master key 会失效，需要重新启用。当前未在 UI 中明确提示。
- [ ] **错误提示国际化**：Windows Hello / Touch ID 取消或失败时，前端提示较简单，可进一步细化。

## 8. 测试

```bash
cd desktop
npm run test
```

当前测试覆盖：
- macOS Touch ID 可用 / 不可用
- macOS 用户确认 / 取消
- Windows Hello 可用 / 不可用 / 检测失败
- Windows Hello 用户确认 / 取消
- Linux 及不支持平台优雅降级

## 9. 团队交接要点

- 如需支持 Linux，建议优先调研 **fprintd** 的 D-Bus API（`net.reactivated.Fprint`），在 Linux 分支调用验证，验证成功后再读取保存的 master key。
- 如需调整生物识别与主密码的绑定策略（例如允许 PIN fallback），修改点在 `authService.ts` 的 `enableBiometric` 与 `unlockWithBiometric`。
- 新增平台时，保持 `biometricService.ts` 的接口不变：`isBiometricAvailable()` 与 `promptBiometric(reason)` 都返回 `Promise<boolean>`。
