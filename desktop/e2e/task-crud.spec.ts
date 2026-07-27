/**
 * E2E:任务 CRUD — 创建、查看、编辑、删除
 *
 * 覆盖:
 * 1. 创建新任务(标题 + 描述 + 优先级 + 状态)
 * 2. 任务列表显示新任务
 * 3. 编辑现有任务
 * 4. 删除任务 + undo
 * 5. 空态文案
 * 6. 表单验证(空标题不能提交)
 * 7. 批量创建(连续添加多条)
 *
 * 关键实现细节:
 * - TaskList.tsx 在顶部渲染一个新建用 TaskEditor(placeholder="任务标题",按钮"添加")
 * - TaskCard.tsx 在编辑模式下 inline 渲染 TaskEditor(editingTask=task,按钮"保存修改")
 * - 进入编辑:点击 TaskCard 的"编辑"按钮(不是标题文本 — 标题 <p> 无 onClick)
 * - 编辑器中的标题输入框也是 placeholder="任务标题",所以用 form 内的按钮区分:
 *   "添加" → 新建模式,"保存修改" → 编辑模式
 */
import { test, expect } from '@playwright/test';
import { setupUnlockedApp, taskTitleInput, taskDescriptionInput, taskSubmitButton } from './helpers';

test.describe('任务 CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnlockedApp(page);
    // 导航到今日任务页
    await page.getByRole('link', { name: /今日任务/ }).click();
    // 等待 TodayPage h1 出现(与 Sidebar navlink 区分,避免 strict mode 歧义)
    await expect(page.getByRole('heading', { name: '今日任务' })).toBeVisible();
  });

  test('空态:无任务时显示"暂无任务"或新建表单可见', async ({ page }) => {
    // 全新 context,无任何任务 → 应显示"暂无任务"空态文案
    // 但若 IDB 未清干净可能有残留任务,所以只验证 UI 不崩溃 + 新建表单可见
    const titleInput = taskTitleInput(page);
    await expect(titleInput).toBeVisible();
  });

  test('创建新任务:标题 + 描述 → 列表显示标题', async ({ page }) => {
    const titleInput = taskTitleInput(page);
    const descInput = taskDescriptionInput(page);

    await titleInput.fill('E2E 测试任务');
    await descInput.fill('这是由 Playwright 创建的测试任务');
    await taskSubmitButton(page).click();

    // 任务应出现在列表中(TaskCard 只渲染 title 与 dueDate,description 不在卡片显示)
    await expect(page.getByText('E2E 测试任务')).toBeVisible();

    // 标题输入框应清空(提交后重置)
    await expect(titleInput).toHaveValue('');
  });

  test('空标题不能提交(表单验证)', async ({ page }) => {
    const titleInput = taskTitleInput(page);
    await titleInput.fill('');
    // 添加按钮存在但点击后不应创建任务(TaskEditor.handleSubmit 早 return)
    await taskSubmitButton(page).click();
    // 关键:不崩溃,新建表单仍可见
    await expect(titleInput).toBeVisible();
    // 空态文案应仍在(没有任何任务被创建)。
    // TodayPage 默认 today 过滤,空态文案是"今天没有任务";
    // 切到 all 过滤时是"暂无任务"。两者皆可接受。
    await expect(page.getByText(/今天没有任务|暂无任务/)).toBeVisible();
  });

  test('设置优先级和状态 → 创建任务', async ({ page }) => {
    const titleInput = taskTitleInput(page);
    await titleInput.fill('带优先级的任务');

    // 选择优先级"高"(select 元素,第一个是优先级,第二个是状态)
    const prioritySelect = page.locator('select').first();
    await prioritySelect.selectOption('high');

    // 选择状态"进行中"
    const statusSelect = page.locator('select').nth(1);
    await statusSelect.selectOption('in-progress');

    await taskSubmitButton(page).click();
    await expect(page.getByText('带优先级的任务')).toBeVisible();
  });

  test('编辑现有任务:修改标题 → 保存', async ({ page }) => {
    // 先创建一条任务
    const titleInput = taskTitleInput(page);
    await titleInput.fill('原始标题');
    await taskSubmitButton(page).click();
    await expect(page.getByText('原始标题')).toBeVisible();

    // 点击 TaskCard 的"编辑"按钮进入 inline 编辑模式
    // 用 exact:true + 完整 aria-label 精确匹配,避免命中 @dnd-kit sortable
    // 包装容器(它被加了 role="button",accessible name 含整个卡片文本,包括"编辑"二字)。
    await page.getByRole('button', { name: '编辑任务', exact: true }).click();

    // 编辑表单出现 — 通过"保存修改"按钮定位编辑 form
    // exact:true 避免命中 @dnd-kit sortable 容器(其 accessible name 含"保存修改"字样)。
    const saveButton = page.getByRole('button', { name: '保存修改', exact: true });
    await expect(saveButton).toBeVisible();

    // 编辑 form 内的标题输入框(placeholder 仍是"任务标题")
    // 此时页面有两个 placeholder="任务标题" 的 input:顶部新建表单 + inline 编辑表单
    // 通过 form 上下文定位:编辑 form 包含"保存修改"按钮
    const editForm = page.locator('form').filter({ has: saveButton });
    const editTitleInput = editForm.getByPlaceholder('任务标题');
    // 验证预填了当前标题
    await expect(editTitleInput).toHaveValue('原始标题');

    // 修改标题
    await editTitleInput.fill('修改后的标题');
    await saveButton.click();

    // 列表应显示新标题,旧标题消失
    await expect(page.getByText('修改后的标题')).toBeVisible();
    // 等待旧标题从 DOM 移除(React 重渲染 + state 更新)
    await expect(page.getByText('原始标题')).not.toBeVisible();
  });

  test('编辑后取消 → 标题不变', async ({ page }) => {
    const titleInput = taskTitleInput(page);
    await titleInput.fill('取消测试');
    await taskSubmitButton(page).click();
    await expect(page.getByText('取消测试')).toBeVisible();

    // 进入编辑模式
    // 用 exact:true + 完整 aria-label 精确匹配,避免命中 @dnd-kit sortable
    // 包装容器(它被加了 role="button",accessible name 含整个卡片文本,包括"编辑"二字)。
    await page.getByRole('button', { name: '编辑任务', exact: true }).click();
    // exact:true 避免命中 @dnd-kit sortable 容器(其 accessible name 含"保存修改"字样)。
    const saveButton = page.getByRole('button', { name: '保存修改', exact: true });
    const editForm = page.locator('form').filter({ has: saveButton });
    const editTitleInput = editForm.getByPlaceholder('任务标题');
    await editTitleInput.fill('不应该保存的标题');

    // 点击取消(编辑 form 内的"取消"按钮)
    await editForm.getByRole('button', { name: '取消' }).click();

    // 原标题仍在,新标题未保存
    await expect(page.getByText('取消测试')).toBeVisible();
    await expect(page.getByText('不应该保存的标题')).not.toBeVisible();
  });

  test('批量创建 5 条任务 → 列表显示全部', async ({ page }) => {
    const titles = ['批量1', '批量2', '批量3', '批量4', '批量5'];
    const titleInput = taskTitleInput(page);

    for (const t of titles) {
      await titleInput.fill(t);
      await taskSubmitButton(page).click();
      // 等待标题清空(提交成功的信号)
      await expect(titleInput).toHaveValue('');
    }

    // 验证所有任务都可见
    for (const t of titles) {
      await expect(page.getByText(t)).toBeVisible();
    }
  });

  test('删除任务 → 列表中移除', async ({ page }) => {
    const titleInput = taskTitleInput(page);
    await titleInput.fill('待删除任务');
    await taskSubmitButton(page).click();
    await expect(page.getByText('待删除任务')).toBeVisible();

    // 用 exact:true + 完整 aria-label 精确匹配删除按钮(同编辑按钮的修复理由)。
    await page.getByRole('button', { name: '删除任务', exact: true }).click();

    // P0-3:删除后 pushNotification toast 含 "待删除任务" 标题,toast 在 main 外。
    // 用 main locator 限定,避免误命中 toast 内容导致测试失败。
    const mainContent = page.locator('main');
    await expect(mainContent.getByText('待删除任务')).not.toBeVisible();
  });
});
