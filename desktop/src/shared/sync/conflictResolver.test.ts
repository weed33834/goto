import { describe, it, expect } from 'vitest';
import { resolveConflict, type SyncVersion } from './conflictResolver';

function makeVersion(overrides: Partial<SyncVersion> = {}): SyncVersion {
  return {
    id: 'rec-1',
    updatedAt: 1000,
    version: 1,
    ...overrides,
  };
}

describe('conflictResolver — updatedAt 时间戳', () => {
  it('local 更新 → local', () => {
    expect(resolveConflict(makeVersion({ updatedAt: 2000 }), makeVersion({ updatedAt: 1000 }))).toBe('local');
  });

  it('remote 更新 → remote', () => {
    expect(resolveConflict(makeVersion({ updatedAt: 1000 }), makeVersion({ updatedAt: 2000 }))).toBe('remote');
  });
});

describe('conflictResolver — 版本向量因果偏序', () => {
  it('local 支配 remote → local', () => {
    const local = makeVersion({ updatedAt: 1000, deviceVersion: { A: 3, B: 1 } });
    const remote = makeVersion({ updatedAt: 1000, deviceVersion: { A: 2, B: 1 } });
    expect(resolveConflict(local, remote)).toBe('local');
  });

  it('remote 支配 local → remote', () => {
    const local = makeVersion({ updatedAt: 1000, deviceVersion: { A: 1, B: 0 } });
    const remote = makeVersion({ updatedAt: 1000, deviceVersion: { A: 2, B: 1 } });
    expect(resolveConflict(local, remote)).toBe('remote');
  });

  it('互不支配 → concurrent', () => {
    const local = makeVersion({ updatedAt: 1000, deviceVersion: { A: 2, B: 1 } });
    const remote = makeVersion({ updatedAt: 1000, deviceVersion: { A: 1, B: 2 } });
    expect(resolveConflict(local, remote)).toBe('concurrent');
  });

  it('版本向量相同（互相支配）→ concurrent', () => {
    const local = makeVersion({ updatedAt: 1000, version: 5, deviceVersion: { A: 2 } });
    const remote = makeVersion({ updatedAt: 1000, version: 3, deviceVersion: { A: 2 } });
    expect(resolveConflict(local, remote)).toBe('concurrent');
  });

  it('缺失设备键视为 0（local 支配）', () => {
    const local = makeVersion({ updatedAt: 1000, deviceVersion: { A: 2, B: 1 } });
    const remote = makeVersion({ updatedAt: 1000, deviceVersion: { A: 1 } });
    // local {A:2,B:1} >= remote {A:1,B:0}，remote 不支配 local
    expect(resolveConflict(local, remote)).toBe('local');
  });
});

describe('conflictResolver — version 计数兜底', () => {
  it('无版本向量，version 更大者胜', () => {
    expect(resolveConflict(makeVersion({ version: 5 }), makeVersion({ version: 3 }))).toBe('local');
    expect(resolveConflict(makeVersion({ version: 3 }), makeVersion({ version: 5 }))).toBe('remote');
  });

  it('无版本向量，version 相同 → id 字典序', () => {
    expect(
      resolveConflict(makeVersion({ id: 'aaa', version: 1 }), makeVersion({ id: 'zzz', version: 1 })),
    ).toBe('local');
    expect(
      resolveConflict(makeVersion({ id: 'zzz', version: 1 }), makeVersion({ id: 'aaa', version: 1 })),
    ).toBe('remote');
  });
});

describe('conflictResolver — 单侧版本向量', () => {
  it('只有 local 有 deviceVersion → 退化到 version 比较', () => {
    const local = makeVersion({ updatedAt: 1000, version: 2, deviceVersion: { A: 1 } });
    const remote = makeVersion({ updatedAt: 1000, version: 5 });
    expect(resolveConflict(local, remote)).toBe('remote');
  });

  it('只有 remote 有 deviceVersion → 退化到 version 比较', () => {
    const local = makeVersion({ updatedAt: 1000, version: 5 });
    const remote = makeVersion({ updatedAt: 1000, version: 2, deviceVersion: { A: 1 } });
    expect(resolveConflict(local, remote)).toBe('local');
  });
});
