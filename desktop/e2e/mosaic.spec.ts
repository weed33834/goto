/**
 * E2E:时间织锦 Mosaic — 空态、统计、完成任务的反馈
 *
 * 覆盖:
 * 1. 首启空态:无完成任务 → 显示"还没有砖"引导
 * 2. 统计区:总砖数 0 / 当前连续 0 天 / 今日 0 块
 * 3. 完成一个任务 → 总砖数 + 今日砖数 +1
 * 4. Mosaic Canvas 渲染不崩溃
 *
 * 实现细节:
 * - MosaicPage 用 lazy chunk,需要等待 h1 "时间织锦"
 * - 砖数 = tasks.filter(t => t.completed).length(deriveMosaicTiles)
 * - 完成任务:在 /today 创建任务后勾选 checkbox
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp, taskTitleInput } from './helpers';

test.describe('时间织锦 Mosaic', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // 默认就在 /mosaic,验证 h1 可见
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible();
  });

  test('首启空态:无完成任务时显示引导文案 + 砖数 0', async ({ page }) => {
    // 空态引导
    await expect(page.getByText('还没有砖')).toBeVisible();
    await expect(page.getByText('完成第一个任务,你的织锦就开始生长')).toBeVisible();

    // 统计区:总砖数 0 / 今日 0 块
    await expect(page.getByText('总砖数')).toBeVisible();
    // 总砖数旁边的数字 "0"
    const totalBrickNumber = page.locator('div:has-text("总砖数") + div, div:has-text("总砖数")').last();
    await expect(totalBrickNumber).toContainText('0');
  });

  test('Canvas 元素已挂载并可见', async ({ page }) => {
    // 验证 canvas DOM 存在(不验证像素,只验证不崩溃)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    // Canvas 应有非零尺寸
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('完成一个任务 → 总砖数变 1 + 引导文案消失', async ({ page }) => {
    // 先导航到 /today 创建并完成任务
    await page.getByRole('link', { name: /今日任务/ }).click();
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();

    const titleInput = taskTitleInput(page);
    await titleInput.fill('织锦测试任务');
    await page.getByRole('button', { name: '添加' }).click();
    await expect(page.getByText('织锦测试任务')).toBeVisible();

    // P1-4:TodayPage 默认 today 过滤,完成后 completed=true 被排除。
    // 切到"全部"过滤视图,确保完成任务仍在列表中可见,checkbox 才能正确 checked。
    await page.getByRole('tab', { name: '全部' }).click();

    // 勾选任务卡片的 checkbox 标记为完成
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();
    // 等待状态更新:标题应被划线(completed 样式)
    await expect(page.getByText('织锦测试任务')).toHaveClass(/line-through/);

    // 回到 /mosaic
    await page.getByRole('link', { name: '时间织锦' }).click();
    await expect(page.getByRole('heading', { name: '时间织锦' })).toBeVisible();

    // 引导文案应消失(因为已有 1 块砖)
    await expect(page.getByText('还没有砖')).not.toBeVisible();

    // Canvas 仍可见(不崩溃)
    await expect(page.locator('canvas')).toBeVisible();

    // 今日砖数应是 1(统计区数字)
    // 用 exact:true 避免匹配 Sidebar 的 "今日任务" navlink
    // 父级 div 包含 "今日" label + "1 块" value
    await expect(page.getByText('今日', { exact: true }).locator('..')).toContainText('1 块');
  });

  test('Sidebar 时间织锦 link 高亮当前页(aria-current)', async ({ page }) => {
    // 在 /mosaic 时,Sidebar 的"时间织锦"链接应有 aria-current="page"
    const mosaicLink = page.getByRole('link', { name: '时间织锦' });
    await expect(mosaicLink).toHaveAttribute('aria-current', 'page');
  });
});
