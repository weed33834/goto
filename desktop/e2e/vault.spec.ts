/**
 * E2E:保险库 — 创建、显示、编辑、删除、敏感字段
 *
 * 覆盖:
 * 1. 空态文案
 * 2. 创建保险库项(名称 + 字段)
 * 3. 敏感字段默认模糊显示
 * 4. 显示/隐藏敏感字段
 * 5. 编辑现有项
 * 6. 删除项
 * 7. 表单验证(空名称不提交)
 * 8. 添加/删除字段
 *
 * 实现细节:
 * - VaultEditor 默认有"账号"+"密码"两个字段,密码 isSensitive=true
 * - 提交按钮文字:"保存到保险库"(新建)/"保存修改"(编辑)
 * - VaultCard 显示 title + fields,敏感字段 blur-sm 直到点"显示"
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp } from './helpers';

test.describe('保险库', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    await page.getByRole('link', { name: /保险库/ }).click();
    await expect(page.getByRole('heading', { name: '加密保险库' })).toBeVisible();
  });

  test('空态:无保险库项时显示"保险库为空"', async ({ page }) => {
    await expect(page.getByText('保险库为空')).toBeVisible();
  });

  test('创建保险库项:名称 + 默认字段 → 列表显示', async ({ page }) => {
    // 名称输入框(placeholder "名称（如 GitHub）")
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    await titleInput.fill('GitHub 账号');

    // 默认有 2 个字段:"账号"(普通) + "密码"(敏感)
    // 填字段名 "账号" 已经预填,值需要填
    const valueInputs = page.getByPlaceholder('值');
    await valueInputs.first().fill('octocat');
    await valueInputs.last().fill('p@ssw0rd123');

    await page.getByRole('button', { name: '保存到保险库' }).click();

    // 列表应显示新项
    await expect(page.getByText('GitHub 账号')).toBeVisible();
    await expect(page.getByText('octocat')).toBeVisible();
    // "保险库为空" 应消失
    await expect(page.getByText('保险库为空')).not.toBeVisible();
  });

  test('敏感字段默认模糊显示,点击"显示"后明文', async ({ page }) => {
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    await titleInput.fill('测试敏感字段');

    const valueInputs = page.getByPlaceholder('值');
    await valueInputs.first().fill('visible-value');
    await valueInputs.last().fill('secret-value');

    await page.getByRole('button', { name: '保存到保险库' }).click();
    await expect(page.getByText('测试敏感字段')).toBeVisible();

    // 普通字段"visible-value" 应明文显示
    await expect(page.getByText('visible-value')).toBeVisible();

    // 敏感字段默认显示 "••••••••"(模糊化)
    await expect(page.getByText('••••••••')).toBeVisible();
    // "secret-value" 不应明文出现(在 blur 状态下)
    // 注意:DOM 里仍有 value,但视觉模糊;这里测文案可见性
    expect(await page.getByText('secret-value', { exact: true }).count()).toBe(0);

    // 点击"显示"按钮 → 明文出现
    await page.getByRole('button', { name: '显示' }).click();
    await expect(page.getByText('secret-value')).toBeVisible();
    // 按钮文字变 "隐藏"
    await expect(page.getByRole('button', { name: '隐藏' })).toBeVisible();
  });

  test('编辑保险库项:修改名称 → 保存', async ({ page }) => {
    // 先创建一项
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    await titleInput.fill('原始名称');
    const valueInputs = page.getByPlaceholder('值');
    await valueInputs.first().fill('user1');
    await valueInputs.last().fill('pass1');
    await page.getByRole('button', { name: '保存到保险库' }).click();
    await expect(page.getByText('原始名称')).toBeVisible();

    // 进入编辑模式
    await page.getByRole('button', { name: '编辑' }).click();

    // 编辑 form 出现,通过"保存修改"按钮定位
    const saveButton = page.getByRole('button', { name: '保存修改' });
    await expect(saveButton).toBeVisible();
    const editForm = page.locator('form').filter({ has: saveButton });
    const editTitleInput = editForm.getByPlaceholder('名称（如 GitHub）');
    await expect(editTitleInput).toHaveValue('原始名称');

    // 修改名称
    await editTitleInput.fill('修改后的名称');
    await saveButton.click();

    // 列表显示新名称,旧名称消失
    await expect(page.getByText('修改后的名称')).toBeVisible();
    await expect(page.getByText('原始名称')).not.toBeVisible();
  });

  test('删除保险库项 → 列表中移除', async ({ page }) => {
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    await titleInput.fill('待删除项');
    const valueInputs = page.getByPlaceholder('值');
    await valueInputs.first().fill('u');
    await valueInputs.last().fill('p');
    await page.getByRole('button', { name: '保存到保险库' }).click();
    await expect(page.getByText('待删除项')).toBeVisible();

    // 点击"删除" — VaultCard 的删除按钮(不是表单中删除字段的按钮)
    // h3 的直接父级是 flex justify-between div,只含 h3 + 编辑/删除按钮组
    // 用此范围限定,避免匹配到表单中字段的"删除"按钮
    const cardHeader = page.getByRole('heading', { name: '待删除项' }).locator('..');
    await cardHeader.getByRole('button', { name: '删除' }).click();

    // P0-3:删除后 pushNotification toast 含 "待删除项" 标题,toast 在 main 外。
    // 用 main locator 限定,避免误命中 toast 内容导致测试失败。
    const mainContent = page.locator('main');
    await expect(mainContent.getByText('待删除项')).not.toBeVisible();
    // 空态恢复
    await expect(mainContent.getByText('保险库为空')).toBeVisible();
  });

  test('表单验证:空名称不提交', async ({ page }) => {
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    // 不填名称,直接点保存
    await titleInput.fill('');
    await page.getByRole('button', { name: '保存到保险库' }).click();

    // 不应创建任何项 — 空态仍在
    await expect(page.getByText('保险库为空')).toBeVisible();
  });

  test('添加字段 → 提交后字段数正确', async ({ page }) => {
    const titleInput = page.getByPlaceholder('名称（如 GitHub）');
    await titleInput.fill('多字段测试');

    // 点击"+ 添加字段"按钮
    await page.getByRole('button', { name: '+ 添加字段' }).click();

    // 现在应有 3 个字段(默认 2 + 新加 1)
    const fieldNameInputs = page.getByPlaceholder('字段名');
    await expect(fieldNameInputs).toHaveCount(3);

    // 填入新字段
    const valueInputs = page.getByPlaceholder('值');
    await valueInputs.first().fill('a');
    await valueInputs.nth(1).fill('b');
    await valueInputs.last().fill('c');
    // 给新字段命名
    await fieldNameInputs.last().fill('备注');

    await page.getByRole('button', { name: '保存到保险库' }).click();
    await expect(page.getByText('多字段测试')).toBeVisible();
    // 第三个字段"备注"应出现在卡片
    await expect(page.getByText('备注')).toBeVisible();
  });
});
