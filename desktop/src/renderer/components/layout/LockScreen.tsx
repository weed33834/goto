import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 3; // 与 authStore 保持一致

export function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [, setCooldownTick] = useState(0); // 仅用于驱动重渲染
  const { unlock, setupMasterPassword, lockedUntil } = useAuthStore();

  // 倒计时刷新(每秒 tick 一次,驱动 cooldownRemaining 重算)
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setCooldownTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const hasVerifier = await window.gotoAPI.auth.hasVerifier();
      if (mounted) {
        setIsFirstRun(!hasVerifier);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 计算剩余秒数(lockedUntil 变化或 tick 触发重渲染时重算)
  const cooldownRemaining = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
    : 0;
  const isCoolingDown = cooldownRemaining > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isCoolingDown) return; // 锁定中不响应
    if (isFirstRun) {
      if (!password) {
        setError('请输入主密码');
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`主密码至少 ${MIN_PASSWORD_LENGTH} 位`);
        return;
      }
      const success = await setupMasterPassword(password);
      if (!success) setError('设置失败,请重试');
      return;
    }
    const success = await unlock(password);
    if (!success) {
      const state = useAuthStore.getState();
      if (state.lockedUntil) {
        setError(`密码错误次数过多,请 ${state.cooldownRemaining()} 秒后再试`);
      } else {
        const remaining = MAX_FAILED_ATTEMPTS - state.failedAttempts;
        setError(remaining > 0 ? `密码错误,还可尝试 ${remaining} 次` : '密码错误');
      }
    }
    setPassword(''); // 清空密码框,无论成功失败
  };

  return (
    <div className="safe-area-x flex h-screen w-full flex-col items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
      <div className="mb-6 text-2xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-8 sm:text-3xl">Goto</div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Input
          type="password"
          placeholder={isFirstRun ? '设置主密码(至少 8 位)' : '输入主密码'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          disabled={isCoolingDown && !isFirstRun}
        />
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        {isCoolingDown && !isFirstRun && (
          <p className="text-center text-sm text-amber-600 dark:text-amber-400">
            请 {cooldownRemaining} 秒后再试
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isCoolingDown && !isFirstRun}>
          {isFirstRun ? '设置并解锁' : isCoolingDown ? `锁定中(${cooldownRemaining}s)` : '解锁'}
        </Button>
      </form>
      <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">本地加密 · 数据不上传</p>
    </div>
  );
}
