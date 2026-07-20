/**
 * A19 分享单块砖功能 — referralCode 生成(§3.6 / §5 A19)
 *
 * 设计目标:
 * - 短链可分享:`goto.app/r/{referralCode}`
 * - 同一用户稳定(本地持久化,localStorage 兜底)
 * - 不强依赖后端,Phase A 即可跑
 *
 * 格式:`goto-` 前缀 + 6 位 base32 字符(避免歧义字符 0/O/1/I)
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 字符,无 0/O/1/I
const CODE_LENGTH = 6;
const STORAGE_KEY = 'goto:referralCode';

function randomChar(): string {
  // 用 crypto.getRandomValues,避免 Math.random 可预测
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return ALPHABET[arr[0] % ALPHABET.length];
  }
  // 兜底(非浏览器环境,如测试)
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

function generate(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += randomChar();
  }
  return code;
}

/**
 * 取当前用户 referralCode;若本地无则生成并持久化。
 * 同一浏览器/设备返回稳定值。
 */
export function getReferralCode(): string {
  if (typeof localStorage === 'undefined') {
    // 测试环境(SSR / node)直接返回新生成值,不持久化
    return generate();
  }
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && /^[A-Z2-9]{6}$/.test(existing)) {
    return existing;
  }
  const fresh = generate();
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // localStorage 不可用(隐私模式)则不持久化,仅本次会话有效
  }
  return fresh;
}

/** 生成完整分享 URL(带 https:// 协议,可直接点击跳转) */
export function buildShareUrl(code: string): string {
  return `https://goto.app/r/${code}`;
}
