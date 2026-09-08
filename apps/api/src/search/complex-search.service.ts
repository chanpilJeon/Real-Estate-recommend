import type { ComplexSummaryDto, PaginatedDto } from '@apt/shared';

import type { Complex } from '../complex';
import type { ILogger } from '../core';
import type { TradeStatsService } from '../trade';

import type { SearchCondition } from './domain/search-condition';
import type { CollectedRegion, ISearchEventStore, ISearchRepository } from './search.repository';

const CTX = 'search';

export type SortKey = 'price' | 'households' | 'newest' | 'quality';

/**
 * 조건 검색 (ToDo.md 3.12) — **하드 필터 전담**.
 * 점수화·랭킹은 recommendation(Step 7)이 한다.
 *
 * 가격 필터를 SQL 이 아니라 여기서 거는 이유:
 * 중위가는 이상치를 제외해 계산해야 하는데 그 규칙은 trade 모듈에 있다.
 * SQL 로 AVG/MIN 을 쓰면 직거래가 섞인 값으로 거르게 되어, 사용자가 예산에
 * 맞는다고 본 단지가 실제로는 아닌 상황이 생긴다. (ToDo.md 3.8)
 */
export class ComplexSearchService {
  constructor(
    private readonly repository: ISearchRepository,
    private readonly tradeStats: TradeStatsService,
    private readonly events: ISearchEventStore,
    private readonly logger: ILogger,
  ) {}

  async search(
    condition: SearchCondition,
    sort: SortKey = 'price',
  ): Promise<PaginatedDto<ComplexSummaryDto>> {
    const { filtered, medians } = await this.findEligible(condition);

    const sorted = this.sortBy(filtered, medians, sort);
    const total = sorted.length;
    const start = (condition.page - 1) * condition.pageSize;
    const items = sorted
      .slice(start, start + condition.pageSize)
      .map((complex) => this.toSummary(complex, medians.get(complex.id)?.toManwon() ?? null));

    void this.recordEvent(condition, total);

    return { items, total, page: condition.page, pageSize: condition.pageSize };
  }

  /** 추천도 동일한 하드 필터를 사용한다. 페이지를 자르기 전에 전체 후보를 반환한다. */
  async findEligible(condition: SearchCondition) {
    // 1) 단지 속성으로 1차 필터 (지역·연식·세대수·면적 보유)
    const candidates = await this.repository.findCandidates(condition);

    // 2) 중위가를 한 번에 구한다 (가격 계산은 trade 모듈만).
    //    면적 조건이 있으면 **그 면적대의** 중위가로 본다 — 안 그러면 작은 평형이 싸서
    //    예산에 걸린 단지가 "84㎡ 5억 이하" 검색 결과에 올라온다.
    const medians = await this.tradeStats.medianPricesByComplex(
      candidates.map((c) => c.id),
      {
        minSqm: condition.areaRange.min?.toSqm(),
        maxSqm: condition.areaRange.max?.toSqm(),
      },
    );

    // 3) 예산으로 거른다. 거래가 없어 중위가를 모르는 단지는
    //    예산 조건이 걸려 있으면 뺀다 — "예산에 맞는지 알 수 없음"을 맞는다고 보면 안 된다.
    const budgetGiven = !condition.priceRange.isUnbounded();
    const filtered = candidates.filter((complex) => {
      const median = medians.get(complex.id);
      if (median === undefined) return !budgetGiven;
      return condition.priceRange.contains(median);
    });

    return { filtered, medians };
  }

  /** 데이터가 실제로 쌓인 지역 목록 (검색 결과가 비었을 때 안내용) */
  collectedRegions(): Promise<CollectedRegion[]> {
    return this.repository.collectedRegions();
  }

  private sortBy(
    complexes: Complex[],
    medians: Map<number, { toManwon(): number }>,
    sort: SortKey,
  ): Complex[] {
    const priceOf = (c: Complex): number | null => medians.get(c.id)?.toManwon() ?? null;

    return [...complexes].sort((a, b) => {
      switch (sort) {
        case 'households':
          return b.households - a.households;
        case 'newest':
          // 연식 미상은 뒤로 — 모른다고 신축 취급하면 안 된다
          return (b.builtYear ?? 0) - (a.builtYear ?? 0);
        case 'quality':
          return b.qualityScore() - a.qualityScore();
        case 'price':
        default: {
          const pa = priceOf(a);
          const pb = priceOf(b);
          // 가격을 모르는 단지는 항상 뒤로 (0원으로 취급해 맨 앞에 오면 안 된다)
          if (pa === null && pb === null) return a.name.localeCompare(b.name);
          if (pa === null) return 1;
          if (pb === null) return -1;
          return pa - pb;
        }
      }
    });
  }

  toSummary(complex: Complex, medianPriceManwon: number | null): ComplexSummaryDto {
    const coordinate = complex.coordinate;
    return {
      id: complex.id,
      name: complex.name,
      address: complex.address,
      regionCode: complex.regionCode.toString(),
      lat: coordinate?.lat ?? null,
      lng: coordinate?.lng ?? null,
      households: complex.households,
      builtYear: complex.builtYear,
      medianPriceManwon,
      nearestSubwayM: complex.nearestSubwayM,
      nearestSchoolM: complex.nearestSchoolM,
    };
  }

  /** 검색 이력 기록은 응답을 늦추지 않는다 — 실패해도 검색은 성공이다 */
  private async recordEvent(condition: SearchCondition, resultCount: number): Promise<void> {
    try {
      const [first] = condition.regionCodes;
      if (first === undefined) return;
      await this.events.record(first.toString(), condition.toLogPayload(), resultCount);
    } catch (err) {
      this.logger.warn(CTX, '검색 이력 기록 실패 (검색 결과에는 영향 없음)', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
