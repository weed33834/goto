import { describe, it, expect } from 'vitest';
import {
  motionTokens,
  transition,
  AnimationBudget,
  sequence,
} from './motion';

describe('motion tokens', () => {
  it('duration 5 档,无 800ms', () => {
    expect(Object.keys(motionTokens.duration)).toEqual([
      'instant',
      'fast',
      'normal',
      'slow',
      'cinematic',
    ]);
    expect(motionTokens.duration.cinematic).toBe(600);
    expect(
      (motionTokens.duration as Record<string, number>).slow,
    ).toBe(400);
  });

  it('transition 转秒 + easing 数组', () => {
    const t = transition('slow', 'standard');
    expect(t.duration).toBe(0.4);
    expect(Array.isArray(t.ease)).toBe(true);
  });
});

describe('AnimationBudget', () => {
  it('同时活跃 ≤ 2', async () => {
    const budget = new AnimationBudget();
    let active = 0;
    let peak = 0;

    const makeTask = (delay: number) => () =>
      new Promise<void>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        setTimeout(() => {
          active -= 1;
          resolve();
        }, delay);
      });

    await Promise.all([
      budget.run(makeTask(50)),
      budget.run(makeTask(50)),
      budget.run(makeTask(50)),
      budget.run(makeTask(50)),
      budget.run(makeTask(50)),
    ]);

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('run 返回任务结果', async () => {
    const budget = new AnimationBudget();
    const result = await budget.run(async () => 42);
    expect(result).toBe(42);
  });
});

describe('sequence', () => {
  it('串行执行所有段', async () => {
    const order: number[] = [];
    await sequence([
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            order.push(1);
            r();
          }, 10),
        ),
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            order.push(2);
            r();
          }, 10),
        ),
    ]);
    expect(order).toEqual([1, 2]);
  });

  it('总时长超 800ms 时截断后续段', async () => {
    let called = 0;
    await sequence([
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            called += 1;
            r();
          }, 500),
        ),
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            called += 1;
            r();
          }, 500),
        ),
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            called += 1;
            r();
          }, 10),
        ),
    ]);
    // 前两段 500+500=1000 已超 800,第三段被截断
    expect(called).toBe(2);
  });
});
