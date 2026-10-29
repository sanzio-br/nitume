import { describe, expect, it, vi } from 'vitest';
import { escapeGlob, RedisService } from './redis.service';

/** A fake ioredis client: SCAN pages over full (prefixed) names, DEL re-applies the prefix. */
const fakeClient = (keys: string[], keyPrefix: string | undefined, pageSize = 2) => {
  const store = new Set(keys.map((k) => `${keyPrefix ?? ''}${k}`));
  const patterns: string[] = [];
  // Like SCAN, every key present for the whole iteration is returned once,
  // even if others are deleted meanwhile: page over a snapshot.
  let snapshot: string[] = [];
  const toRegex = (glob: string) =>
    new RegExp(
      `^${glob.replace(/\\(.)|([*?])|([.+^${}()|[\]\\])/g, (_m, escaped: string, wild: string, meta: string) =>
        escaped !== undefined ? `\\${escaped}` : wild === '*' ? '.*' : wild === '?' ? '.' : `\\${meta}`,
      )}$`,
    );
  const client = {
    options: { keyPrefix },
    scan: vi.fn((cursor: string, _m: string, pattern: string) => {
      patterns.push(pattern);
      if (cursor === '0') snapshot = [...store].sort();
      const all = snapshot;
      const start = Number(cursor);
      const page = all.slice(start, start + pageSize).filter((k) => toRegex(pattern).test(k));
      const next = start + pageSize >= all.length ? '0' : String(start + pageSize);
      return Promise.resolve([next, page]);
    }),
    del: vi.fn((...names: string[]) => {
      let n = 0;
      for (const name of names) {
        if (store.delete(`${keyPrefix ?? ''}${name}`)) n += 1;
      }
      return Promise.resolve(n);
    }),
  };
  return { client, store, patterns };
};

describe('RedisService.deleteMatching (issue #24)', () => {
  it('scans every page and deletes only matching keys, stripping the key prefix before DEL', async () => {
    const { client, store, patterns } = fakeClient(
      ['refresh:u-1:a', 'refresh:u-1:b', 'refresh:u-1:c', 'refresh:u-2:a', 'user:access:u-1'],
      'nitume_test:',
    );
    const redis = new RedisService(client as never);
    expect(await redis.deleteMatching('refresh:u-1:*')).toBe(3);
    expect([...store].sort()).toEqual(['nitume_test:refresh:u-2:a', 'nitume_test:user:access:u-1']);
    expect(patterns.every((p) => p === 'nitume_test:refresh:u-1:*')).toBe(true);
    expect(client.scan.mock.calls.length).toBeGreaterThan(1);
    for (const call of client.del.mock.calls) {
      for (const name of call) expect(name.startsWith('nitume_test:')).toBe(false);
    }
  });

  it('works without a key prefix and returns 0 when nothing matches', async () => {
    const { client } = fakeClient(['refresh:u-2:a'], undefined);
    const redis = new RedisService(client as never);
    expect(await redis.deleteMatching('refresh:u-1:*')).toBe(0);
    expect(client.del).not.toHaveBeenCalled();
  });

  it('escapes glob metacharacters in the prefix', async () => {
    const { client, patterns } = fakeClient([], 'a*b?[c]:');
    await new RedisService(client as never).deleteMatching('k:*');
    expect(patterns[0]).toBe('a\\*b\\?\\[c\\]:k:*');
  });
});

describe('escapeGlob', () => {
  it('escapes * ? [ ] and backslash only', () => {
    expect(escapeGlob('9b2f-uuid')).toBe('9b2f-uuid');
    expect(escapeGlob('a*?[]\\z')).toBe('a\\*\\?\\[\\]\\\\z');
  });
});
