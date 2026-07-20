/**
 * syncPolicy 单元测试
 * ------------------------------
 * 覆盖：
 *   - 默认策略（无设备限制 / 官方 relay / 全业务数据同步）
 *   - resolveRelayUrl 的优先级（用户配置 > 模式 > 默认）
 *   - canPairMoreDevices 的边界
 *   - filterSyncableRecordTypes 过滤本机专属
 *   - shouldLimitDevices 的语义（null / 0 / Infinity / 正整数）
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RELAY_URL,
  DEFAULT_RELAY_MODE,
  DEFAULT_SYNC_POLICY,
  SYNC_SCOPE,
  FULL_SYNC_RECORD_TYPES,
  METADATA_SYNC_RECORD_TYPES,
  shouldLimitDevices,
  resolveRelayUrl,
  canPairMoreDevices,
  filterSyncableRecordTypes,
  type SyncPolicy,
  type RelayMode,
} from './syncPolicy';

describe('默认策略', () => {
  it('默认 relay URL 指向官方域名', () => {
    expect(DEFAULT_RELAY_URL).toMatch(/^wss:\/\//);
    expect(DEFAULT_RELAY_URL).toContain('goto.app');
  });

  it('默认 relay 模式为 official', () => {
    expect(DEFAULT_RELAY_MODE).toBe('official');
  });

  it('默认 maxDevices 为 null（无限制）', () => {
    expect(DEFAULT_SYNC_POLICY.maxDevices).toBeNull();
  });

  it('SYNC_SCOPE 覆盖所有核心业务数据并标记为 full', () => {
    const requiredFull = ['tasks', 'notes', 'goals', 'habits', 'categories', 'tags', 'projects'];
    for (const t of requiredFull) {
      expect(SYNC_SCOPE[t]).toBe('full');
    }
  });

  it('附件为 metadata-only', () => {
    expect(SYNC_SCOPE.attachments).toBe('metadata-only');
  });

  it('UI/焦点/搜索历史为本机专属', () => {
    expect(SYNC_SCOPE.ui).toBe('local-only');
    expect(SYNC_SCOPE.focus).toBe('local-only');
    expect(SYNC_SCOPE.search).toBe('local-only');
  });

  it('FULL_SYNC_RECORD_TYPES 包含所有 full 记录类型', () => {
    expect(FULL_SYNC_RECORD_TYPES).toContain('tasks');
    expect(FULL_SYNC_RECORD_TYPES).toContain('notes');
    // local-only 不应出现
    expect(FULL_SYNC_RECORD_TYPES).not.toContain('ui');
    expect(FULL_SYNC_RECORD_TYPES).not.toContain('focus');
    // metadata-only 也不应出现在 full 列表
    expect(FULL_SYNC_RECORD_TYPES).not.toContain('attachments');
  });

  it('METADATA_SYNC_RECORD_TYPES 只含 attachments', () => {
    expect(METADATA_SYNC_RECORD_TYPES).toEqual(['attachments']);
  });
});

describe('shouldLimitDevices', () => {
  it('maxDevices=null 时返回 false（无限制）', () => {
    expect(shouldLimitDevices({ maxDevices: null })).toBe(false);
  });

  it('maxDevices=0 时返回 false（视为无限制）', () => {
    expect(shouldLimitDevices({ maxDevices: 0 })).toBe(false);
  });

  it('maxDevices=Infinity 时返回 false', () => {
    expect(shouldLimitDevices({ maxDevices: Infinity })).toBe(false);
  });

  it('maxDevices=5 时返回 true', () => {
    expect(shouldLimitDevices({ maxDevices: 5 })).toBe(true);
  });

  it('maxDevices=-1（无效值）时返回 false', () => {
    expect(shouldLimitDevices({ maxDevices: -1 })).toBe(false);
  });
});

describe('canPairMoreDevices', () => {
  it('无限制策略下永远返回 true', () => {
    expect(canPairMoreDevices(0, { maxDevices: null })).toBe(true);
    expect(canPairMoreDevices(100, { maxDevices: null })).toBe(true);
    expect(canPairMoreDevices(10000, { maxDevices: null })).toBe(true);
  });

  it('限制 5 台时：4 台已配可继续', () => {
    expect(canPairMoreDevices(4, { maxDevices: 5 })).toBe(true);
  });

  it('限制 5 台时：5 台已配不可继续', () => {
    expect(canPairMoreDevices(5, { maxDevices: 5 })).toBe(false);
  });

  it('限制 5 台时：6 台已配（异常情况）不可继续', () => {
    expect(canPairMoreDevices(6, { maxDevices: 5 })).toBe(false);
  });
});

describe('resolveRelayUrl', () => {
  it('用户显式配置 relayUrl 时胜出（self-hosted 模式）', () => {
    const url = resolveRelayUrl({
      relayUrl: 'wss://my-self-hosted.example.com',
      relayMode: 'official', // 即使模式是 official，用户配置也胜出
    });
    expect(url).toBe('wss://my-self-hosted.example.com');
  });

  it('用户配置为空字符串时退回 policy', () => {
    const url = resolveRelayUrl({
      relayUrl: '',
      relayMode: 'official',
    });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('用户配置为 null 时退回 policy', () => {
    const url = resolveRelayUrl({
      relayUrl: null,
      relayMode: 'official',
    });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('relayMode=official 时返回官方 URL', () => {
    const url = resolveRelayUrl({ relayMode: 'official' });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('relayMode=self-hosted 但用户没配 URL：用 policy.relayUrl 兜底', () => {
    const url = resolveRelayUrl(
      { relayMode: 'self-hosted' },
      { relayMode: 'self-hosted', relayUrl: 'wss://fallback.example.com' },
    );
    expect(url).toBe('wss://fallback.example.com');
  });

  it('relayMode=self-hosted 且 policy 也无 URL：用 DEFAULT 兜底', () => {
    const url = resolveRelayUrl(
      { relayMode: 'self-hosted' },
      { relayMode: 'self-hosted', relayUrl: '' },
    );
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('relayMode=auto 等同 official', () => {
    const url = resolveRelayUrl({ relayMode: 'auto' });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('未提供 syncConfig.relayMode 时用 policy.relayMode', () => {
    const url = resolveRelayUrl({}, { relayMode: 'official', relayUrl: '' });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });

  it('配置带空白字符视为空，退回 policy', () => {
    const url = resolveRelayUrl({ relayUrl: '   ' });
    expect(url).toBe(DEFAULT_RELAY_URL);
  });
});

describe('filterSyncableRecordTypes', () => {
  it('过滤掉 local-only 类型', () => {
    const input = ['tasks', 'ui', 'notes', 'focus', 'search'];
    const out = filterSyncableRecordTypes(input);
    expect(out).toEqual(['tasks', 'notes']);
  });

  it('保留 metadata-only 类型', () => {
    const input = ['tasks', 'attachments', 'ui'];
    const out = filterSyncableRecordTypes(input);
    expect(out).toEqual(['tasks', 'attachments']);
  });

  it('未知类型被过滤掉（不在 SYNC_SCOPE 里）', () => {
    const input = ['tasks', 'unknown-type', 'notes'];
    const out = filterSyncableRecordTypes(input);
    expect(out).toEqual(['tasks', 'notes']);
  });

  it('空输入返回空数组', () => {
    expect(filterSyncableRecordTypes([])).toEqual([]);
  });

  it('自定义 policy：把 tasks 改为 local-only 时被过滤', () => {
    const customPolicy: Pick<SyncPolicy, 'syncScope'> = {
      syncScope: { ...SYNC_SCOPE, tasks: 'local-only' },
    };
    const out = filterSyncableRecordTypes(['tasks', 'notes'], customPolicy);
    expect(out).toEqual(['notes']);
  });
});

describe('类型完整性', () => {
  it('RelayMode 联合类型包含三个值', () => {
    const modes: RelayMode[] = ['official', 'self-hosted', 'auto'];
    expect(modes).toHaveLength(3);
  });

  it('SyncPolicy 接口可被实现', () => {
    const p: SyncPolicy = {
      maxDevices: 10,
      relayMode: 'self-hosted',
      relayUrl: 'wss://my.example.com',
      syncScope: SYNC_SCOPE,
    };
    expect(p.maxDevices).toBe(10);
    expect(p.relayMode).toBe('self-hosted');
  });
});
