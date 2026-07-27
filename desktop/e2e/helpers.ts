/**
 * E2E 测试共享辅助 — 解锁应用 + 跳过 Onboarding
 *
 * Goto 桌面端首启流程:
 * 1. LockScreen 检测 hasVerifier=false → 显示"设置主密码"
 * 2. 用户设置密码 → 解锁 → 进入主界面
 * 3. useOnboarding 检查 localStorage['goto:onboardingDone'] → 首启显示引导浮层
 *
 * 测试策略:
 * - 每个测试用 page.addInitScript 预置 localStorage 跳过 Onboarding
 * - 通过 UI 交互设置主密码(真实走 webAPI.auth.setupMasterPassword)
 * - 测试间用 context.clearCookies() + 清 IndexedDB 隔离
 */
import type { Page } from '@playwright/test';

const TEST_PASSWORD = 'test-password-123';
export const ONBOARDING_KEY = 'goto:onboardingDone';

/**
 * 初始化测试环境:跳过 Onboarding + 设置主密码 + 解锁。
 * 每个测试在 beforeEach 中调用此函数。
 *
 * 同时预置 sessionStorage 标记 goto:shareModalShown='1',避免首次完成任务时
 * 弹出 ShareBrickModal(useFirstBrickShare)遮挡 Sidebar 链接导致点击失败。
 */
export async function setupUnlockedApp(page: Page): Promise<void> {
  // addInitScript 在每次导航前执行,预置 localStorage 跳过引导浮层
  await page.addInitScript((key) => {
    localStorage.setItem(key, '1');
    // 跳过 ShareBrickModal(避免首次完成任务时遮挡 UI)
    sessionStorage.setItem('goto:shareModalShown', '1');
  }, ONBOARDING_KEY);

  // 导航到应用(HashRouter:用 #/ 路由)
  await page.goto('/#/mosaic');

  // 等待 LockScreen 出现(首启:placeholder 是"设置主密码")
  const passwordInput = page.getByPlaceholder(/设置主密码|输入主密码/);
  await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });

  // 检测是首启还是已设置密码(通过 placeholder 判断)
  const placeholder = await passwordInput.getAttribute('placeholder');
  if (placeholder?.includes('设置主密码')) {
    // 首启:设置密码
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '设置并解锁' }).click();
  } else {
    // 已有密码:解锁
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '解锁' }).click();
  }

  // 等待主界面加载(MosaicPage 的 h1 "时间织锦" 出现,标志 lazy chunk 已加载)
  // 注意:不能用 getByText('时间织锦') — Sidebar 也有同名 navlink,会触发 strict mode violation
  await page.getByRole('heading', { name: '时间织锦' }).waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * 导航到指定路由(HashRouter)。
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  // 等待路由对应的页面内容加载
  await page.waitForLoadState('networkidle');
}

/**
 * 等待并获取任务标题输入框。
 */
export function taskTitleInput(page: Page) {
  return page.getByPlaceholder('任务标题');
}

/**
 * 等待并获取任务描述输入框。
 *
 * 注意:placeholder 用半角括号,与 TaskEditor.tsx 实际渲染一致
 * (TaskEditor 第 379 行:placeholder="描述(可选)")。
 * 早期版本用全角"（）"导致 getByPlaceholder 严格匹配失败。
 */
export function taskDescriptionInput(page: Page) {
  return page.getByPlaceholder('描述(可选)');
}

/**
 * 等待并获取 TaskEditor 的主提交按钮。
 *
 * 用 type="submit" 定位,避免与子任务区"添加"按钮(type="button")重名冲突。
 * 新建模式文本是"添加",编辑模式是"保存修改",selector 两种都覆盖。
 */
export function taskSubmitButton(page: Page) {
  return page.locator('form button[type="submit"]');
}

export { TEST_PASSWORD, ONBOARDING_KEY };
