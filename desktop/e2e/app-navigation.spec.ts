/**
 * E2E:基础应用导航 — 验证路由、页面加载、Sidebar 导航
 *
 * 覆盖:
 * 1. 首启解锁流程
 * 2. Sidebar 导航到各页面
 * 3. 页面标题/内容正确渲染
 * 4. 锁定功能
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp, navigateTo } from './helpers';

test.describe('应用导航与路由', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
  });

  test('首启设置主密码 → 解锁 → 显示时间织锦', async ({ page }) => {
    // 已在 setupUnlockedApp 中解锁,验证主界面 MosaicPage h1 可见
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible();
    // Sidebar 的 Goto logo 可见(桌面端 aside 内,排除 MobileHeader 的同名 span)
    await expect(page.locator('aside').getByText('Goto')).toBeVisible();
  });

  test('Sidebar 导航到今日任务', async ({ page }) => {
    await page.getByRole('link', { name: /今日任务/ }).click();
    await expect(page).toHaveURL(/\/today/);
    // 页面标题可见(h1,与 Sidebar navlink 区分)
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();
  });

  test('Sidebar 导航到日历', async ({ page }) => {
    await page.getByRole('link', { name: /日历/ }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });

  test('Sidebar 导航到项目', async ({ page }) => {
    await page.getByRole('link', { name: /项目/ }).click();
    await expect(page).toHaveURL(/\/projects/);
  });

  test('Sidebar 导航到分类', async ({ page }) => {
    await page.getByRole('link', { name: /分类/ }).click();
    await expect(page).toHaveURL(/\/categories/);
  });

  test('Sidebar 导航到标签', async ({ page }) => {
    await page.getByRole('link', { name: /标签/ }).click();
    await expect(page).toHaveURL(/\/tags/);
  });

  test('Sidebar 导航到搜索', async ({ page }) => {
    await page.getByRole('link', { name: /搜索/ }).click();
    await expect(page).toHaveURL(/\/search/);
  });

  test('Sidebar 导航到设置', async ({ page }) => {
    await page.getByRole('link', { name: /设置/ }).click();
    await expect(page).toHaveURL(/\/settings/);
    // 设置页面分区标题可见(h2 精确匹配,避免子串误匹配 Sidebar 的其他文本)
    await expect(page.getByRole('heading', { name: '安全', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '外观', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '数据', exact: true })).toBeVisible();
  });

  test('未知路由 → 重定向到时间织锦', async ({ page }) => {
    await navigateTo(page, '/nonexistent-route');
    // 应重定向到 /mosaic
    await expect(page).toHaveURL(/\/mosaic/);
  });

  test('锁定按钮 → 返回锁屏', async ({ page }) => {
    // 点击 Sidebar 底部的"锁定"按钮
    await page.getByRole('button', { name: /锁定/ }).click();
    // 应回到锁屏界面
    await expect(page.getByPlaceholder(/输入主密码/)).toBeVisible({ timeout: 10_000 });
  });
});
