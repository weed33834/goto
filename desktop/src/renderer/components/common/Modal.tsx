import { ReactNode, useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  // 打开时锁定 body 滚动,ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('sidebar-drawer-open');
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.classList.remove('sidebar-drawer-open');
      window.removeEventListener('keydown', handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        // 移动端:底部抽屉式(bottom sheet)从底部滑出,圆角顶部,最大高度 85vh 可滚动
        // 桌面端:居中卡片 max-w-md
        onClick={(e) => e.stopPropagation()}
        className="safe-area-bottom max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg dark:bg-slate-800 dark:text-slate-100 sm:max-h-[85vh] sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">{title}</h2>}
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto shrink-0">
            关闭
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
