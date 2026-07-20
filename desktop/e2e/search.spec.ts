/**
 * E2E:搜索 — 关键词搜索、空结果、搜索历史
 *
 * 覆盖:
 * 1. 搜索框 placeholder 正确
 * 2. 空查询 → 不显示结果区
 * 3. 输入查询 + 提交 → 显示 "找到 N 个结果"
 * 4. 匹配标题或描述
 * 5. 无匹配 → 显示 "未找到匹配的任务"
 * 6. 搜索历史(提交后存入历史,点击历史回填)
 * 7. 清除历史
 *
 * 实现细节:
 * - SearchPage 使用 useAppStore.tasks + query 实时过滤(防抖式 useMemo)
 * - 提交搜索 → addSearchToHistory(query)
 * - 历史只在 query 为空时显示
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp, taskTitleInput, taskDescriptionInput } from './helpers';

test.describe('搜索', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // 先到 /today 创建一些任务作为搜索数据源
    await page.getByRole('link', { name: /今日任务/ }).click();
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();

    const titleInput = taskTitleInput(page);
    const descInput = taskDescriptionInput(page);

    await titleInput.fill('买菜');
    await descInput.fill('西红柿 2 斤');
    await page.getByRole('button', { name: '添加' }).click();
    await expect(titleInput).toHaveValue('');

    await titleInput.fill('写报告');
    await descInput.fill('季度总结');
    await page.getByRole('button', { name: '添加' }).click();
    await expect(titleInput).toHaveValue('');

    // 导航到搜索页
    await page.getByRole('link', { name: /搜索/ }).click();
    await expect(page.getByRole('heading', { name: '搜索' })).toBeVisible();
  });

  test('搜索框 placeholder + autofocus', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await expect(searchInput).toBeVisible();
    // 应该自动聚焦
    await expect(searchInput).toBeFocused();
  });

  test('空查询 → 不显示结果区也不显示历史', async ({ page }) => {
    // 输入框为空(autofocus 但未输入)
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await expect(searchInput).toHaveValue('');
    // 不应显示"找到 N 个结果"(因为 query 为空)
    await expect(page.getByText(/找到 \d+ 个结果/)).not.toBeVisible();
  });

  test('输入查询匹配标题 → 实时显示结果', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await searchInput.fill('买菜');

    // 应显示"找到 1 个结果"
    await expect(page.getByText('找到 1 个结果')).toBeVisible();
    // 任务卡片应可见
    await expect(page.getByText('买菜')).toBeVisible();
    // 不应显示"未找到"
    await expect(page.getByText('未找到匹配的任务')).not.toBeVisible();
  });

  test('输入查询匹配描述 → 显示对应任务', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await searchInput.fill('西红柿');

    // 匹配 description = "西红柿 2 斤"
    await expect(page.getByText('找到 1 个结果')).toBeVisible();
    await expect(page.getByText('买菜')).toBeVisible();
  });

  test('无匹配查询 → 显示"未找到匹配的任务"', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await searchInput.fill('不存在的任务xyz');

    await expect(page.getByText('找到 0 个结果')).toBeVisible();
    await expect(page.getByText('未找到匹配的任务')).toBeVisible();
  });

  test('提交搜索 → 写入历史,清空查询后历史可见', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    // 输入并提交
    await searchInput.fill('买菜');
    await page.getByRole('button', { name: '搜索' }).click();

    // 清空查询
    await searchInput.fill('');

    // 历史区应显示"搜索历史"标签 + 之前提交的查询
    await expect(page.getByText('搜索历史')).toBeVisible();
    await expect(page.getByRole('button', { name: '买菜' })).toBeVisible();
  });

  test('点击历史项 → 回填到搜索框 + 触发搜索', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await searchInput.fill('写报告');
    await page.getByRole('button', { name: '搜索' }).click();
    await searchInput.fill('');

    // 点击历史项
    await page.getByRole('button', { name: '写报告' }).click();

    // 搜索框应回填
    await expect(searchInput).toHaveValue('写报告');
    // 应显示搜索结果
    await expect(page.getByText('找到 1 个结果')).toBeVisible();
  });

  test('清除搜索历史 → 历史项消失', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜索任务标题或描述...');
    await searchInput.fill('买菜');
    await page.getByRole('button', { name: '搜索' }).click();
    await searchInput.fill('');

    // 历史区有"清除"按钮
    await expect(page.getByText('搜索历史')).toBeVisible();
    await page.getByText('清除').click();

    // 历史区应消失
    await expect(page.getByText('搜索历史')).not.toBeVisible();
  });
});
