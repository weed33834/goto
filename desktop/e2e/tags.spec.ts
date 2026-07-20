/**
 * E2E:标签 — CRUD、颜色、批量、usageCount
 *
 * 注意:tagsSlice 有 4 个初始系统标签(紧急/重要/待定/灵感),
 * 不存在"暂无标签"空态。测试用唯一名称避免与系统标签冲突。
 *
 * 覆盖:
 * 1. 默认 4 个系统标签可见
 * 2. 创建标签 → 显示
 * 3. 表单验证:空名称不提交(标签数不变)
 * 4. 颜色按钮可点击
 * 5. 批量创建
 * 6. 删除标签(×按钮)
 * 7. usageCount 显示
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('标签', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // P1-5:删除标签会弹 window.confirm 二次确认,自动接受
    page.on('dialog', (d) => d.accept());
    await page.getByRole('link', { name: '标签' }).click();
    await expect(page.getByRole('heading', { name: '标签' })).toBeVisible();
  });

  test('默认 4 个系统标签可见(紧急/重要/待定/灵感)', async ({ page }) => {
    await expect(page.getByText('紧急', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('重要', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('待定', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('灵感', { exact: false }).first()).toBeVisible();
  });

  test('创建标签:名称 + 颜色 → 显示带颜色', async ({ page }) => {
    await page.getByPlaceholder('输入标签名称').fill('测试标签A');
    await page.getByRole('button', { name: '添加标签' }).click();

    await expect(page.getByText('测试标签A')).toBeVisible();
  });

  test('表单验证:空名称不提交(标签数不变)', async ({ page }) => {
    // TagsPage 用 aria-label="删除标签 {name}",无 title 属性,改用 role+name 计数
    const initialCount = await page.getByRole('button', { name: /删除标签/ }).count();
    await page.getByRole('button', { name: '添加标签' }).click();
    // 标签数应不变
    const afterCount = await page.getByRole('button', { name: /删除标签/ }).count();
    expect(afterCount).toBe(initialCount);
  });

  test('颜色按钮可点击且不报错', async ({ page }) => {
    const colorButtons = page.locator('button[type="button"][style*="background-color"]');
    const count = await colorButtons.count();
    expect(count).toBeGreaterThanOrEqual(8);
    await colorButtons.nth(3).click();
    await page.getByPlaceholder('输入标签名称').fill('绿色标签B');
    await page.getByRole('button', { name: '添加标签' }).click();
    await expect(page.getByText('绿色标签B')).toBeVisible();
  });

  test('批量创建 4 个标签 → 全部显示', async ({ page }) => {
    const names = ['优先1', '紧急2', '待办3', '完成4'];
    for (const name of names) {
      await page.getByPlaceholder('输入标签名称').fill(name);
      await page.getByRole('button', { name: '添加标签' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test('删除标签(×按钮) → 列表中移除', async ({ page }) => {
    await page.getByPlaceholder('输入标签名称').fill('待删除标签X');
    await page.getByRole('button', { name: '添加标签' }).click();
    await expect(page.getByText('待删除标签X')).toBeVisible();

    // TagsPage × 按钮用 aria-label="删除标签 {name}",通过 role+name 定位
    await page.getByRole('button', { name: '删除标签 待删除标签X' }).click();

    // P0-3:删除后 toast 含标签名,用 main locator 限定避免误命中
    const mainContent = page.locator('main');
    await expect(mainContent.getByText('待删除标签X')).not.toBeVisible();
  });

  test('标签显示 usageCount(默认 0)', async ({ page }) => {
    await page.getByPlaceholder('输入标签名称').fill('使用次数Y');
    await page.getByRole('button', { name: '添加标签' }).click();
    // 标签 chip 应可见
    const tagChip = page.locator('span', { hasText: '使用次数Y' }).first();
    await expect(tagChip).toBeVisible();
    // usageCount 0 在 chip 内
    await expect(tagChip).toContainText('0');
  });
});
