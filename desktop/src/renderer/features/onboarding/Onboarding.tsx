/**
 * A9 Onboarding — 3 屏引导(§7.8 v3.2 重写版本)
 *
 * 设计原则(§7.8):
 * - 每步 < 8 秒,可跳过
 * - 步骤 1:"添加今天的第一个任务"(秒懂任务管理,无加密术语)
 * - 步骤 2:"完成它,看你的画布长出第一块砖"(任务奖励 + 落砖动画)
 * - 步骤 3:"这是你的私密空间,只有你能看到"(私密空间引导,不展示噪点晶体)
 * - 5 秒测试门槛:能说出"这是个帮我管理任务的 app"(降级,原"把时间加密存起来"太高)
 * - 加密可视化延迟告知:Day 3 / Day 7 才弹窗(本 onboarding 不讲)
 *
 * 入口:首次进入应用(本地 localStorage 标记 goto:onboardingDone)
 * 完成后写入标记,后续不再弹。
 */

import { useState, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTaskStore } from '../../store/taskStore';
import { transition } from '../../lib/motion';
import { markOnboardingDone } from './useOnboarding';

// Re-export 让旧 import 路径仍可工作(向后兼容)
export { ONBOARDING_KEY, isOnboardingDone, markOnboardingDone, useOnboarding } from './useOnboarding';

interface OnboardingProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(1);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);
  const navigate = useNavigate();
  const createTask = useTaskStore((s) => s.create);

  // 步骤 1:提交任务
  const handleStep1Submit = async () => {
    const title = taskTitle.trim() || '读 30 分钟书';
    try {
      await createTask({ title, priority: 'medium', status: 'todo' });
      setTaskCreated(true);
      setStep(2);
    } catch {
      // 失败也进入下一步,不阻断 onboarding
      setStep(2);
    }
  };

  // 步骤 2:跳转到今日页让用户完成它
  const handleStep2GoToTasks = () => {
    navigate('/today');
    setStep(3);
  };

  // 步骤 3:完成 onboarding
  const handleFinish = () => {
    markOnboardingDone();
    onComplete();
  };

  const handleSkip = () => {
    markOnboardingDone();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="safe-area-bottom relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gold/20 bg-slate-900 p-5 shadow-2xl sm:max-h-[88vh] sm:max-w-lg sm:rounded-2xl sm:p-8">
        <button
          onClick={handleSkip}
          className="absolute right-3 top-3 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 sm:right-4 sm:top-4 sm:px-0 sm:py-0"
          aria-label="跳过引导"
        >
          跳过 →
        </button>

        <div className="mb-5 flex gap-2 sm:mb-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${
                i <= step ? 'bg-gold' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={transition('normal', 'standard')}
            >
              <h2 className="text-xl font-semibold text-paper sm:text-2xl">添加今天的第一个任务</h2>
              <p className="mt-2 text-sm text-slate-400">
                任何你想做的事都行。读书、运动、写报告 —— 一句话写下来。
              </p>
              <div className="mt-5 sm:mt-6">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="例:读 30 分钟书"
                  autoFocus
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') handleStep1Submit();
                  }}
                />
              </div>
              <div className="mt-5 flex justify-end gap-2 sm:mt-6">
                <Button variant="primary" onClick={handleStep1Submit}>
                  添加任务
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={transition('normal', 'standard')}
            >
              <h2 className="text-xl font-semibold text-paper sm:text-2xl">完成它,看你的画布长出第一块砖</h2>
              <p className="mt-2 text-sm text-slate-400">
                {taskCreated
                  ? '任务已添加。回到今日任务勾选完成,你的"时间织锦"上就会落下第一块砖。'
                  : '回到今日任务,勾选完成任意一个任务。你的"时间织锦"会落下第一块砖。'}
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setStep(3)} className="justify-start sm:justify-center">
                  稍后再说
                </Button>
                <Button variant="primary" onClick={handleStep2GoToTasks} className="justify-start sm:justify-center">
                  去完成它
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={transition('normal', 'standard')}
            >
              <h2 className="text-xl font-semibold text-paper sm:text-2xl">这是你的私密空间</h2>
              <p className="mt-2 text-sm text-slate-400">
                你的所有数据都加密保存在本机,只有你能看到。
                我们看不到你的任务,也看不到你的织锦。
              </p>
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold">
                  ◇
                </div>
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-paper">本地优先 · 端到端加密</div>
                  <div className="text-xs text-slate-400">数据从不离开你的设备(除非你主动同步)</div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2 sm:mt-6">
                <Button variant="primary" onClick={handleFinish}>
                  开始使用
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
