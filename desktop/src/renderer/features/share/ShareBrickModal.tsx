/**
 * A19 分享单块砖 — Modal 组件(§3.6 / §5 A19 / §7.1)
 *
 * 渲染逻辑:
 * - 顶部:分享图预览(Canvas 渲染的 PNG,§7.1 加密可视化"分享才模糊")
 * - 中部:文字说明 + referral 短链(可复制)
 * - 底部:下载 PNG / 复制链接 / 关闭
 *
 * 动画:用 framer-motion + A11 motion token(slow 400ms 强调动效)
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { transition } from '../../lib/motion';
import { getReferralCode, buildShareUrl } from './referralCode';
import { renderShareImage, type ShareImageInput } from './shareImage';
import type { Task } from '../../../shared/types';

interface ShareBrickModalProps {
  task: Task | null;
  brickCount: number;
  onClose: () => void;
}

export function ShareBrickModal({ task, brickCount, onClose }: ShareBrickModalProps) {
  const [copied, setCopied] = useState(false);
  const referralCode = useMemo(() => getReferralCode(), []);
  const shareUrl = useMemo(() => buildShareUrl(referralCode), [referralCode]);

  const imageDataUrl = useMemo<string>(() => {
    if (!task || !task.completedAt) return '';
    const input: ShareImageInput = {
      taskTitle: task.title,
      completedAt: task.completedAt,
      referralCode,
      brickCount: Math.max(1, brickCount),
    };
    return renderShareImage(input);
  }, [task, referralCode, brickCount]);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // 兜底:textarea + execCommand(老浏览器 / Electron)
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败:不阻断,用户可手动选中复制
    }
  };

  const handleDownload = () => {
    if (!imageDataUrl) return;
    const link = document.createElement('a');
    link.href = imageDataUrl;
    link.download = `goto-brick-${referralCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={!!task} onClose={onClose} title="分享你的第一块砖">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={transition('slow', 'emphasized')}
        className="space-y-4"
      >
        {imageDataUrl ? (
          <img
            src={imageDataUrl}
            alt="落砖分享图"
            className="mx-auto max-h-60 w-auto rounded-lg border border-gold/30 shadow-lg shadow-gold/10 sm:max-h-80"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400 dark:bg-slate-700 dark:text-slate-500">
            分享图渲染不可用
          </div>
        )}

        <p className="text-center text-sm text-slate-600 dark:text-slate-300">
          你的第一块时间已封存。分享给朋友,让他们也来开始记录自己的私人时间资产。
        </p>

        <div className="overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-xs text-gold dark:bg-slate-700/50 sm:text-sm">
          {shareUrl}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={handleDownload} disabled={!imageDataUrl}>
            下载图片
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleCopyLink}>
            {copied ? '已复制 ✓' : '复制链接'}
          </Button>
        </div>
      </motion.div>
    </Modal>
  );
}
