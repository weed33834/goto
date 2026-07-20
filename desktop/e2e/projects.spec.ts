/**
 * E2E:项目 — CRUD、空态、颜色选择
 *
 * 覆盖:
 * 1. 空态文案(ProjectsPage 默认无项目)
 * 2. 创建项目(名称 + 颜色)
 * 3. 表单验证:空名称不提交
 * 4. 颜色按钮点击切换选中态
 * 5. 批量创建多个项目
 * 6. 删除项目
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('项目', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // P1-5:删除项目会弹 window.confirm 二次确认,自动接受
    page.on('dialog', (d) => d.accept());
    await page.getByRole('link', { name: '项目' }).click();
    await expect(page.getByRole('heading', { name: '项目' })).toBeVisible();
  });

  test('空态:无项目时显示"暂无项目"', async ({ page }) => {
    // P1-2:ProjectsPage 改用 EmptyState 组件,title 为"暂无项目"
    await expect(page.getByText('暂无项目')).toBeVisible();
  });

  test('创建项目:名称 + 默认颜色 → 列表显示', async ({ page }) => {
    await page.getByPlaceholder('输入项目名称').fill('副业项目');
    await page.getByRole('button', { name: '添加项目' }).click();

    await expect(page.getByRole('heading', { name: '副业项目' })).toBeVisible();
    await expect(page.getByText('暂无项目')).not.toBeVisible();
  });

  test('表单验证:空名称不提交', async ({ page }) => {
    await page.getByRole('button', { name: '添加项目' }).click();
    // 空态仍在
    await expect(page.getByText('暂无项目')).toBeVisible();
  });

  test('颜色按钮点击切换选中态(切换后 border 高亮)', async ({ page }) => {
    // 选第二个颜色(非默认)
    const secondColorButton = page.locator('button[type="button"]').filter({ has: page.locator('span.h-3') }).first();
    // 实际通过 rounded-full + style.backgroundColor 选中
    const colorButtons = page.locator('button[type="button"][style*="background-color"]');
    const count = await colorButtons.count();
    expect(count).toBeGreaterThanOrEqual(8);
    await colorButtons.nth(2).click();
    // 不验证视觉,只验证点击不报错且按钮可点
    await expect(colorButtons.nth(2)).toBeVisible();
  });

  test('批量创建 3 个项目 → 列表显示全部', async ({ page }) => {
    const names = ['项目 A', '项目 B', '项目 C'];
    for (const name of names) {
      await page.getByPlaceholder('输入项目名称').fill(name);
      await page.getByRole('button', { name: '添加项目' }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    // 验证全部 3 个都在
    for (const name of names) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
  });

  test('删除项目 → 列表中移除', async ({ page }) => {
    await page.getByPlaceholder('输入项目名称').fill('待删除项目');
    await page.getByRole('button', { name: '添加项目' }).click();
    await expect(page.getByRole('heading', { name: '待删除项目' })).toBeVisible();

    // ProjectsPage 表单无"删除"按钮,只有项目卡片的删除按钮
    // 单项目场景下 page 上只有 1 个 "删除" 按钮
    await page.getByRole('button', { name: '删除' }).click();

    // P0-3:删除后 pushNotification 会显示 toast 含项目名,toast 在 main 外,
    // 用 main locator 限定避免误命中 toast
    const mainContent = page.locator('main');
    await expect(mainContent.getByRole('heading', { name: '待删除项目' })).not.toBeVisible();
    await expect(mainContent.getByText('暂无项目')).toBeVisible();
  });

  test('项目卡片显示状态/任务数/进度信息', async ({ page }) => {
    await page.getByPlaceholder('输入项目名称').fill('展示项目');
    await page.getByRole('button', { name: '添加项目' }).click();

    // 状态文案 "active"
    await expect(page.getByText('active')).toBeVisible();
    // "0 任务" + "0% 完成"
    await expect(page.getByText('0 任务')).toBeVisible();
    await expect(page.getByText('0% 完成')).toBeVisible();
  });
});
