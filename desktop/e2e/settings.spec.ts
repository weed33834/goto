/**
 * E2E:设置页 — 主题切换、安全开关、同步面板
 *
 * 覆盖:
 * 1. 设置页所有分区标题可见(安全/外观/数据/同步)
 * 2. 主题切换:浅色/深色/跟随系统 → 切换 dark class
 * 3. 安全设置:自动锁定开关
 * 4. 截图保护开关
 * 5. 同步面板:中继地址输入 + 保存按钮
 * 6. 同步面板:本机设备身份 + 已配对设备列表
 * 7. 数据备份:4 个按钮可见(导出备份/导入备份/导出 JSON/导入 JSON)
 *
 * 实现细节:
 * - SettingsPage 用 useSecuritySettingsStore + useThemeStore
 * - 主题切换通过 document.documentElement.classList 切 'dark'
 * - 同步面板由 SyncSettingsPanel 渲染
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('设置页', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    await page.getByRole('link', { name: /设置/ }).click();
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  });

  test('所有分区标题可见(安全/外观/数据/同步)', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '安全', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '外观', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '数据', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '同步', exact: true })).toBeVisible();
  });

  test('外观:主题按钮可见(浅色/深色/跟随系统)', async ({ page }) => {
    await expect(page.getByRole('button', { name: '浅色' })).toBeVisible();
    await expect(page.getByRole('button', { name: '深色' })).toBeVisible();
    await expect(page.getByRole('button', { name: '跟随系统' })).toBeVisible();
  });

  test('外观:点击"深色" → html 加 dark class', async ({ page }) => {
    await page.getByRole('button', { name: '深色' }).click();
    // 等待主题应用
    await expect(page.locator('html')).toHaveClass(/dark/);

    // 切回浅色 → dark class 消失
    await page.getByRole('button', { name: '浅色' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('安全:解锁方式按钮(主密码)可见', async ({ page }) => {
    // Web 端仅支持主密码解锁(历史生物识别 UI 已移除)
    await expect(page.getByRole('button', { name: '主密码' })).toBeVisible();
  });

  test('安全:无操作自动锁定设置可见(P1-3 升级为 select)', async ({ page }) => {
    // P1-3:原"5 分钟无操作自动锁定"Switch 升级为 select,支持多档时长
    await expect(page.getByText('无操作自动锁定')).toBeVisible();
    // 默认值 5 分钟应被选中
    await expect(page.locator('select').filter({ hasText: '5 分钟' })).toBeVisible();
  });

  test('安全:截图/录屏保护开关可见 + 限制说明文案', async ({ page }) => {
    await expect(page.getByText('截图/录屏保护')).toBeVisible();
    // 应有 Web 端限制说明
    await expect(page.getByText(/Web 端无此能力/)).toBeVisible();
  });

  test('数据:4 个备份按钮可见', async ({ page }) => {
    await expect(page.getByRole('button', { name: '导出备份' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入备份' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入 JSON' })).toBeVisible();
  });

  test('同步:中继服务器配置区可见 + 默认空', async ({ page }) => {
    // 中继服务器分区
    await expect(page.getByRole('heading', { name: '中继服务器' })).toBeVisible();
    // 输入框 placeholder
    await expect(page.getByPlaceholder('https://relay.example.com')).toBeVisible();
    // 保存按钮
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
  });

  test('同步:本机设备身份区显示"尚未生成"提示', async ({ page }) => {
    // 首启未配对 → 应显示"尚未生成设备身份"
    await expect(page.getByText(/尚未生成设备身份/)).toBeVisible();
  });

  test('同步:设备配对按钮(添加新设备 + 加入现有设备)可见', async ({ page }) => {
    await expect(page.getByRole('button', { name: '添加新设备' })).toBeVisible();
    await expect(page.getByRole('button', { name: '加入现有设备' })).toBeVisible();
  });

  test('同步:已配对设备列表显示"暂无已配对设备"', async ({ page }) => {
    // 首启状态,无配对设备
    await expect(page.getByText('暂无已配对设备')).toBeVisible();
  });

  test('同步:中继地址输入 + 保存 → 按钮启用状态变化', async ({ page }) => {
    const relayInput = page.getByPlaceholder('https://relay.example.com');
    const saveButton = page.getByRole('button', { name: '保存' });

    // 初始:空值,保存按钮应禁用(因为 relayInput.trim() === syncConfig.relayUrl)
    await expect(saveButton).toBeDisabled();

    // 输入新地址
    await relayInput.fill('https://my-relay.example.com');
    await expect(saveButton).toBeEnabled();

    // 保存
    await saveButton.click();
    // 保存后按钮再次禁用(因为 input 与 store 同步了)
    await expect(saveButton).toBeDisabled();
  });
});
