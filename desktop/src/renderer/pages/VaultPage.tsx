import { VaultList } from '../components/vault/VaultList';

export function VaultPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">加密保险库</h1>
      <VaultList />
    </div>
  );
}
