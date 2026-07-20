/**
 * E2E:Onboarding 3 屏引导流程(§7.8)
 *
 * 覆盖:
 * 1. 首启后 500ms 弹出 Onboarding modal
 * 2. Step 1:默认任务"读 30 分钟书" → 添加任务 → 进入 step 2
 * 3. Step 1:自定义任务标题 → 添加任务 → 进入 step 2
 * 4. Step 2:"稍后再说" → 进入 step 3
 * 5. Step 2:"去完成它" → 跳转 /today + 进入 step 3
 * 6. Step 3:"开始使用" → 关闭 modal + 写入 onboardingDone
 * 7."跳过引导" 任何时候可关闭
 *
 * 关键:
 * - 不预置 goto:onboardingDone,触发真实 onboarding 流程
 * - 但仍需设置主密码进入主界面
 * - Onboarding 延迟 500ms 才显示
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_PASSWORD = 'test-password-123';

/**
 * 设置主密码 + 进入主界面,但不跳过 Onboarding。
 * 与 helpers.ts 的 setupUnlockedApp 不同,这里不预置 onboardingDone。
 */
async function setupAppWithOnboarding(page: Page): Promise<void> {
  // 不预置 onboardingDone,触发 onboarding 流程
  await page.goto('/#/mosaic');

  const passwordInput = page.getByPlaceholder(/设置主密码|输入主密码/);
  await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
  const placeholder = await passwordInput.getAttribute('placeholder');
  if (placeholder?.includes('设置主密码')) {
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();
  } else {
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '解锁' }).click();
  }

  // 等待主界面加载
  await page.getByRole('heading', { name: '时间织锦' }).waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('Onboarding 引导流程', () => {
  test('首启 → 500ms 后弹出 Onboarding modal', async ({ page }) => {
    await setupAppWithOnboarding(page);

    // 等待 onboarding 弹出(延迟 500ms + 余量)
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });
    // 进度条 3 段
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible();
  });

  test('Step 1:点"添加任务"默认创建"读 30 分钟书" → 进入 step 2', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });

    // 不填任务名,直接点添加 → 使用默认值"读 30 分钟书"
    await page.getByRole('button', { name: '添加任务' }).click();

    // 进入 step 2:标题"完成它,看你的画布长出第一块砖"
    await expect(page.getByText('完成它,看你的画布长出第一块砖')).toBeVisible();
  });

  test('Step 1:自定义任务标题 → 添加后任务出现在 Today', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder('例:读 30 分钟书').fill('我的自定义任务');
    await page.getByRole('button', { name: '添加任务' }).click();

    await expect(page.getByText('完成它,看你的画布长出第一块砖')).toBeVisible();

    // 跳过剩余步骤(Onboarding.tsx 的跳过按钮有 aria-label="跳过引导",accessible name 以 aria-label 为准)
    await page.getByRole('button', { name: '跳过引导' }).click();
    await expect(page.getByText('添加今天的第一个任务')).not.toBeVisible();

    // 导航到 /today 验证任务存在
    await page.getByRole('link', { name: /今日任务/ }).click();
    await expect(page.getByText('我的自定义任务')).toBeVisible();
  });

  test('Step 2:"稍后再说" → 进入 step 3', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '添加任务' }).click();

    // Step 2:点"稍后再说"
    await expect(page.getByText('完成它,看你的画布长出第一块砖')).toBeVisible();
    await page.getByRole('button', { name: '稍后再说' }).click();

    // 进入 step 3:私密空间
    await expect(page.getByText('这是你的私密空间')).toBeVisible();
  });

  test('Step 2:"去完成它" → 跳转到 /today + 进入 step 3', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '添加任务' }).click();

    await page.getByRole('button', { name: '去完成它' }).click();

    // 跳到 /today
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();
    // 进入 step 3
    await expect(page.getByText('这是你的私密空间')).toBeVisible();
  });

  test('Step 3:"开始使用" → 关闭 modal + localStorage 写入 onboardingDone', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '添加任务' }).click();
    await page.getByRole('button', { name: '稍后再说' }).click();
    await expect(page.getByText('这是你的私密空间')).toBeVisible();

    await page.getByRole('button', { name: '开始使用' }).click();

    // Modal 关闭
    await expect(page.getByText('这是你的私密空间')).not.toBeVisible();
    await expect(page.getByText('添加今天的第一个任务')).not.toBeVisible();

    // localStorage 应已写入
    const onboardingDone = await page.evaluate(() => localStorage.getItem('goto:onboardingDone'));
    expect(onboardingDone).toBe('1');
  });

  test('"跳过引导" 按钮可关闭 onboarding 并写入标记', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: '跳过引导' }).click();

    await expect(page.getByText('添加今天的第一个任务')).not.toBeVisible();
    const onboardingDone = await page.evaluate(() => localStorage.getItem('goto:onboardingDone'));
    expect(onboardingDone).toBe('1');
  });

  test('进度条:step 1 时第一段高亮,step 2 时前两段高亮,step 3 时全部高亮', async ({ page }) => {
    await setupAppWithOnboarding(page);
    await expect(page.getByText('添加今天的第一个任务')).toBeVisible({ timeout: 5_000 });

    // step 1:第一段应高亮(bg-gold),后两段暗(bg-slate-700)
    const progressBars = page.locator('.h-1.flex-1.rounded-full');
    await expect(progressBars).toHaveCount(3);
    const step1Class0 = await progressBars.nth(0).getAttribute('class');
    const step1Class2 = await progressBars.nth(2).getAttribute('class');
    expect(step1Class0).toContain('bg-gold');
    expect(step1Class2).toContain('bg-slate-700');

    // 进入 step 2
    await page.getByRole('button', { name: '添加任务' }).click();
    await expect(page.getByText('完成它,看你的画布长出第一块砖')).toBeVisible();
    const step2Class0 = await progressBars.nth(0).getAttribute('class');
    const step2Class1 = await progressBars.nth(1).getAttribute('class');
    expect(step2Class0).toContain('bg-gold');
    expect(step2Class1).toContain('bg-gold');

    // 进入 step 3
    await page.getByRole('button', { name: '稍后再说' }).click();
    await expect(page.getByText('这是你的私密空间')).toBeVisible();
    const step3Class2 = await progressBars.nth(2).getAttribute('class');
    expect(step3Class2).toContain('bg-gold');
  });
});
