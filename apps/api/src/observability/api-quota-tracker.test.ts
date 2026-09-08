import { beforeEach, describe, expect, it } from 'vitest';

import { ApiQuotaTracker, computeUsage, DAILY_LIMITS } from './api-quota-tracker';
import type { IQuotaStore } from './ports';

class FakeQuotaStore implements IQuotaStore {
  readonly rows = new Map<string, { used: number; dailyLimit: number }>();

  private key(provider: string, date: Date): string {
    return `${provider}|${date.toISOString()}`;
  }

  increment(provider: string, date: Date, count: number, dailyLimit: number): Promise<void> {
    const k = this.key(provider, date);
    const prev = this.rows.get(k) ?? { used: 0, dailyLimit };
    this.rows.set(k, { used: prev.used + count, dailyLimit });
    return Promise.resolve();
  }

  find(provider: string, date: Date): Promise<{ used: number; dailyLimit: number } | null> {
    return Promise.resolve(this.rows.get(this.key(provider, date)) ?? null);
  }
}

describe('computeUsage — 사용률 계산 (순수 함수)', () => {
  it('사용률과 잔여량을 낸다', () => {
    expect(computeUsage('molit', 3120, 10_000)).toEqual({
      provider: 'molit',
      used: 3120,
      limit: 10_000,
      ratio: 0.312,
      remaining: 6880,
    });
  });

  it('한도를 넘겨도 사용률은 1을 넘지 않고 잔여는 0이다', () => {
    const usage = computeUsage('molit', 12_000, 10_000);
    expect(usage.ratio).toBe(1);
    expect(usage.remaining).toBe(0);
  });

  it('한도가 0이어도 나눗셈이 터지지 않는다', () => {
    expect(computeUsage('molit', 5, 0).ratio).toBe(1);
  });

  it('사용 전에는 0', () => {
    expect(computeUsage('kakao', 0, 100_000).ratio).toBe(0);
  });
});

describe('ApiQuotaTracker — 일일 호출량 추적', () => {
  let store: FakeQuotaStore;

  beforeEach(() => {
    store = new FakeQuotaStore();
  });

  const at = (iso: string): ApiQuotaTracker => new ApiQuotaTracker(store, () => new Date(iso));

  it('호출량을 누적한다', async () => {
    const tracker = at('2026-09-04T05:00:00Z');
    await tracker.increment('molit', 100);
    await tracker.increment('molit', 20);

    expect((await tracker.todayUsage('molit')).used).toBe(120);
  });

  it('기록이 없으면 0으로 본다', async () => {
    expect((await at('2026-09-04T05:00:00Z').todayUsage('kakao')).used).toBe(0);
  });

  it('0 이하 증가는 무시한다', async () => {
    const tracker = at('2026-09-04T05:00:00Z');
    await tracker.increment('molit', 0);
    await tracker.increment('molit', -5);
    expect((await tracker.todayUsage('molit')).used).toBe(0);
  });

  it('한국 시간 자정을 넘기면 사용량이 새로 시작된다', async () => {
    // 2026-09-04 23:00 KST = 14:00 UTC
    await at('2026-09-04T14:00:00Z').increment('molit', 500);
    // 2026-09-05 00:30 KST = 15:30 UTC (전날 UTC 이지만 한국은 다음 날)
    const nextDay = at('2026-09-04T15:30:00Z');

    expect((await nextDay.todayUsage('molit')).used).toBe(0);
  });

  it('제공자별 기본 한도를 쓴다', async () => {
    const tracker = at('2026-09-04T05:00:00Z');
    expect((await tracker.todayUsage('molit')).limit).toBe(DAILY_LIMITS.molit);
    expect((await tracker.todayUsage('kakao')).limit).toBe(DAILY_LIMITS.kakao);
  });

  it('allUsage 는 모든 제공자를 한 번에 준다 (대시보드용)', async () => {
    const usage = await at('2026-09-04T05:00:00Z').allUsage();
    expect(usage.map((u) => u.provider).sort()).toEqual(['kakao', 'molit', 'molit-apt']);
  });
});
