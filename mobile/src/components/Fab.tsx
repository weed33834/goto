import { Plus } from 'lucide-react';

interface Props {
  onClick: () => void;
  label?: string;
}

// 移动端专属:FAB 悬浮新建按钮(替代桌面端模态/工具栏)。
export default function Fab({ onClick, label = '新建任务' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid="fab-new"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg transition-transform duration-fast active:scale-95"
    >
      <Plus size={26} />
    </button>
  );
}
