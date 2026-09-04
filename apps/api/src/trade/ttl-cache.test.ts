import { describe, expect, it, vi } from 'vitest';

import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('넣은 값을 돌려준다', () => {
    const cache = new TtlCache<number>(5000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('없는 키는 undefined', () => {
    expect(new TtlCache<number>(5000).get('없음')).toBeUndefined();
  });

  it('시간이 지나면 만료된다', () => {
    let now = 1000;
    const cache = new TtlCache<number>(5000, () => now);
    cache.set('a', 1);

    now = 5999;
    expect(cache.get('a')).toBe(1);
    now = 6000;
    expect(cache.get('a')).toBeUndefined();
  });

  describe('through', () => {
    it('처음에는 계산하고, 두 번째부터는 캐시를 쓴다', async () => {
      const compute = vi.fn(() => Promise.resolve(42));
      const cache = new TtlCache<number>(5000);

      expect(await cache.through('a', compute)).toBe(42);
      expect(await cache.through('a', compute)).toBe(42);
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('만료되면 다시 계산한다', async () => {
      let now = 1000;
      const compute = vi.fn(() => Promise.resolve(42));
      const cache = new TtlCache<number>(5000, () => now);

      await cache.through('a', compute);
      now = 7000;
      await cache.through('a', compute);
      expect(compute).toHaveBeenCalledTimes(2);
    });
  });

  it('clear 하면 비워진다 (수집 후 호출)', () => {
    const cache = new TtlCache<number>(5000);
    cache.set('a', 1);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });

  it('상한을 넘으면 오래된 것부터 버린다 (메모리가 무한히 늘지 않게)', () => {
    const cache = new TtlCache<number>(5000, () => Date.now(), 3);
    for (let i = 0; i < 10; i += 1) cache.set(`k${i}`, i);
    expect(cache.size()).toBeLessThanOrEqual(3);
  });
});
