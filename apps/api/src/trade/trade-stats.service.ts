import { Area, Money } from '@apt/shared';

import {
  medianExcludingOutliers,
  monthlyMedians,
  type MedianResult,
  type MonthlyPoint,
} from './domain/price-stats';
import type { AreaRangeFilter, ITradeRepository } from './trade.repository';
import { TtlCache } from './ttl-cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** 중위가 기본 조회 구간 — 너무 짧으면 표본이 없고, 길면 옛 시세가 섞인다 */
export const DEFAULT_MEDIAN_MONTHS = 6;
/** 추이 기본 구간 */
export const DEFAULT_TREND_MONTHS = 36;
/** 유동성 계산 구간 */
export const LIQUIDITY_MONTHS = 12;

export interface MedianPriceResult {
  price: Money;
  usedCount: number;
  excludedCount: number;
}

/**
 * 가격 통계 (ToDo.md 3.8).
 *
 * **가격에 관한 모든 계산의 단일 창구다.**
 * 다른 모듈이 실거래 테이블을 직접 집계하면 이상치 기준이 갈라진다.
 */
export class TradeStatsService {
  private readonly cache = new TtlCache<unknown>(CACHE_TTL_MS);

  constructor(
    private readonly repository: ITradeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 이상치를 제외한 중위가. 표본이 없으면 null */
  async medianPrice(
    complexId: number,
    area: Area,
    months = DEFAULT_MEDIAN_MONTHS,
  ): Promise<MedianPriceResult | null> {
    return this.cached(`median:${complexId}:${area.toSqm()}:${months}`, async () => {
      const trades = await this.repository.findTrades({
        complexId,
        area,
        since: this.monthsAgo(months),
      });

      const result: MedianResult | null = medianExcludingOutliers(
        trades.map((t) => t.price.toManwon()),
      );
      if (result === null) return null;

      return {
        price: Money.fromManwon(result.median),
        usedCount: result.usedCount,
        excludedCount: result.excludedCount,
      };
    });
  }

  /** 단지 전체(면적 무관) 중위가 — 목록 화면에서 대표값으로 쓴다 */
  async medianPriceAllAreas(
    complexId: number,
    months = DEFAULT_MEDIAN_MONTHS,
  ): Promise<Money | null> {
    return this.cached(`medianAll:${complexId}:${months}`, async () => {
      const trades = await this.repository.findTrades({ complexId, since: this.monthsAgo(months) });
      const result = medianExcludingOutliers(trades.map((t) => t.price.toManwon()));
      return result === null ? null : Money.fromManwon(result.median);
    });
  }

  /**
   * 여러 단지의 중위가를 한 번에 구한다 (검색 결과 목록용).
   *
   * 단지마다 `medianPrice()` 를 부르면 질의가 단지 수만큼 늘어난다.
   * 거래를 한 번에 읽어 와 메모리에서 단지별로 나눈 뒤 계산한다.
   * **가격 집계 규칙은 여기서도 같은 순수 함수를 쓴다** (ToDo.md 3.8).
   */
  async medianPricesByComplex(
    complexIds: number[],
    areaRange?: AreaRangeFilter,
    months = DEFAULT_MEDIAN_MONTHS,
  ): Promise<Map<number, Money>> {
    if (complexIds.length === 0) return new Map();

    const trades = await this.repository.findTradesForComplexes(
      complexIds,
      this.monthsAgo(months),
      areaRange,
    );

    const grouped = new Map<number, number[]>();
    for (const trade of trades) {
      if (trade.complexId === null) continue;
      const bucket = grouped.get(trade.complexId);
      if (bucket === undefined) grouped.set(trade.complexId, [trade.price.toManwon()]);
      else bucket.push(trade.price.toManwon());
    }

    const medians = new Map<number, Money>();
    for (const [complexId, prices] of grouped) {
      const result = medianExcludingOutliers(prices);
      if (result !== null) medians.set(complexId, Money.fromManwon(result.median));
    }
    return medians;
  }

  /**
   * 면적대별 중위가 (단지당 여러 개).
   *
   * 왜 필요한가: 예산 필터를 **단지 전체 중위가**로 걸면, 큰 평형 때문에 중위가가 올라간
   * 단지가 통째로 사라진다. 광교아이파크는 최근 6개월에 10.7억~17.85억 거래가 31건 있는데
   * 중위가가 15.5억이라 "예산 15억" 검색에서 빠졌다 — 15억으로 살 수 있는 평형이
   * 분명히 있는데도 그렇다. 서울·경기에서 이런 단지가 115곳이었다.
   *
   * 구간은 화면의 면적 칩과 같게 맞춘다 (~60 / 60~85 / 85~102 / 102~135 / 135~).
   * 거래를 한 번만 읽어 앱에서 나누므로 질의는 늘지 않는다.
   */
  async medianPricesByArea(
    complexIds: number[],
    months = DEFAULT_MEDIAN_MONTHS,
  ): Promise<Map<number, number[]>> {
    if (complexIds.length === 0) return new Map();

    const trades = await this.repository.findTradesForComplexes(complexIds, this.monthsAgo(months));

    const grouped = new Map<number, Map<number, number[]>>();
    for (const trade of trades) {
      if (trade.complexId === null) continue;
      const bucket = areaBucketOf(trade.area.toSqm());

      let byBucket = grouped.get(trade.complexId);
      if (byBucket === undefined) {
        byBucket = new Map();
        grouped.set(trade.complexId, byBucket);
      }
      const prices = byBucket.get(bucket);
      if (prices === undefined) byBucket.set(bucket, [trade.price.toManwon()]);
      else prices.push(trade.price.toManwon());
    }

    const result = new Map<number, number[]>();
    for (const [complexId, byBucket] of grouped) {
      const medians: number[] = [];
      for (const prices of byBucket.values()) {
        const median = medianExcludingOutliers(prices);
        if (median !== null) medians.push(median.median);
      }
      if (medians.length > 0) result.set(complexId, medians.sort((a, b) => a - b));
    }
    return result;
  }

  /** 추천의 유동성 지표. 후보 전체를 한 번 조회하며 취소 거래는 저장소에서 제외된다. */
  async annualTradeCounts(complexIds: number[]): Promise<Map<number, number>> {
    const rows = await this.repository.findTradesForComplexes(
      complexIds,
      this.monthsAgo(LIQUIDITY_MONTHS),
    );
    const counts = new Map<number, number>();
    for (const trade of rows) {
      if (trade.complexId !== null)
        counts.set(trade.complexId, (counts.get(trade.complexId) ?? 0) + 1);
    }
    return counts;
  }

  /** 월별 중위가 추이 (이상치 제외) */
  async priceTrend(
    complexId: number,
    area: Area,
    months = DEFAULT_TREND_MONTHS,
  ): Promise<MonthlyPoint[]> {
    return this.cached(`trend:${complexId}:${area.toSqm()}:${months}`, async () => {
      const trades = await this.repository.findTrades({
        complexId,
        area,
        since: this.monthsAgo(months),
      });
      return monthlyMedians(
        trades.map((t) => ({ contractedAt: t.contractedAt, priceManwon: t.price.toManwon() })),
      );
    });
  }

  /**
   * 유동성 — 최근 1년 거래량 ÷ 세대수.
   * 거래가 활발한 단지는 사고팔기가 쉬워 매수·매도 모두 유리하다 (ToDo.md 5.2).
   */
  async liquidity(complexId: number, households: number): Promise<number | null> {
    if (households <= 0) return null;

    return this.cached(`liquidity:${complexId}:${households}`, async () => {
      const count = await this.repository.countTrades(complexId, this.monthsAgo(LIQUIDITY_MONTHS));
      return Math.round((count / households) * 10_000) / 10_000;
    });
  }

  /**
   * 전세가율 — 전세 보증금 중위 ÷ 매매 중위.
   * 반전세·월세는 제외한다. 어느 한쪽 표본이 없으면 null.
   */
  async jeonseRatio(
    complexId: number,
    area: Area,
    months = DEFAULT_MEDIAN_MONTHS,
  ): Promise<number | null> {
    return this.cached(`jeonse:${complexId}:${area.toSqm()}:${months}`, async () => {
      const since = this.monthsAgo(months);
      const [rents, sale] = await Promise.all([
        this.repository.findRents({ complexId, area, since }),
        this.medianPrice(complexId, area, months),
      ]);

      if (sale === null || sale.price.toManwon() <= 0) return null;

      const deposits = rents.filter((r) => r.isJeonse()).map((r) => r.deposit.toManwon());
      const jeonseMedian = medianExcludingOutliers(deposits);
      if (jeonseMedian === null) return null;

      return Math.round((jeonseMedian.median / sale.price.toManwon()) * 1000) / 1000;
    });
  }

  /** 최근 실거래 목록 (화면 표시용). 해제 거래도 표시는 하되 통계에는 안 쓴다 */
  findRecentTrades(
    complexId: number,
    area?: Area,
    limit = 20,
  ): ReturnType<ITradeRepository['findTrades']> {
    return this.repository.findTrades({ complexId, area, limit, includeCanceled: true });
  }

  distinctAreas(complexId: number): Promise<number[]> {
    return this.repository.distinctAreas(complexId);
  }

  /** 데이터 신선도 지표 (ToDo.md 8절) */
  latestContractDate(): Promise<Date | null> {
    return this.repository.latestContractDate();
  }

  /** 수집 배치가 새 데이터를 넣은 뒤 호출한다 */
  invalidateCache(): void {
    this.cache.clear();
  }

  private monthsAgo(months: number): Date {
    const date = new Date(this.now());
    date.setUTCMonth(date.getUTCMonth() - months);
    return date;
  }

  private cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    return this.cache.through(key, compute as () => Promise<unknown>) as Promise<T>;
  }
}

/** 화면의 면적 칩과 같은 구간 (전용 ㎡) */
const AREA_BUCKET_EDGES = [60, 85, 102, 135];

function areaBucketOf(sqm: number): number {
  for (let i = 0; i < AREA_BUCKET_EDGES.length; i += 1) {
    if (sqm < AREA_BUCKET_EDGES[i]!) return i;
  }
  return AREA_BUCKET_EDGES.length;
}
