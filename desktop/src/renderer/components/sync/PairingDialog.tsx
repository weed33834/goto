import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface PairingDialogProps {
  mode: 'none' | 'host' | 'join';
  pairingCode: { code: string; expiresAt: number } | null;
  error: string | null;
  onClose: () => void;
  onGenerate: () => void;
  onClaim: (code: string) => void;
  onClearError: () => void;
}

export function PairingDialog({
  mode,
  pairingCode,
  error,
  onClose,
  onGenerate,
  onClaim,
  onClearError,
}: PairingDialogProps) {
  const [joinCode, setJoinCode] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (mode !== 'host' || !pairingCode) {
      setRemainingSeconds(0);
      return;
    }

    const calculateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((pairingCode.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        onClose();
      }
    };

    calculateRemaining();
    const timer = setInterval(calculateRemaining, 1000);
    return () => clearInterval(timer);
  }, [mode, pairingCode, onClose]);

  useEffect(() => {
    if (mode === 'join') {
      setJoinCode('');
    }
  }, [mode]);

  if (mode === 'none') return null;

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        onClearError();
        onClose();
      }}
      title={mode === 'host' ? '添加新设备' : '加入现有设备'}
    >
      {mode === 'host' ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            在新设备上输入以下 8 位配对码，即可加入同步。
          </p>
          {pairingCode ? (
            <>
              <div className="overflow-x-auto rounded-xl bg-slate-100 py-4 text-2xl font-bold tracking-[0.3em] text-slate-800 dark:bg-slate-700 dark:text-slate-100 sm:py-6 sm:text-4xl sm:tracking-[0.5em]">
                {pairingCode.code}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                有效期剩余 {Math.floor(remainingSeconds / 60)}:
                {String(remainingSeconds % 60).padStart(2, '0')}
              </p>
            </>
          ) : (
            <Button onClick={onGenerate}>生成配对码</Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            输入旧设备上显示的 8 位配对码。
          </p>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="12345678"
            maxLength={8}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={() => onClaim(joinCode)} disabled={joinCode.length !== 8} className="w-full">
            加入
          </Button>
        </div>
      )}
    </Modal>
  );
}
