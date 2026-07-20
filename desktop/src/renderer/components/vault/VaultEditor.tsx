import { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useVaultStore } from '../../store/vaultStore';
import type { VaultField, VaultItem } from '../../../shared/types';

interface VaultEditorProps {
  /** 传入则进入编辑模式，对现有项做修改；不传为新建模式。 */
  editingItem?: VaultItem | null;
  /** 编辑模式提交或取消后回调，用于退出 inline 编辑态。 */
  onDone?: () => void;
}

function defaultFields(): VaultField[] {
  return [
    { id: crypto.randomUUID(), name: '账号', value: '', isSensitive: false },
    { id: crypto.randomUUID(), name: '密码', value: '', isSensitive: true },
  ];
}

export function VaultEditor({ editingItem, onDone }: VaultEditorProps) {
  const isEditing = !!editingItem;
  const { create, update, generatePassword } = useVaultStore();

  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [fields, setFields] = useState<VaultField[]>(
    editingItem ? editingItem.fields.map((f) => ({ ...f })) : defaultFields()
  );

  const updateField = (id: string, patch: Partial<VaultField>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addField = () =>
    setFields((fs) => [...fs, { id: crypto.randomUUID(), name: '', value: '', isSensitive: false }]);

  const removeField = (id: string) =>
    setFields((fs) => (fs.length > 1 ? fs.filter((f) => f.id !== id) : fs));

  const handleGenerate = async (fieldId: string) => {
    const pwd = await generatePassword(16);
    updateField(fieldId, { value: pwd });
  };

  const reset = () => {
    setTitle('');
    setFields(defaultFields());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // 丢弃完全空白的字段，避免保存无意义条目
    const cleanFields = fields.filter((f) => f.name.trim() || f.value.trim());
    if (cleanFields.length === 0) return;

    if (isEditing && editingItem) {
      await update(editingItem.id, {
        title: title.trim(),
        fields: cleanFields,
      });
      onDone?.();
    } else {
      await create({ type: 'password', title: title.trim(), fields: cleanFields, isHidden: false });
      reset();
    }
  };

  const handleCancel = () => {
    onDone?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
    >
      <Input
        placeholder="名称（如 GitHub）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      {fields.map((field) => (
        <div key={field.id} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="字段名"
            value={field.name}
            onChange={(e) => updateField(field.id, { name: e.target.value })}
            className="sm:w-32"
          />
          <Input
            type={field.isSensitive ? 'password' : 'text'}
            placeholder="值"
            value={field.value}
            onChange={(e) => updateField(field.id, { value: e.target.value })}
            className="flex-1"
          />
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateField(field.id, { isSensitive: !field.isSensitive })}
              title={field.isSensitive ? '标记为普通字段' : '标记为敏感字段'}
              className="shrink-0"
            >
              {field.isSensitive ? '敏感' : '普通'}
            </Button>
            {field.isSensitive && (
              <Button type="button" variant="secondary" size="sm" onClick={() => handleGenerate(field.id)} className="shrink-0">
                生成
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => removeField(field.id)} className="shrink-0">
              删除
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addField}>
        + 添加字段
      </Button>
      <div className="flex gap-2">
        <Button type="submit">{isEditing ? '保存修改' : '保存到保险库'}</Button>
        {isEditing && (
          <Button type="button" variant="secondary" onClick={handleCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
