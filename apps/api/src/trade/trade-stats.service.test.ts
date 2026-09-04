import { Area, Money } from '@apt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Rent, Trade } from './domain/trade';
import { TradeStatsService } from './trade-stats.service';
import type {
  BulkResult,
  ITradeRepository,
  RentUpsertInput,
  TradeQuery,
  TradeUpsertInput,
} from './trade.repository';


const NOW = new Date('2026-09-04T00:00:00Z');
const 전용84 = Area.fromSqm(84.97);

const trade = (priceManwon: number, iso: string, opts: { canceled?: boolean; sqm?: number } = {}): Trade =>
  new Trade({
    id: `${priceManwon}-${iso}`,
    complexId: 7,
    regionCode: '1168010100',
    rawName: '래미안역삼',
    price: Money.fromManwon(priceManwon),
    area: Area.fromSqm(opts.sqm ?? 84.97),
    contractedAt: new Date(`${iso}T00:00:00Z`),
    floor: 10,
    builtYear: 2005,
    isCanceled: opts.canceled ?? false,
  });

const rent = (depositManwon: number, monthlyManwon: number, iso: string): Rent =>
  new Rent({
    id: `${depositManwon}`,
    complexId: 7,
    rawName: '래미안역삼',
    deposit: Money.fromManwon(depositManwon),
    monthly: Money.fromManwon(monthlyManwon),
    area: 전용84,
    contractedAt: new Date(`${iso}T00:00:00Z`),
    floor: 7,
  });

class FakeTradeRepository implements ITradeRepository {
  trades: Trade[] = [];
  rents: Rent[] = [];
  tradeCount = 0;
  readonly queries: TradeQuery[] = [];

  bulkUpsertTrades(_t: TradeUpsertInput[]): Promise<BulkResult> {
    return Promise.resolve({ inserted: 0, skipped: 0 });
  }
  bulkUpsertRents(_r: RentUpsertInput[]): Promise<BulkResult> {
    return Promise.resolve({ inserted: 0, skipped: 0 });
  }
  findTrades(query: TradeQuery): Promise<Trade[]> {
    this.queries.push(query);
    let result = this.trades;
    if (query.includeCanceled !== true) result = result.filter((t) => t.isUsableForStats());
    if (query.area !== undefined) result = result.filter((t) => t.area.toSqm() === query.area!.toSqm());
    if (query.since !== undefined) result = result.filter((t) => t.contractedAt >= query.since!);
    return Promise.resolve(result);
  }
  findRents(query: TradeQuery): Promise<Rent[]> {
    let result = this.rents;
    if (query.area !== undefined) result = result.filter((r) => r.area.toSqm() === query.area!.toSqm());
    return Promise.resolve(result);
  }
  latestContractDate(): Promise<Date | null> {
    return Promise.resolve(this.trades[0]?.contractedAt ?? null);
  }
  countTrades(): Promise<number> {
    return Promise.resolve(this.tradeCount);
  }
  distinctAreas(): Promise<number[]> {
    return Promise.resolve([59.94, 84.97]);
  }
}

