/**
 * E2E:数据导入导出 — 通过 mock window.prompt/confirm 触发备份流程
 *
 * SettingsPage 4 个备份按钮:
 * - 导出备份 (需 prompt 输入密码)
 * - 导入备份 (需 confirm + prompt + 可能 prompt 新密码)
 * - 导出 JSON (无交互)
 * - 导入 JSON (需 confirm + prompt)
 *
 * 注意:用 page.evaluate 在 main world 重写 window.prompt/confirm,
 * 不用 addInitScript + reload(reload 后 LockScreen 仍需解锁,且 URL 不重置回 /mosaic)。
 *
 * 覆盖:
 * 1. 4 个按钮可见
 * 2. 导出备份:prompt 输入密码 → 调用 backup.exportBackup → 显示反馈
 * 3. 导出备份:prompt 取消(返回 null) → 不调用,无反馈
 * 4. 导出 JSON:无 prompt → 调用 exportJson → 显示反馈
 * 5. 导入备份:confirm 取消 → 不调用
 * 6. 导入备份:confirm 确认 + prompt 密码 → 调用 importBackup
 * 7. 导入 JSON:confirm 确认 + prompt 密码 → 调用 importJson
 * 8. 反馈消息显示 4 秒后消失
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('数据导入导出', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    await page.getByRole('link', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('4 个备份按钮可见', async ({ page }) => {
    await expect(page.getByRole('button', { name: '导出备份' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入备份' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入 JSON' })).toBeVisible();
  });

  // P1-1:第三方数据导入入口可见性 + 文件 input 默认隐藏
  test('P1-1:"从其他应用导入"卡片与按钮可见,input 隐藏', async ({ page }) => {
    await expect(page.getByText('从其他应用导入')).toBeVisible();
    await expect(page.getByRole('button', { name: '选择文件导入' })).toBeVisible();
    // input 是 hidden,不参与 tab 顺序,也不可见
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeHidden();
    await expect(fileInput).toHaveAttribute('aria-label', '选择 Todoist CSV 或 TickTick JSON 文件');
  });

  test('导出备份:prompt 输入密码 → 显示反馈消息', async ({ page }) => {
    await page.evaluate(() => {
      window.prompt = () => 'test-password-123';
    });

    await page.getByRole('button', { name: '导出备份' }).click();

    const feedback = page.locator('span.text-sm').filter({ hasText: /导出/ }).first();
    await expect(feedback).toBeVisible({ timeout: 5_000 });
  });

  test('导出备份:prompt 取消(null) → 不显示反馈', async ({ page }) => {
    await page.evaluate(() => {
      window.prompt = () => null;
    });

    await page.getByRole('button', { name: '导出备份' }).click();

    await page.waitForTimeout(500);
    const feedback = page.locator('span.text-sm').filter({ hasText: /导出/ });
    await expect(feedback).toHaveCount(0);
  });

  test('导出 JSON:无 prompt → 直接调用 → 显示反馈', async ({ page }) => {
    await page.getByRole('button', { name: '导出 JSON' }).click();
    const feedback = page.locator('span.text-sm').filter({ hasText: /导出/ }).first();
    await expect(feedback).toBeVisible({ timeout: 5_000 });
  });

  test('导入备份:confirm 取消 → 不调用、不显示反馈', async ({ page }) => {
    await page.evaluate(() => {
      window.confirm = () => false;
    });

    await page.getByRole('button', { name: '导入备份' }).click();

    await page.waitForTimeout(500);
    const feedback = page.locator('span.text-sm').filter({ hasText: /导入/ });
    await expect(feedback).toHaveCount(0);
  });

  test('导入备份:confirm 确认 + prompt 密码 → 调用 → 显示反馈', async ({ page }) => {
    await page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => 'test-password-123';
      // pickFile 在 headless 环境会挂起 60s,直接 mock importBackup 绕过文件选择器
      window.gotoAPI.backup.importBackup = async () => ({ success: true, message: '测试导入成功' });
    });

    await page.getByRole('button', { name: '导入备份' }).click();

    const feedback = page.locator('span.text-sm').filter({ hasText: /导入/ }).first();
    await expect(feedback).toBeVisible({ timeout: 10_000 });
  });

  test('导入 JSON:confirm 确认 + prompt 密码 → 调用 → 显示反馈', async ({ page }) => {
    await page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => 'test-password-123';
      // 同样 mock importJson 绕过 pickFile
      window.gotoAPI.backup.importJson = async () => ({ success: true, message: 'JSON 导入成功' });
    });

    await page.getByRole('button', { name: '导入 JSON' }).click();

    const feedback = page.locator('span.text-sm').filter({ hasText: /导入/ }).first();
    await expect(feedback).toBeVisible({ timeout: 10_000 });
  });

  test('反馈消息 4 秒后自动消失', async ({ page }) => {
    await page.getByRole('button', { name: '导出 JSON' }).click();
    const feedback = page.locator('span.text-sm').filter({ hasText: /导出/ }).first();
    await expect(feedback).toBeVisible({ timeout: 5_000 });
    // 等 5 秒应消失(SettingsPage 用 setTimeout 4000ms 清除)
    await expect(feedback).not.toBeVisible({ timeout: 6_000 });
  });
});
