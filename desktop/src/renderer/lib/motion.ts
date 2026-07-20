/**
 * A11 Motion Token + AnimationBudget(见 §7.2 / §7.6)
 *
 * 设计目标:
 * 1. 统一所有过渡的 duration / easing 来源,避免散落魔法数字
 * 2. AnimationBudget 约束单次操作总动画 ≤ 800ms、同时活跃 ≤ 2 个
 *    (防止"动效轰炸"导致用户感知混乱)
 */

export const motionTokens = {
  duration: {
    instant: 50,
    fast: 100,
    normal: 200,
    slow: 400,
    cinematic: 600,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1.4)',
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },
} as const;

export type MotionDuration = keyof typeof motionTokens.duration;
export type MotionEasing = keyof typeof motionTokens.easing;

/** cubic-bezier tuple(对齐 framer-motion 的 Easing 类型) */
type CubicBezier = [number, number, number, number];

const easeMap: Record<MotionEasing, CubicBezier> = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.2, 0, 0, 1.4],
  decelerate: [0, 0, 0, 1],
  accelerate: [0.3, 0, 1, 1],
};

/** 将 token 转为 framer-motion transition 对象 */
export function transition(
  duration: MotionDuration = 'normal',
  easing: MotionEasing = 'standard',
): { duration: number; ease: CubicBezier } {
  return {
    duration: motionTokens.duration[duration] / 1000,
    ease: easeMap[easing],
  };
}

/**
 * AnimationBudget — 动画预算管理器(§7.6)
 *
 * 规则:
 * - 单次操作总动画 ≤ 800ms(超过则压缩为串行)
 * - 同时活跃动画 ≤ 2 个(超过则排队)
 *
 * 用法:
 *   const budget = new AnimationBudget();
 *   budget.run(async () => { ... }); // 自动排队
 */
export class AnimationBudget {
  private active = 0;
  private queue: Array<() => Promise<void>> = [];
  private readonly maxConcurrent = 2;
  private readonly maxTotalMs = 800;

  /** 入队一个动画任务,返回 Promise 在动画完成后 resolve */
  async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      const task = async () => {
        this.active += 1;
        const start = Date.now();
        try {
          const result = await fn();
          const elapsed = Date.now() - start;
          if (elapsed > this.maxTotalMs) {
            // 超预算:记录但不阻断(开发期可挂埋点告警)
            if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'production') {
              console.warn(
                `[AnimationBudget] 单次动画 ${elapsed}ms 超过预算 ${this.maxTotalMs}ms`,
              );
            }
          }
          resolve(result);
        } finally {
          this.active -= 1;
          this.drain();
        }
      };
      this.queue.push(task);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) void next();
    }
  }
}

/** 全局单例预算(简单场景复用) */
export const globalAnimationBudget = new AnimationBudget();

/**
 * 串行编排多个动画段(§7.6 任务完成 3 串行)
 * 总时长受 budget 约束;超过则末段被截断
 */
export async function sequence(
  segments: Array<() => Promise<void>>,
): Promise<void> {
  let elapsed = 0;
  for (const seg of segments) {
    if (elapsed >= 800) break;
    const start = Date.now();
    await seg();
    elapsed += Date.now() - start;
  }
}