describe('TradeStatsService — 가격 통계', () => {
  let repo: FakeTradeRepository;
  let service: TradeStatsService;

  beforeEach(() => {
    repo = new FakeTradeRepository();
    service = new TradeStatsService(repo, () => NOW);
  });

  describe('medianPrice — 이상치 제외 중위가 ★', () => {
    it('정상 거래의 중위값을 낸다', async () => {
      repo.trades = [
        trade(180_000, '2026-08-01'),
        trade(185_000, '2026-08-10'),
        trade(190_000, '2026-08-20'),
      ];

      const result = await service.medianPrice(7, 전용84);
      expect(result?.price.toManwon()).toBe(185_000);
      expect(result?.excludedCount).toBe(0);
    });

    it('직거래 의심 거래를 빼고 계산한다', async () => {
      repo.trades = [
        trade(180_000, '2026-08-01'),
        trade(185_000, '2026-08-05'),
        trade(190_000, '2026-08-10'),
        trade(195_000, '2026-08-15'),
        trade(10_000, '2026-08-20'), // 1억 — 시세 대비 -95%
      ];

      const result = await service.medianPrice(7, 전용84);
      expect(result?.excludedCount).toBe(1);
      expect(result?.price.toManwon()).toBe(187_500);
    });

    it('해제된 거래는 애초에 조회하지 않는다', async () => {
      repo.trades = [
        trade(180_000, '2026-08-01'),
        trade(999_000, '2026-08-05', { canceled: true }),
      ];

      expect((await service.medianPrice(7, 전용84))?.price.toManwon()).toBe(180_000);
    });

    it('거래가 없으면 null (0원이 아니다)', async () => {
      expect(await service.medianPrice(7, 전용84)).toBeNull();
    });

    it('요청한 면적만 본다', async () => {
      repo.trades = [trade(180_000, '2026-08-01'), trade(90_000, '2026-08-02', { sqm: 59.94 })];
      expect((await service.medianPrice(7, 전용84))?.price.toManwon()).toBe(180_000);
    });

    it('기본 조회 구간은 최근 6개월이다', async () => {
      repo.trades = [
        trade(180_000, '2026-08-01'),
        trade(100_000, '2024-01-01'), // 2년 전 — 제외되어야 한다
      ];
      expect((await service.medianPrice(7, 전용84))?.price.toManwon()).toBe(180_000);
    });
  });

  describe('priceTrend — 월별 추이', () => {
    it('달별 중위가를 시간순으로 낸다', async () => {
      repo.trades = [
        trade(180_000, '2026-06-05'),
        trade(184_000, '2026-06-20'),
        trade(190_000, '2026-07-10'),
      ];

      const trend = await service.priceTrend(7, 전용84);
      expect(trend).toEqual([
        { yearMonth: '2026-06', medianManwon: 182_000, count: 2 },
        { yearMonth: '2026-07', medianManwon: 190_000, count: 1 },
      ]);
    });

    it('거래가 없으면 빈 배열', async () => {
      expect(await service.priceTrend(7, 전용84)).toEqual([]);
    });
  });

  describe('liquidity — 유동성 (연 거래량 ÷ 세대수)', () => {
    it('비율을 낸다', async () => {
      repo.tradeCount = 64;
      expect(await service.liquidity(7, 1280)).toBe(0.05);
    });

    it('세대수를 모르면 null (0으로 나누지 않는다)', async () => {
      expect(await service.liquidity(7, 0)).toBeNull();
    });

    it('거래가 없으면 0', async () => {
      repo.tradeCount = 0;
      expect(await service.liquidity(7, 1000)).toBe(0);
    });
  });

  describe('jeonseRatio — 전세가율', () => {
    it('전세 보증금 중위 ÷ 매매 중위', async () => {
      repo.trades = [trade(200_000, '2026-08-01')];
      repo.rents = [rent(140_000, 0, '2026-08-05')];

      expect(await service.jeonseRatio(7, 전용84)).toBe(0.7);
    });

    it('월세·반전세는 제외한다', async () => {
      repo.trades = [trade(200_000, '2026-08-01')];
      repo.rents = [
        rent(140_000, 0, '2026-08-05'), // 전세
        rent(20_000, 100, '2026-08-06'), // 반전세 — 빠져야 한다
      ];

      expect(await service.jeonseRatio(7, 전용84)).toBe(0.7);
    });

    it('전세 표본이 없으면 null', async () => {
      repo.trades = [trade(200_000, '2026-08-01')];
      repo.rents = [rent(20_000, 100, '2026-08-06')];
      expect(await service.jeonseRatio(7, 전용84)).toBeNull();
    });

    it('매매 표본이 없으면 null', async () => {
      repo.rents = [rent(140_000, 0, '2026-08-05')];
      expect(await service.jeonseRatio(7, 전용84)).toBeNull();
    });
  });

  describe('최근 실거래 목록', () => {
    it('해제된 거래도 함께 보여준다 (통계에서만 뺀다)', async () => {
      repo.trades = [trade(180_000, '2026-08-01'), trade(190_000, '2026-08-05', { canceled: true })];

      expect(await service.findRecentTrades(7)).toHaveLength(2);
      expect(repo.queries.at(-1)?.includeCanceled).toBe(true);
    });
  });

  describe('캐시 (5분)', () => {
    it('같은 질문을 두 번 하면 DB 를 한 번만 본다', async () => {
      repo.trades = [trade(180_000, '2026-08-01')];
      const spy = vi.spyOn(repo, 'findTrades');

      await service.medianPrice(7, 전용84);
      await service.medianPrice(7, 전용84);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('면적이 다르면 따로 계산한다', async () => {
      repo.trades = [trade(180_000, '2026-08-01'), trade(90_000, '2026-08-02', { sqm: 59.94 })];

      expect((await service.medianPrice(7, 전용84))?.price.toManwon()).toBe(180_000);
      expect((await service.medianPrice(7, Area.fromSqm(59.94)))?.price.toManwon()).toBe(90_000);
    });

    it('수집 후 캐시를 비우면 다시 계산한다', async () => {
      repo.trades = [trade(180_000, '2026-08-01')];
      await service.medianPrice(7, 전용84);

      repo.trades = [trade(200_000, '2026-08-01')];
      service.invalidateCache();

      expect((await service.medianPrice(7, 전용84))?.price.toManwon()).toBe(200_000);
    });
  });
});
