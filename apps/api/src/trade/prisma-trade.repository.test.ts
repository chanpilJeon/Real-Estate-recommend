import { Area } from '@apt/shared';
import { describe, expect, it, vi } from 'vitest';

import { PrismaTradeRepository } from './prisma-trade.repository';
import { TradeStatsService } from './trade-stats.service';

const rows = Array.from({ length: 240 }, (_, i) => ({
  id: BigInt(i + 1),
  complexId: 1,
  regionCode: '1168010100',
  rawName: '통계단지',
  priceManwon: 80000,
  exclusiveSqm: 84.97,
  contractedAt: new Date(Date.UTC(2026, 0, 1 + i)),
  floor: 3,
  builtYear: 2020,
  isCanceled: false,
})).reverse();
const make = () =>
  new PrismaTradeRepository({
    trade: { findMany: vi.fn(async (query) => rows.slice(0, query.take)) },
  } as any);

describe('통계와 표시 건수 분리', () => {
  it('240건의 통계에서 오래된 40건을 잘라내지 않는다', async () => {
    const stats = new TradeStatsService(make(), () => new Date('2026-09-01T00:00:00Z'));
    const trend = await stats.priceTrend(1, Area.fromSqm(84.97));
    expect(trend[0]?.yearMonth).toBe('2026-01');
    expect(trend.reduce((sum, point) => sum + point.count, 0)).toBe(240);
  });
  it('화면에 요청한 최근 20건 제한은 유지한다', async () => {
    expect(await make().findTrades({ complexId: 1, limit: 20 })).toHaveLength(20);
  });
});
