/**
 * E2E:日历 — 视图切换、导航、日期点击 Modal、新建任务
 *
 * 覆盖:
 * 1. 默认 month 视图 + 当前月 header
 * 2. 切换到 week 视图
 * 3. 切换到 blocks 视图(显示时段列表 07:00-22:00)
 * 4. 上月/下月导航
 * 5. "今天" 按钮重置 cursor
 * 6. 点击日期 → Modal 打开 → 显示"当天没有任务"
 * 7. Modal 内新建任务 → 任务出现在当天
 * 8. 关闭 Modal
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('日历', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    await page.getByRole('link', { name: '日历' }).click();
    await expect(page.getByRole('heading', { name: '日历' })).toBeVisible();
  });

  test('默认 month 视图 + 显示当前月份 header', async ({ page }) => {
    // headerLabel 形如 "2026年 7月"
    await expect(page.locator('h2')).toContainText(/年.*月/);
    // 视图切换按钮可见(exact:true 避免 "月" 匹配到 "上月"/"下月")
    await expect(page.getByRole('button', { name: '月', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '周', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '时间块', exact: true })).toBeVisible();
    // 星期表头
    await expect(page.getByText('日', { exact: true })).toBeVisible();
    await expect(page.getByText('一', { exact: true })).toBeVisible();
    await expect(page.getByText('六', { exact: true })).toBeVisible();
  });

  test('切换到 week 视图 → header 显示日期范围', async ({ page }) => {
    await page.getByRole('button', { name: '周', exact: true }).click();
    // week header 形如 "2026年7月19日 - 7月25日"
    await expect(page.locator('h2')).toContainText(/年.*月.*日.*-.*月.*日/);
  });

  test('切换到 blocks 视图 → 显示时段 07:00-22:00', async ({ page }) => {
    await page.getByRole('button', { name: '时间块', exact: true }).click();
    await expect(page.getByText('07:00')).toBeVisible();
    await expect(page.getByText('22:00')).toBeVisible();
    // 全天任务区标题(exact:true 避免匹配 "无全天任务")
    await expect(page.getByText('全天任务', { exact: true })).toBeVisible();
  });

  test('month 视图:点击"上月"/"下月" → header 月份变化', async ({ page }) => {
    const header = page.locator('h2');
    const initialHeader = await header.textContent();

    await page.getByRole('button', { name: '上月' }).click();
    const prevHeader = await header.textContent();
    expect(prevHeader).not.toBe(initialHeader);

    // 下月两次回到当前位置之后
    await page.getByRole('button', { name: '下月' }).click();
    await page.getByRole('button', { name: '下月' }).click();
    const nextHeader = await header.textContent();
    expect(nextHeader).not.toBe(prevHeader);
  });

  test('"今天"按钮重置 cursor 到当前月', async ({ page }) => {
    // 先点"上月"使 header 偏移
    await page.getByRole('button', { name: '上月' }).click();
    const offsetHeader = await page.locator('h2').textContent();

    // 点"今天"应回到当前月
    await page.getByRole('button', { name: '今天', exact: true }).click();
    const todayHeader = await page.locator('h2').textContent();
    expect(todayHeader).not.toBe(offsetHeader);
  });

  test('点击日期格 → Modal 打开 → 显示"当天没有任务"', async ({ page }) => {
    // 点 month 视图中第一个日期格(本月第一天或上月末)
    const firstDayButton = page.getByTestId('day-cell').first();
    await firstDayButton.click();

    // Modal 出现 — 标题包含 "年" 和 "月"
    await expect(page.getByRole('dialog')).toBeVisible();
    // 当天没任务的占位文案
    await expect(page.getByText('当天没有任务')).toBeVisible();
  });

  test('Modal 内新建任务 → 任务出现在 Modal 列表中', async ({ page }) => {
    // 点击今天(用 ring-primary 标识的当日格)
    const todayCell = page.locator('button.ring-2').first();
    await todayCell.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 在 Modal 内输入并提交任务
    const modalTaskInput = page.getByPlaceholder('添加当天任务...');
    await modalTaskInput.fill('日历测试任务');
    await page.getByRole('button', { name: '添加', exact: true }).click();

    // 任务应出现在 Modal 中
    await expect(page.getByText('日历测试任务')).toBeVisible();
    await expect(page.getByText('当天没有任务')).not.toBeVisible();
  });

  test('关闭 Modal → dialog 消失', async ({ page }) => {
    const firstDayButton = page.getByTestId('day-cell').first();
    await firstDayButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 点 Modal 的"关闭"按钮
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('week 视图:每天格子可见 + 显示"+"添加按钮', async ({ page }) => {
    await page.getByRole('button', { name: '周', exact: true }).click();
    // 7 天格子,每个有 "+" 添加按钮(title="添加任务")
    const addButtonCount = await page.getByTitle('添加任务').count();
    expect(addButtonCount).toBe(7);
  });

  test('blocks 视图:点击空时段 → Modal 打开带具体时段标题', async ({ page }) => {
    await page.getByRole('button', { name: '时间块', exact: true }).click();
    // blocks 视图:每个时段的 button 内有"点击添加"占位
    await page.getByText('点击添加').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Modal 标题应包含时段(e.g. "07:00")
    await expect(page.locator('[role="dialog"] h2')).toContainText('07:00');
  });
});
