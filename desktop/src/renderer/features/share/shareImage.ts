/**
 * A19 分享单块砖 — Canvas 分享图生成(§3.6 / §7.1)
 *
 * 设计(对齐 §7.1 加密可视化语言):
 * - 本机永远清晰 → 但"分享/导出"时改为低分辨率模糊 + 暖金描边 + watermark
 * - Perlin-like noise 模糊背景(避免暴露任务细节,只保留"砖块意象")
 * - 暖金描边突出"砖"的轮廓(落砖意象)
 * - watermark:`goto.app/r/{referralCode}`
 *
 * 输出 PNG dataURL,Phase A 即可在浏览器/Canvas 2D 跑,
 * 不依赖额外图形库(避免重复造轮子,符合"能用依赖就用依赖"原则 —
 * 这里 Canvas 2D 是浏览器内置,无需引入额外包)。
 */

import { buildShareUrl } from './referralCode';

export interface ShareImageInput {
  /** 任务标题(不会直接渲染,只取长度做"砖块规模"暗示) */
  taskTitle: string;
  /** 任务完成时间(显示"X 月 Y 日落砖") */
  completedAt: Date;
  /** referralCode(用于 watermark + 短链) */
  referralCode: string;
  /** 已落砖总数(用于"已落下 N 块砖") */
  brickCount: number;
}

const CANVAS_W = 1080;
const CANVAS_H = 1350; // 4:5 竖图,适合小红书 / Instagram

/**
 * 简化 Perlin-like noise(避免引入 noise 库)
 * 基于 sin hash + 多层叠加,够用且性能稳定。
 */
function pseudoNoise(x: number, y: number, seed: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * P1 修复:主线程阻塞。
 *
 * 1080×1350 = 1.45M 像素,逐像素跑 3 次 sin/floor 同步执行会卡 ~200-500ms,
 * 期间整个 UI 完全冻结(包括任何动画/进度条)。
 *
 * 修复策略(对齐 §7.1 "低分辨率模糊" 意图):
 * - 噪声底本来就应该是"低分辨率模糊",无需逐像素高分辨率
 * - 在 1/4 分辨率小 canvas 上生成噪声(270×338 ≈ 91K 像素,16x 计算量降低)
 * - 再 drawImage 平滑放大到主 canvas,浏览器内置 bilinear 插值反而更柔和
 * - 输出视觉效果更"模糊意象",符合设计意图且不卡 UI
 */
function drawNoise(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const SCALE = 4; // 1/4 分辨率生成噪声,再放大
  const sw = Math.max(1, Math.floor(w / SCALE));
  const sh = Math.max(1, Math.floor(h / SCALE));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d');
  if (!sctx) return; // 降级:跳过噪声底,主图仍可渲染
  const imageData = sctx.createImageData(sw, sh);
  const data = imageData.data;
  // 8 色调色板取墨靛 + 暖金 + 蓝绿做颗粒底
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      // 噪声坐标也按 SCALE 缩放,保证视觉尺度一致
      const n =
        pseudoNoise(x * 0.03 * SCALE, y * 0.03 * SCALE, 1) * 0.5 +
        pseudoNoise(x * 0.1 * SCALE, y * 0.1 * SCALE, 2) * 0.3 +
        pseudoNoise(x * 0.3 * SCALE, y * 0.3 * SCALE, 3) * 0.2;
      const i = (y * sw + x) * 4;
      // 墨靛底 #0E1117,叠加暖金 #E8C56C 微光
      data[i] = Math.floor(14 + n * 40); // R
      data[i + 1] = Math.floor(17 + n * 30); // G
      data[i + 2] = Math.floor(23 + n * 20); // B
      data[i + 3] = 255; // A
    }
  }
  sctx.putImageData(imageData, 0, 0);
  // 平滑放大到主 canvas — 浏览器 bilinear 插值让噪点变柔和,匹配"低分辨率模糊"意图
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
}

/**
 * 渲染分享图,返回 PNG dataURL。
 * 浏览器无 Canvas 时返回空串(降级:只显示文字 modal)。
 */
export function renderShareImage(input: ShareImageInput): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. 噪点底(§7.1 "低分辨率模糊"意象)
  drawNoise(ctx, CANVAS_W, CANVAS_H);

  // 2. 中心"砖块"轮廓 — 暖金描边六边形(对齐加密时间晶意象 §7.1)
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2 - 80;
  const r = 220;
  ctx.save();
  ctx.strokeStyle = '#E8C56C'; // 暖金
  ctx.lineWidth = 6;
  ctx.shadowColor = '#E8C56C';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 3. 中心光点(单核光点,对齐生灵形态规范 §7.5)
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
  gradient.addColorStop(0, 'rgba(232, 197, 108, 0.9)');
  gradient.addColorStop(1, 'rgba(232, 197, 108, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - 60, cy - 60, 120, 120);
  ctx.restore();

  // 4. 主标题(暖金)
  ctx.fillStyle = '#E8C56C';
  ctx.font = '600 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('一块时间已封存', cx, cy + 200);

  // 5. 副标题(白)
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '400 32px -apple-system, BlinkMacSystemFont, sans-serif';
  const dateStr = `${input.completedAt.getMonth() + 1} 月 ${input.completedAt.getDate()} 日`;
  ctx.fillText(`${dateStr} 落下第 ${input.brickCount} 块砖`, cx, cy + 260);

  // 6. watermark(底部 + referral 短链)
  ctx.fillStyle = 'rgba(248, 250, 252, 0.6)';
  ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Goto · 你的私人时间资产', cx, CANVAS_H - 120);

  ctx.fillStyle = '#E8C56C';
  ctx.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(buildShareUrl(input.referralCode), cx, CANVAS_H - 70);

  return canvas.toDataURL('image/png');
}
