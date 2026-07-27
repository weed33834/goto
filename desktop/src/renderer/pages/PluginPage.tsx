// PluginPage — 插件(Skill)管理页。
//
// 用户特别点名:Agent 开发的 skill 层应有"可管理页面,可增减、可导入,
// 真正运用时能在这里调动"。本页对接 pluginsSlice + pluginManager,提供:
//   1. 内置插件区:列表 + 启停开关(不可删除)
//   2. 用户插件区:列表 + 启停开关 + 删除 + 导出 JSON
//   3. 新建插件:表单(name + 关键词→标签规则),buildUserPlugin 注册
//   4. 导入插件:粘贴 JSON 配置,校验后注册
//   5. 试用:输入示例任务标题,实时展示启用的 auto-tag 插件会补哪些标签
//
// 当前插件类型仅支持 auto-tag(keyword → tags)。后续扩展为联合类型
// (例如 note-summarize / ai-enhance)时,只需在 UserPluginConfig 加 discriminator,
// 这里表单按类型分支渲染即可。
import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import { BUILTIN_PLUGINS, buildUserPlugin } from '../../shared/plugins';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Switch } from '../components/common/Switch';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';

interface RuleForm {
  tags: string;
  words: string;
}

const emptyRuleForm: RuleForm = { tags: '', words: '' };

