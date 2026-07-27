// TemplatePage — 任务模板(D3)
//
// 布局:
// - 顶部:标题 + 描述 + "新建模板"按钮(展开内联表单)
// - 列表:每个 template 一张卡片,展示名称 + 默认标题 + 优先级/标签 + 使用次数
// - 卡片操作:应用(创建任务)/ 编辑(inline)/ 删除
//
// 设计取舍:
// - 模板字段较多但核心就 name + taskDefaults.title,inline 表单只暴露高频字段
//   (title/priority/tags/estimatedTime/variables),description/content/subtasks 等
//   可后续扩展为 Modal 编辑器。当前 inline 够用,降低跳转。
// - 应用模板:直接调 applyTemplate(id) → addTask + 通知,不弹变量表单;
//   variables 在表单中预先填好默认值(如 {{date}} → 今日),用户可在新建任务后编辑。
//   未来若有多个变量,再做"应用前填变量"对话框。
// - 删除用 window.confirm + undo 双保险(templatesSlice.deleteTemplate 已 push undo)。
import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import type { Template, TemplateTaskDefaults, Priority } from '../../shared/types';
import { PRIORITY_ORDER, PRIORITY_LABELS } from '../../shared/constants/labels';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';

const PRIORITY_OPTIONS = PRIORITY_ORDER;

interface NewTemplateFormProps {
  onSubmit: (input: {
    name: string;
    description?: string;
    taskDefaults: TemplateTaskDefaults;
    variables?: string[];
  }) => void;
  onCancel: () => void;
}

function NewTemplateForm({ onSubmit, onCancel }: NewTemplateFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [tags, setTags] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [variables, setVariables] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedTitle = title.trim();
    if (!trimmedName || !trimmedTitle) return;

    const et = estimatedTime.trim() ? Number(estimatedTime) : null;
    onSubmit({
      name: trimmedName,
      description: description.trim() || undefined,
      taskDefaults: {
        title: trimmedTitle,
        priority,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        estimatedTime: et !== null && Number.isFinite(et) ? et : null,
      },
      variables: variables
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      aria-label="新建模板"
    >
      <div className="space-y-3">
        <Input
          label="模板名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如:周报"
          autoFocus
          required
        />
        <Input
          label="描述(可选)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="模板用途说明"
        />
        <Input
          label="任务标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="支持 {{变量}} 占位,如 写周报 - {{week}}"
          required
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">优先级</span>
          <div className="flex flex-wrap gap-2">
            {PRIORITY_OPTIONS.map((p) => (
              <label
                key={p}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                  priority === p
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  checked={priority === p}
                  onChange={() => setPriority(p)}
                  className="sr-only"
                />
                {PRIORITY_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
        <Input
          label="标签(逗号分隔)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例如:工作, 周报"
        />
        <Input
          label="预估时长(分钟)"
          type="number"
          min="0"
          value={estimatedTime}
          onChange={(e) => setEstimatedTime(e.target.value)}
          placeholder="例如:30"
        />
        <Input
          label="变量(逗号分隔,可用于标题占位)"
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          placeholder="例如:week, topic"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
          <Button type="submit" disabled={!name.trim() || !title.trim()}>创建</Button>
        </div>
      </div>
    </form>
  );
}

interface TemplateCardProps {
  template: Template;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function TemplateCard({ template, onApply, onRename, onDelete }: TemplateCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(template.name);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== template.name) {
      onRename(template.id, trimmed);
    } else {
      setDraftName(template.name);
    }
    setEditing(false);
  };

  const handleDelete = () => {
    if (template.isBuiltIn) return;
    if (window.confirm(`确定删除模板"${template.name}"?(可通过撤销恢复)`)) {
      onDelete(template.id);
    }
  };

  const defaults = template.taskDefaults;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      data-testid={`template-card-${template.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') {
                  setDraftName(template.name);
                  setEditing(false);
                }
              }}
              autoFocus
              aria-label="编辑模板名称"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block max-w-full truncate text-left text-sm font-medium text-slate-800 hover:text-primary dark:text-slate-100"
              title="点击重命名"
            >
              {template.name}
              {template.isBuiltIn && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  内置
                </span>
              )}
            </button>
          )}
          {template.description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
          )}
          <p className="mt-1.5 truncate text-xs text-slate-600 dark:text-slate-300" title={defaults.title}>
            <span className="text-slate-400">标题:</span> {defaults.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
            {defaults.priority && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {PRIORITY_LABELS[defaults.priority]}
              </span>
            )}
            {defaults.tags?.map((t) => (
              <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">#{t}</span>
            ))}
            {defaults.estimatedTime != null && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {defaults.estimatedTime} 分钟
              </span>
            )}
            {template.variables.length > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                变量: {template.variables.join(', ')}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            使用 {template.usageCount} 次
            {template.lastUsedAt && ` · 最近 ${new Date(template.lastUsedAt).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2 text-xs">
        <Button size="sm" onClick={() => onApply(template.id)}>
          应用
        </Button>
        {!template.isBuiltIn && (
          <Button size="sm" variant="ghost" onClick={handleDelete} className="text-danger hover:bg-danger/10">
            删除
          </Button>
        )}
      </div>
    </div>
  );
}

export function TemplatePage() {
  const templates = useAppStore((s) => s.templates);
  const addTemplate = useAppStore((s) => s.addTemplate);
  const updateTemplate = useAppStore((s) => s.updateTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const applyTemplate = useAppStore((s) => s.applyTemplate);

  const [showForm, setShowForm] = useState(false);

  // 按 usageCount 降序,常用模板排前面
  const sorted = useMemo(
    () => [...templates].sort((a, b) => b.usageCount - a.usageCount),
    [templates],
  );

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-3 sm:text-2xl">
        任务模板
      </h1>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
        把"经常创建的同类任务"保存成模板,一键复用。标题支持 <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">{'{{变量}}'}</code> 占位,
        应用时直接生成任务,减少重复填表。
      </p>

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起' : '新建模板'}
        </Button>
      </div>

      {showForm && (
        <NewTemplateForm
          onSubmit={(input) => {
            addTemplate(input);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon="📋"
          title="还没有模板"
          hint={'点击右上角「新建模板」,从最常创建的任务开始 —— 例如「写周报」「读书 30 分钟」。'}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onApply={applyTemplate}
              onRename={(id, name) => updateTemplate(id, { name })}
              onDelete={deleteTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
