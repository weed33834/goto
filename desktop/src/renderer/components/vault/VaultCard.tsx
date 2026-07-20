import { useEffect, useRef, useState } from 'react';
import type { VaultItem } from '../../../shared/types';
import { Button } from '../common/Button';
import { useVaultStore } from '../../store/vaultStore';
import { useSecuritySettingsStore } from '../../store/securitySettingsStore';
import { useAppStore } from '../../../shared/store';
import { VaultEditor } from './VaultEditor';

interface VaultCardProps {
  item: VaultItem;
}

export function VaultCard({ item }: VaultCardProps) {
  const [showSensitive, setShowSensitive] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [clearingIn, setClearingIn] = useState<number | null>(null);
  const { delete: deleteItem } = useVaultStore();
  const clipboardClearSeconds = useSecuritySettingsStore((s) => s.clipboardClearSeconds);
  // 模块级 timer,所有 VaultCard 实例共享一个清除计划(只清最后一次复制的字段)
  const clearTimerRef = useRef<number | null>(null);

  // 倒计时刷新(每秒 tick)
  useEffect(() => {
    if (clearingIn === null) return;
    if (clearingIn <= 0) {
      setClearingIn(null);
      return;
    }
    const t = window.setTimeout(() => setClearingIn((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [clearingIn]);

  // 组件卸载时清理 timer,避免泄漏
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  // 编辑模式:直接渲染 VaultEditor 并预填当前项数据
  if (isEditing) {
    return <VaultEditor editingItem={item} onDone={() => setIsEditing(false)} />;
  }

  const handleCopy = async (value: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 兜底:textarea + execCommand(老浏览器 / Electron 无 clipboard 权限)
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    setCopiedField(fieldId);
    setClearingIn(clipboardClearSeconds);

    // P0-6 修复:按 PRIVACY.md §6.2 承诺,延迟 clipboardClearSeconds 秒后清除剪贴板。
    // 之前实现是立即 clearClipboard(),等于复制即清空,用户根本没机会粘贴。
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = window.setTimeout(() => {
      window.gotoAPI.security.clearClipboard();
      setCopiedField(null);
      setClearingIn(null);
      clearTimerRef.current = null;
    }, clipboardClearSeconds * 1000);

    // 推送 toast 提示用户"X 秒后自动清除"
    useAppStore.getState().addNotification({
      id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'system',
      title: '已复制',
      message: `${clipboardClearSeconds} 秒后自动清除剪贴板`,
      isRead: false,
      isArchived: false,
      actionUrl: null,
      data: {},
      createdAt: new Date(),
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">{item.title}</h3>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <button
            onClick={() => setIsEditing(true)}
            className="px-2 py-1 text-sm text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary sm:px-0 sm:py-0"
          >
            编辑
          </button>
          <button
            onClick={() => deleteItem(item.id)}
            className="px-2 py-1 text-sm text-slate-400 hover:text-danger dark:text-slate-500 dark:hover:text-danger sm:px-0 sm:py-0"
          >
            删除
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {item.fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="shrink-0 text-slate-500 dark:text-slate-400">{field.name}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`min-w-0 break-all ${field.isSensitive && !showSensitive ? 'blur-sm' : ''}`}>
                {field.isSensitive && !showSensitive ? '••••••••' : field.value}
              </span>
              {field.isSensitive && (
                <Button variant="ghost" size="sm" onClick={() => setShowSensitive(!showSensitive)} className="shrink-0">
                  {showSensitive ? '隐藏' : '显示'}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(field.value, field.id)}
                className="shrink-0"
              >
                {copiedField === field.id && clearingIn !== null
                  ? `已复制 ${clearingIn}s`
                  : '复制'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
