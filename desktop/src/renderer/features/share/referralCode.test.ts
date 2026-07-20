// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getReferralCode, buildShareUrl } from './referralCode';

describe('referralCode', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  it('生成 6 位字符,无歧义字符(0/O/1/I)', () => {
    const code = getReferralCode();
    expect(code).toHaveLength(6);
    // 不应包含 0/O/1/I
    expect(code).not.toMatch(/[01OI]/);
    // 仅大写字母 + 数字 2-9
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('同 localStorage 内稳定返回', () => {
    const first = getReferralCode();
    const second = getReferralCode();
    expect(second).toBe(first);
  });

  it('buildShareUrl 拼接短链(含 https:// 协议)', () => {
    expect(buildShareUrl('ABC234')).toBe('https://goto.app/r/ABC234');
  });
});