export function PluginPage() {
  const userPlugins = useAppStore((s) => s.userPlugins);
  const disabledPluginIds = useAppStore((s) => s.disabledPluginIds);
  const togglePlugin = useAppStore((s) => s.togglePlugin);
  const addUserPlugin = useAppStore((s) => s.addUserPlugin);
  const removeUserPlugin = useAppStore((s) => s.removeUserPlugin);
  const importPluginFromJson = useAppStore((s) => s.importPluginFromJson);
  const exportPluginToJson = useAppStore((s) => s.exportPluginToJson);

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [trialTitle, setTrialTitle] = useState('');

  // 新建表单状态:支持多条规则
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<RuleForm[]>([{ ...emptyRuleForm }]);

  const isDisabled = (id: string) => disabledPluginIds.includes(id);

  // 把启用的所有 auto-tag 插件(builtin + user)合并成统一规则表,用于"试用"。
  // 试用是只读的,不影响实际任务;直接手动遍历插件并调用其 taskBeforeCreate,
  // 用累积的 tags 作为下一个插件的输入(管道语义,与 pluginManager.invokeSync 一致)。
  const trialResult = useMemo(() => {
    if (!trialTitle.trim()) return null;
    const activePlugins = [
      ...BUILTIN_PLUGINS.filter((p) => !isDisabled(p.id)),
      ...userPlugins
        .filter((p) => !isDisabled(p.id))
        .map((p) => buildUserPlugin(p)),
    ];
    let result: { tags?: string[] } = {};
    for (const plugin of activePlugins) {
      const hook = plugin.hooks.taskBeforeCreate;
      if (!hook) continue;
      try {
        const out = hook({ title: trialTitle, tags: result.tags ?? [] });
        // hook 类型签名允许返回 Promise(异步插件),但 auto-tag 类插件是同步的。
        // 运行时过滤 Promise,保证试用是同步快照。
        if (!out || typeof out !== 'object') continue;
        if (out instanceof Promise) continue;
        if (Array.isArray(out.tags)) {
          result = { tags: out.tags };
        }
      } catch {
        // 插件试用失败忽略,不影响其他插件
      }
    }
    return result.tags ?? [];
  }, [trialTitle, userPlugins, disabledPluginIds]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const parsedRules = rules
      .map((r) => ({
        tags: r.tags.split(',').map((t) => t.trim()).filter(Boolean),
        words: r.words.split(',').map((w) => w.trim()).filter(Boolean),
      }))
      .filter((r) => r.tags.length > 0 && r.words.length > 0);
    if (parsedRules.length === 0) {
      window.alert('至少需要一条有效的规则(同时填 tags 和 words)');
      return;
    }
    addUserPlugin({
      name: name.trim(),
      description: description.trim() || undefined,
      rules: parsedRules,
    });
    // 重置表单
    setName('');
    setDescription('');
    setRules([{ ...emptyRuleForm }]);
    setCreateOpen(false);
  };

  const handleAddRule = () => setRules([...rules, { ...emptyRuleForm }]);
  const handleRemoveRule = (idx: number) => {
    if (rules.length === 1) return;
    setRules(rules.filter((_, i) => i !== idx));
  };
  const handleRuleChange = (idx: number, field: keyof RuleForm, value: string) => {
    setRules(rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleImport = () => {
    setImportError(null);
    try {
      importPluginFromJson(importText);
      setImportText('');
      setImportOpen(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleExport = (id: string) => {
    try {
      const json = exportPluginToJson(id);
      // 用 clipboard API 复制,降级到 textarea prompt
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(json);
        window.alert('插件 JSON 已复制到剪贴板');
      } else {
        window.prompt('复制以下 JSON:', json);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`确定要删除用户插件「${name}」吗?此操作不可撤销。`)) {
      removeUserPlugin(id);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">插件 / Skill</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            管理任务自动化插件。新建关键词标签规则,或导入 JSON 配置;启用后会在新建任务时自动应用。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>导入</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>新建插件</Button>
        </div>
      </div>

      {/* 试用区:输入任务标题,实时展示启用的 auto-tag 插件会补哪些标签 */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">试用</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          输入任务标题,展示当前启用的所有 auto-tag 插件会自动补充的标签(不影响真实任务)。
        </p>
        <Input
          value={trialTitle}
          onChange={(e) => setTrialTitle(e.target.value)}
          placeholder="例如:买菜、写周报、跑步5公里"
        />
        {trialResult && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">将自动补标签:</span>
            {trialResult.length === 0 ? (
              <span className="text-xs text-slate-400">无匹配</span>
            ) : (
              trialResult.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {t}
                </span>
              ))
            )}
          </div>
        )}
      </section>

      {/* 内置插件区 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">内置插件</h2>
        <div className="space-y-2">
          {BUILTIN_PLUGINS.map((p) => (
            <PluginRow
              key={p.id}
              name={p.name}
              version={p.version}
              description={p.description}
              source="builtin"
              enabled={!isDisabled(p.id)}
              onToggle={(en) => togglePlugin(p.id, en)}
              hooks={Object.keys(p.hooks)}
            />
          ))}
        </div>
      </section>

      {/* 用户插件区 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">用户插件</h2>
        {userPlugins.length === 0 ? (
          <EmptyState
            icon="🧩"
            title="暂无用户插件"
            hint="点击右上角「新建插件」创建关键词标签规则,或「导入」粘贴 JSON 配置。"
          />
        ) : (
          <div className="space-y-2">
            {userPlugins.map((p) => (
              <PluginRow
                key={p.id}
                name={p.name}
                version="1.0.0"
                description={p.description}
                source="user"
                enabled={!isDisabled(p.id)}
                onToggle={(en) => togglePlugin(p.id, en)}
                hooks={['taskBeforeCreate']}
                onExport={() => handleExport(p.id)}
                onDelete={() => handleDelete(p.id, p.name)}
                ruleCount={p.rules.length}
              />
            ))}
          </div>
        )}
      </section>

      {/* 新建插件 Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="新建关键词标签插件">
        <form onSubmit={handleCreateSubmit} className="space-y-3">
          <Input label="插件名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如:工作分类" required />
          <Input label="描述(可选)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述插件作用" />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">规则</label>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddRule}>+ 添加规则</Button>
            </div>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              每条规则:任务标题命中任一关键词(words),即添加对应标签(tags)。逗号分隔。
            </p>
            <div className="space-y-2">
              {rules.map((r, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Input
                      label="标签(逗号分隔)"
                      value={r.tags}
                      onChange={(e) => handleRuleChange(idx, 'tags', e.target.value)}
                      placeholder="工作,会议"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="关键词(逗号分隔)"
                      value={r.words}
                      onChange={(e) => handleRuleChange(idx, 'words', e.target.value)}
                      placeholder="会议,meeting,review"
                    />
                  </div>
                  {rules.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveRule(idx)}>
                      删除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="submit">创建</Button>
          </div>
        </form>
      </Modal>

      {/* 导入插件 Modal */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="导入插件 JSON">
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            粘贴插件 JSON 配置(包含 name 与 rules 字段)。可在其他设备导出后在此粘贴。
          </p>
          <textarea
            className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'{\n  "name": "工作分类",\n  "rules": [\n    { "tags": ["工作"], "words": ["会议", "meeting"] }\n  ]\n}'}
          />
          {importError && <p className="text-xs text-danger">{importError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={handleImport} disabled={!importText.trim()}>导入</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface PluginRowProps {
  name: string;
  version: string;
  description?: string;
  source: 'builtin' | 'user';
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hooks: string[];
  onExport?: () => void;
  onDelete?: () => void;
  ruleCount?: number;
}

function PluginRow({
  name,
  version,
  description,
  source,
  enabled,
  onToggle,
  hooks,
  onExport,
  onDelete,
  ruleCount,
}: PluginRowProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              v{version}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${source === 'builtin' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
              {source === 'builtin' ? '内置' : '用户'}
            </span>
            {ruleCount !== undefined && (
              <span className="text-[10px] text-slate-400">{ruleCount} 条规则</span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {hooks.map((h) => (
              <code key={h} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {h}
              </code>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {source === 'user' && (
            <>
              {onExport && (
                <button
                  onClick={onExport}
                  className="text-xs text-slate-500 hover:text-primary"
                  aria-label={`导出 ${name}`}
                >
                  导出
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="text-xs text-slate-500 hover:text-danger"
                  aria-label={`删除 ${name}`}
                >
                  删除
                </button>
              )}
            </>
          )}
          <Switch checked={enabled} onChange={onToggle} label={enabled ? '已启用' : '已停用'} />
        </div>
      </div>
    </div>
  );
}
