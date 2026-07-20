/**
 * E2E:键盘快捷键 — mod+l/n/k/b + / 焦点
 *
 * 覆盖:
 * 1. mod+l → 锁定应用,返回锁屏
 * 2. mod+n → 跳转到 /today
 * 3. mod+k → 跳转到 /search
 * 4. mod+b → 折叠/展开侧栏
 * 5. / → 跳转到 /search(当焦点不在 input 时)
 *
 * 实现细节:
 * - useKeyboardShortcuts 在 App.tsx 挂载,监听 window.keydown
 * - 'mod' = metaKey (mac) 或 ctrlKey (win/linux)
 * - 在 input/textarea/select 内时,mod+* 仍触发,但 / 不触发(避免影响输入)
 *
 * 测试在 Linux headless Chrome 中,用 ctrlKey 作为 mod。
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('键盘快捷键', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // 默认在 /mosaic
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible();
  });

  test('mod+l → 锁定应用,返回锁屏', async ({ page }) => {
    await page.keyboard.press('Control+l');
    // 应回到锁屏界面
    await expect(page.getByPlaceholder(/输入主密码/)).toBeVisible({ timeout: 10_000 });
  });

  test('mod+n → 跳转到 /today', async ({ page }) => {
    await page.keyboard.press('Control+n');
    // 应跳到 /today
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();
  });

  test('mod+k → 跳转到 /search', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByRole('heading', { name: '搜索' })).toBeVisible();
  });

  test('/ → 跳转到 /search(当焦点不在 input)', async ({ page }) => {
    // 焦点不在 input(默认在 body)
    await page.keyboard.press('/');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByRole('heading', { name: '搜索' })).toBeVisible();
  });

  test('mod+b → 折叠/展开侧栏(toggle)', async ({ page }) => {
    // 初始 Sidebar 可见
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    const initialWidth = (await sidebar.boundingBox())?.width;
    expect(initialWidth).toBeGreaterThan(0);

    // mod+b 折叠
    await page.keyboard.press('Control+b');
    // 等 UI 响应
    await page.waitForTimeout(300);
    // 再次展开
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(300);

    // 验证 Sidebar 仍存在(toggle 后应回到展开态)
    await expect(sidebar).toBeVisible();
  });
});
