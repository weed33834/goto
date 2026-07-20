import { useEffect, useState } from 'react';
import { Switch } from '../components/common/Switch';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useThemeStore, type ThemeMode } from '../store/themeStore';
import { useSecuritySettingsStore } from '../store/securitySettingsStore';
import { useAuthStore } from '../store/authStore';
import { useTaskStore } from '../store/taskStore';
import { useVaultStore } from '../store/vaultStore';
import { useAppStore } from '../../shared/store';
import { SyncSettingsPanel } from '../components/sync/SyncSettingsPanel';
import type { SecuritySettings } from '../../shared/types';

const themeLabels: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const { isLoading, update, fetch: fetchSecuritySettings, ...settings } = useSecuritySettingsStore();
  const { fetch: fetchTasks } = useTaskStore();
  const { fetch: fetchVault } = useVaultStore();
  const setActiveModal = useAppStore((s) => s.setActiveModal);
  const resetData = useAppStore((s) => s.resetData);
  const displaySettings = useAppStore((s) => s.userPreferences.displaySettings);
  const updateDisplaySettings = useAppStore((s) => s.updateDisplaySettings);
  const changePassword = useAuthStore((s) => s.changePassword);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  // P1-10:修改主密码 inline 表单
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const available = await window.gotoAPI.biometric.isAvailable();
      const enabled = await window.gotoAPI.biometric.isEnabled();
      if (mounted) {
        setBiometricAvailable(available);
        setBiometricEnabled(enabled);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [settings.lockMethod]);

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleLockMethodChange = async (method: SecuritySettings['lockMethod']) => {
    if (method === settings.lockMethod) return;

    if (method === 'biometric') {
      if (!biometricAvailable) {
        showFeedback('当前设备不支持生物识别');
        return;
      }
      const password = window.prompt('启用生物识别需要先验证主密码');
      if (!password) return;

      setIsBusy(true);
      try {
        const success = await window.gotoAPI.biometric.enable(password);
        if (!success) {
          showFeedback('密码验证失败，无法启用生物识别');
          return;
        }
        await update({ lockMethod: 'biometric' });
        setBiometricEnabled(true);
        showFeedback('生物识别已启用');
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (settings.lockMethod === 'biometric') {
      await window.gotoAPI.biometric.disable();
      setBiometricEnabled(false);
    }
    await update({ lockMethod: method });
  };

  const handleExport = async () => {
    const password = window.prompt('请输入当前解锁密码以导出加密备份。');
    if (!password) return;

    setIsBusy(true);
    try {
      const result = await window.gotoAPI.backup.exportBackup(password);
      showFeedback(result.success ? `导出成功：${result.message}` : `导出失败：${result.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    const confirmed = window.confirm(
      '导入备份将覆盖当前所有数据（任务、保险库、分类和设置）。\n\n确定要继续吗？'
    );
    if (!confirmed) return;

    const hasVerifier = await window.gotoAPI.auth.hasVerifier();
    let password: string | null;
    let newPassword: string | undefined;

    if (hasVerifier) {
      password = window.prompt('请输入当前解锁密码以恢复备份。');
    } else {
      password = window.prompt('请输入备份的解锁密码。');
      if (!password) return;
      newPassword = window.prompt('请为应用设置新密码以加密恢复后的数据。') ?? undefined;
    }

    if (!password) return;
    if (!hasVerifier && !newPassword) return;

    setIsBusy(true);
    try {
      const result = await window.gotoAPI.backup.importBackup(password, newPassword);
      if (result.success) {
        await Promise.all([fetchTasks(), fetchVault(), fetchSecuritySettings()]);
      }
      showFeedback(result.success ? `导入成功：${result.message}` : `导入失败：${result.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportJson = async () => {
    setIsBusy(true);
    try {
      const result = await window.gotoAPI.backup.exportJson();
      showFeedback(result.success ? `导出成功：${result.message}` : `导出失败：${result.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportJson = async () => {
    const confirmed = window.confirm(
      '导入 JSON 将合并任务和分类到当前数据库。\n\n同 ID 的任务将保留 updatedAt 较新的版本，导入前会自动创建加密备份。确定要继续吗？'
    );
    if (!confirmed) return;

    const password = window.prompt('请输入当前解锁密码以在导入前创建备份。');
    if (!password) return;

    setIsBusy(true);
    try {
      const result = await window.gotoAPI.backup.importJson(password);
      if (result.success) {
        await Promise.all([fetchTasks(), fetchSecuritySettings()]);
      }
      showFeedback(result.success ? `导入成功：${result.message}` : `导入失败：${result.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  // P1-10:修改主密码 — 验证旧密码 + 写新 verifier。
  // 已有备份文件仍用旧密码加密,提醒用户保留旧密码或重新导出备份。
  const resetPwdForm = () => {
    setOldPwd('');
    setNewPwd('');
    setNewPwdConfirm('');
    setPwdError(null);
    setPwdSuccess(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (!oldPwd) {
      setPwdError('请输入当前密码');
      return;
    }
    if (newPwd.length < 8) {
      setPwdError('新密码至少需要 8 位');
      return;
    }
    if (newPwd !== newPwdConfirm) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPwd === oldPwd) {
      setPwdError('新密码不能与当前密码相同');
      return;
    }

    setPwdBusy(true);
    try {
      const result = await changePassword(oldPwd, newPwd);
      if (result.success) {
        setPwdSuccess(result.message);
        // 清空表单,但保留成功提示让用户看到
        setOldPwd('');
        setNewPwd('');
        setNewPwdConfirm('');
        // 4 秒后自动收起表单
        setTimeout(() => {
          setShowChangePwd(false);
          setPwdSuccess(null);
        }, 4500);
      } else {
        setPwdError(result.message);
      }
    } finally {
      setPwdBusy(false);
    }
  };

  // P1-12:清空全部数据 — 调用 resetData,清任务/保险库/项目/分类/标签等。
  // 主密码与已生成备份文件不受影响。
  const handleClearData = async () => {
    const confirmed = window.confirm(
      '确定要清空所有数据吗?\n\n此操作将删除:\n• 全部任务和子任务\n• 全部保险库项(密码 / 卡片 / 笔记)\n• 全部项目和自定义分类、标签\n• 搜索历史\n• 同步设备身份(需重新配对)\n\n不会删除:\n• 主密码(下次启动仍用当前密码解锁)\n• 已生成的加密备份文件\n\n此操作不可撤销,建议先导出加密备份。',
    );
    if (!confirmed) return;

    setIsBusy(true);
    try {
      resetData();
      showFeedback('已清空全部数据。主密码保持不变。');
    } finally {
      setIsBusy(false);
    }
  };

  // P1-12:恢复出厂 — 清数据 + 删除主密码 + 删除安全设置,然后重启应用。
  const handleFactoryReset = async () => {
    const confirmed = window.confirm(
      '确定要恢复出厂设置吗?\n\n此操作将:\n• 清空全部任务、保险库、项目、分类、标签\n• 删除主密码(下次启动需重新设置)\n• 删除自动锁定 / 截图保护等安全设置\n• 删除同步设备身份\n\n不受影响:\n• 已生成的加密备份文件(仍可用旧密码恢复)\n\n应用将在 1 秒后自动重启到首次设置状态。\n\n此操作不可撤销,请确保已导出重要数据的备份。',
    );
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const result = await window.gotoAPI.auth.factoryReset();
      showFeedback(result.message);
      if (result.success) {
        // 给用户 1 秒看到反馈,然后 reload 回到首次启动状态
        setTimeout(() => window.location.reload(), 1000);
      }
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">设置</h1>
        <p className="text-slate-500 dark:text-slate-400">加载中...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">设置</h1>
      <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:space-y-6 sm:p-6">
        <div>
          <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">安全</h2>
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">解锁方式</p>
              <div className="flex flex-wrap gap-2">
                {/* P1 修复:Web 端 biometric 永远返回 false,渲染该按钮只会让用户点了失败。
                    只在 biometricAvailable 为 true 时才显示,避免安慰剂式 UI。 */}
                {(biometricAvailable
                  ? (['password', 'biometric'] as const)
                  : (['password'] as const)
                ).map((method) => (
                  <Button
                    key={method}
                    variant={settings.lockMethod === method ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => handleLockMethodChange(method)}
                    disabled={isBusy || (method === 'biometric' && !biometricAvailable)}
                  >
                    {method === 'password' ? '主密码' : '生物识别'}
                  </Button>
                ))}
              </div>
              {settings.lockMethod === 'biometric' && !biometricEnabled && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  生物识别尚未录入，请选择后按提示验证主密码以启用。
                </p>
              )}
            </div>
            {/* P1-3:自动锁定时长从原 Switch(固定 5 分钟)升级为 select,
                支持 1/5/15/30/60 分钟多档,以及"关闭"。
                默认值 5 分钟与原 Switch 行为对齐。 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                无操作自动锁定
              </label>
              <select
                value={String(settings.autoLockMinutes)}
                onChange={(e) => update({ autoLockMinutes: Number(e.target.value) })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="0">关闭</option>
                <option value="1">1 分钟</option>
                <option value="5">5 分钟(默认)</option>
                <option value="15">15 分钟</option>
                <option value="30">30 分钟</option>
                <option value="60">1 小时</option>
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                设置无操作多久后自动返回锁屏。设为「关闭」时仅手动锁定(顶部按钮或 Mod+L)。
              </p>
            </div>
            <Switch
              label="截图/录屏保护"
              checked={settings.screenshotProtection}
              onChange={(checked) => update({ screenshotProtection: checked })}
            />
            {/* P1 修复:Web 端 screenshotProtection 是安慰剂(浏览器无法阻止 OS 截屏),
                显式标注限制,避免用户误以为已生效。 */}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              桌面壳内可阻止 Windows/macOS 截图和录屏工具捕获 Goto 窗口内容。Web 端无此能力,需配合桌面壳使用。
            </p>
            {typeof navigator !== 'undefined' && /linux/i.test(navigator.platform) && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Linux 环境下截图保护能力有限，建议注意物理环境安全。
              </p>
            )}
            {/* P1-10:修改主密码入口 + inline 表单 */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">修改主密码</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    修改解锁密码。注意:此前生成的加密备份仍需用旧密码恢复。
                  </p>
                </div>
                {!showChangePwd && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowChangePwd(true);
                      resetPwdForm();
                    }}
                  >
                    修改
                  </Button>
                )}
              </div>
              {showChangePwd && (
                <form onSubmit={handleChangePassword} className="mt-3 space-y-2">
                  <Input
                    type="password"
                    label="当前密码"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    placeholder="输入当前解锁密码"
                    autoComplete="current-password"
                    required
                  />
                  <Input
                    type="password"
                    label="新密码"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                    required
                  />
                  <Input
                    type="password"
                    label="确认新密码"
                    value={newPwdConfirm}
                    onChange={(e) => setNewPwdConfirm(e.target.value)}
                    placeholder="再次输入新密码"
                    autoComplete="new-password"
                    required
                  />
                  {pwdError && (
                    <p className="text-xs text-danger dark:text-red-400" role="alert">
                      {pwdError}
                    </p>
                  )}
                  {pwdSuccess && (
                    <p className="text-xs text-green-600 dark:text-green-400" role="status">
                      {pwdSuccess}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" variant="primary" size="sm" disabled={pwdBusy}>
                      {pwdBusy ? '提交中…' : '保存新密码'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowChangePwd(false);
                        resetPwdForm();
                      }}
                      disabled={pwdBusy}
                    >
                      取消
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">外观</h2>
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">主题</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(themeLabels) as ThemeMode[]).map((themeMode) => (
                  <Button
                    key={themeMode}
                    variant={mode === themeMode ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setMode(themeMode)}
                  >
                    {themeLabels[themeMode]}
                  </Button>
                ))}
              </div>
            </div>
            {/* P1-3:字体大小 — 通过 root font-size 等比例缩放所有 rem-based 工具类。
                App.tsx 监听 userPreferences.displaySettings.fontSize 并同步到
                document.documentElement[data-font-size],index.css 据此调整 root font-size。 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                字体大小
              </label>
              <select
                value={displaySettings.fontSize}
                onChange={(e) => updateDisplaySettings({ fontSize: e.target.value as 'small' | 'medium' | 'large' })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="small">小(紧凑)</option>
                <option value="medium">中(默认)</option>
                <option value="large">大(易读)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                调整界面所有文字与间距的缩放比例。适合高分屏放大或小屏紧凑。
              </p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">快捷键</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            应用内任意位置按 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">?</kbd> 可快速查看所有可用快捷键。
          </p>
          <Button variant="secondary" size="sm" onClick={() => setActiveModal('shortcuts-help')}>
            查看所有快捷键
          </Button>
        </div>
        <div>
          <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">数据</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <Button variant="secondary" onClick={handleExport} disabled={isBusy} className="justify-start sm:justify-center">
              导出备份
            </Button>
            <Button variant="secondary" onClick={handleImport} disabled={isBusy} className="justify-start sm:justify-center">
              导入备份
            </Button>
            <Button variant="secondary" onClick={handleExportJson} disabled={isBusy} className="justify-start sm:justify-center">
              导出 JSON
            </Button>
            <Button variant="secondary" onClick={handleImportJson} disabled={isBusy} className="justify-start sm:justify-center">
              导入 JSON
            </Button>
            {feedback && <span className="text-sm text-slate-600 dark:text-slate-400">{feedback}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            备份文件使用解锁密码加密，仅能通过相同的解锁密码恢复。JSON 格式为明文，可与移动端互通。
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">同步</h2>
          <SyncSettingsPanel />
        </div>
        {/* P1-12:危险区 — 清空数据 / 恢复出厂设置。
            红色边框 + 二次确认,明确告知影响范围,避免误操作导致数据永久丢失。 */}
        <div className="rounded-lg border-2 border-red-200 p-4 dark:border-red-900/60">
          <h2 className="mb-2 font-medium text-red-700 dark:text-red-400">危险区</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            以下操作不可撤销,执行前请确认已导出加密备份。
          </p>
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-red-200 p-3 dark:border-red-900/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">清空所有任务和保险库数据</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    删除全部任务、保险库项、项目、自定义分类与标签,以及搜索历史。同步设备身份也会被清除(需重新配对)。<strong>主密码与已配对备份文件不受影响。</strong>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 shrink-0 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/20 sm:mt-0"
                  onClick={handleClearData}
                  disabled={isBusy}
                >
                  清空数据
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-red-200 p-3 dark:border-red-900/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">恢复出厂设置</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    清空全部数据 <strong>并删除主密码与本地安全设置</strong>。下次启动将回到首次安装状态,需重新设置主密码。<strong>已生成的加密备份文件仍可用旧密码恢复。</strong>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 shrink-0 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/20 sm:mt-0"
                  onClick={handleFactoryReset}
                  disabled={isBusy}
                >
                  恢复出厂
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
