import { test, expect } from '@playwright/test';

// 移动端 e2e(iPhone 视口):验证"本地优先"核心闭环真实可用。
// 不依赖后端:apiAvailable 默认 false,任务只落本地 IndexedDB。
test('核心闭环:加载 → 新增任务 → 完成', async ({ page }) => {
  await page.goto('/');

  // 等待应用启动完成(加载态 → FAB 可见)。
  await expect(page.getByTestId('fab-new')).toBeVisible();

  // 新增任务
  await page.getByTestId('fab-new').click();
  await page.getByTestId('task-title').fill('买牛奶');
  await page.getByTestId('task-submit').click();
  await expect(page.getByText('买牛奶')).toBeVisible();

  // 标记完成(标题行出现删除线)。
  await page.getByRole('button', { name: '标记完成' }).click();
  await expect(page.locator('p.line-through').first()).toBeVisible();
});
