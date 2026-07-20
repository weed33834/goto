/**
 * E2E:分类 — CRUD、颜色、图标、批量
 *
 * 注意:categoriesSlice 有初始系统分类(工作/个人等),
 * 不存在空态。测试用唯一名称避免冲突,删除/查询用 scope 限定避免歧义。
 *
 * 覆盖:
 * 1. 默认系统分类可见(工作)
 * 2. 创建分类(名称 + 颜色 + 图标)
 * 3. 表单验证:空名称不提交(分类数不变)
 * 4. 图标下拉切换
 * 5. 批量创建
 * 6. 删除分类
 * 7. 任务数显示
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('分类', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // P1-5:删除分类会弹 window.confirm 二次确认,自动接受
    page.on('dialog', (d) => d.accept());
    await page.getByRole('link', { name: '分类' }).click();
    await expect(page.getByRole('heading', { name: '分类' })).toBeVisible();
  });

  test('默认系统分类可见(工作)', async ({ page }) => {
    await expect(page.getByText('工作', { exact: false }).first()).toBeVisible();
  });

  test('创建分类:名称 + 默认颜色 + 默认图标 → 列表显示', async ({ page }) => {
    await page.getByPlaceholder('输入分类名称').fill('测试分类A');
    await page.getByRole('button', { name: '添加分类' }).click();

    await expect(page.getByText('测试分类A')).toBeVisible();
  });

  test('表单验证:空名称不提交(分类数不变)', async ({ page }) => {
    // 用 "0 任务" 文本计数已存在的分类数(每个分类有 "0 任务")
    const initialCount = await page.getByText('0 任务').count();
    await page.getByRole('button', { name: '添加分类' }).click();
    const afterCount = await page.getByText('0 任务').count();
    expect(afterCount).toBe(initialCount);
  });

  test('图标下拉选择切换不报错', async ({ page }) => {
    const iconSelect = page.locator('select').first();
    await iconSelect.selectOption('book');
    await page.getByPlaceholder('输入分类名称').fill('阅读分类B');
    await page.getByRole('button', { name: '添加分类' }).click();
    await expect(page.getByText('阅读分类B')).toBeVisible();
  });

  test('批量创建 3 个分类 → 全部显示', async ({ page }) => {
    const names = ['分类X', '分类Y', '分类Z'];
    for (const name of names) {
      await page.getByPlaceholder('输入分类名称').fill(name);
      await page.getByRole('button', { name: '添加分类' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test('删除分类 → 列表中移除', async ({ page }) => {
    await page.getByPlaceholder('输入分类名称').fill('待删除分类C');
    await page.getByRole('button', { name: '添加分类' }).click();
    await expect(page.getByText('待删除分类C')).toBeVisible();

    // DOM 结构:<div class="flex items-center ..."> > <div class="flex-1"> > <p>名称</p>
    // "删除" 按钮在外层 flex 容器,需上溯 2 层(p → flex-1 → flex 容器)
    const nameElement = page.getByText('待删除分类C', { exact: true });
    const categoryRow = nameElement.locator('xpath=../..');
    await categoryRow.getByRole('button', { name: '删除' }).click();

    // P0-3:删除后 toast 含分类名,用 main locator 限定避免误命中
    const mainContent = page.locator('main');
    await expect(mainContent.getByText('待删除分类C')).not.toBeVisible();
  });

  test('新分类项显示任务数 "0 任务"', async ({ page }) => {
    await page.getByPlaceholder('输入分类名称').fill('任务数测试D');
    await page.getByRole('button', { name: '添加分类' }).click();
    // 同样需上溯 2 层到 flex 行容器
    const nameElement = page.getByText('任务数测试D', { exact: true });
    const categoryRow = nameElement.locator('xpath=../..');
    await expect(categoryRow).toContainText('0 任务');
  });
});
