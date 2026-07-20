/**
 * E2E:锁屏与解锁 — 首启设置、错误态、锁定/解锁循环
 *
 * 覆盖:
 * 1. 首启:placeholder 是"设置主密码（至少 8 位）"
 * 2. 短密码(<8 位)→ 显示"主密码至少 8 位"
 * 3. 设置成功 → 进入主界面
 * 4. 锁定 → 解锁:placeholder 是"输入主密码"
 * 5. 错误密码 → 显示"密码错误"
 * 6. 正确密码 → 进入主界面
 *
 * 实现细节:
 * - LockScreen 检测 hasVerifier:
 *   false → 首启模式(placeholder "设置主密码（至少 8 位）",按钮"设置并解锁")
 *   true  → 解锁模式(placeholder "输入主密码",按钮"解锁")
 * - setupMasterPassword 校验 password.length >= 8
 * - unlock 用 argon2id verifier 校验密码
 */
import { test, expect } from '@playwright/test';
import { ONBOARDING_KEY } from './helpers';

const TEST_PASSWORD = 'test-password-123';

test.describe('锁屏与解锁', () => {
  test.beforeEach(async ({ page }) => {
    // 跳过 Onboarding
    await page.addInitScript((key) => {
      localStorage.setItem(key, '1');
    }, ONBOARDING_KEY);
  });

  test('首启:placeholder 是"设置主密码（至少 8 位）"', async ({ page }) => {
    await page.goto('/#/mosaic');
    const passwordInput = page.getByPlaceholder(/设置主密码/);
    await expect(passwordInput).toBeVisible();
    // placeholder 应包含"设置主密码"
    const placeholder = await passwordInput.getAttribute('placeholder');
    expect(placeholder).toContain('设置主密码');
    expect(placeholder).toContain('8 位');
    // 按钮文字"设置并解锁"
    await expect(page.getByRole('button', { name: '设置并解锁' })).toBeVisible();
  });

  test('首启:短密码(<8 位)显示错误,不进入主界面', async ({ page }) => {
    await page.goto('/#/mosaic');
    const passwordInput = page.getByPlaceholder(/设置主密码/);
    await passwordInput.fill('short'); // 5 位
    await page.getByRole('button', { name: '设置并解锁' }).click();

    // 应显示错误"主密码至少 8 位"
    await expect(page.getByText('主密码至少 8 位')).toBeVisible();
    // 仍在锁屏界面(没有"时间织锦" h1)
    await expect(page.getByRole('heading', { name: '时间织锦' })).not.toBeVisible();
  });

  test('首启:空密码点设置 → 显示"请输入主密码"', async ({ page }) => {
    await page.goto('/#/mosaic');
    // 不填密码直接点设置
    await page.getByRole('button', { name: '设置并解锁' }).click();

    await expect(page.getByText('请输入主密码')).toBeVisible();
  });

  test('首启:合法密码(>=8 位)设置成功 → 进入主界面', async ({ page }) => {
    await page.goto('/#/mosaic');
    const passwordInput = page.getByPlaceholder(/设置主密码/);
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();

    // 等待主界面加载
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible({ timeout: 15_000 });
  });

  test('已设置密码:锁定后 placeholder 变"输入主密码"', async ({ page }) => {
    // 先完成首启设置
    await page.goto('/#/mosaic');
    const setupInput = page.getByPlaceholder(/设置主密码/);
    await setupInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible({ timeout: 15_000 });

    // 点击 Sidebar 底部"锁定"按钮
    await page.getByRole('button', { name: /锁定/ }).click();

    // 应回到锁屏界面,placeholder 是"输入主密码"
    const unlockInput = page.getByPlaceholder(/输入主密码/);
    await expect(unlockInput).toBeVisible({ timeout: 10_000 });
    const placeholder = await unlockInput.getAttribute('placeholder');
    expect(placeholder).toBe('输入主密码');
    // 按钮文字"解锁"(不是"设置并解锁")
    await expect(page.getByRole('button', { name: '解锁' })).toBeVisible();
  });

  test('已设置密码:错误密码 → 显示"密码错误"', async ({ page }) => {
    await page.goto('/#/mosaic');
    const setupInput = page.getByPlaceholder(/设置主密码/);
    await setupInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible({ timeout: 15_000 });

    // 锁定
    await page.getByRole('button', { name: /锁定/ }).click();
    await expect(page.getByPlaceholder(/输入主密码/)).toBeVisible({ timeout: 10_000 });

    // 输入错误密码
    await page.getByPlaceholder(/输入主密码/).fill('wrong-password-999');
    await page.getByRole('button', { name: '解锁' }).click();

    // 应显示"密码错误"
    await expect(page.getByText('密码错误')).toBeVisible();
    // 仍在锁屏
    await expect(page.getByRole('heading', { name: '时间织锦' })).not.toBeVisible();
  });

  test('已设置密码:正确密码 → 解锁进入主界面', async ({ page }) => {
    await page.goto('/#/mosaic');
    const setupInput = page.getByPlaceholder(/设置主密码/);
    await setupInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible({ timeout: 15_000 });

    // 锁定
    await page.getByRole('button', { name: /锁定/ }).click();
    await expect(page.getByPlaceholder(/输入主密码/)).toBeVisible({ timeout: 10_000 });

    // 输入正确密码
    await page.getByPlaceholder(/输入主密码/).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '解锁' }).click();

    // 应进入主界面
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible({ timeout: 15_000 });
  });
});
