import { Money, type ComplexSummaryDto, type PaginatedDto } from '@apt/shared';

import type { Complex } from '../complex';
import type { ILogger } from '../core';
import type { TradeStatsService } from '../trade';

import { buildResultNote } from './domain/result-note';
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
    const { filtered, medians, excluded } = await this.findEligible(condition);

    const sorted = this.sortBy(filtered, medians, sort);
    const total = sorted.length;
    const start = (condition.page - 1) * condition.pageSize;
    const items = sorted
      .slice(start, start + condition.pageSize)
      .map((complex) => this.toSummary(complex, medians.get(complex.id)?.toManwon() ?? null));

    void this.recordEvent(condition, total);

    return {
      items,
      total,
      page: condition.page,
      pageSize: condition.pageSize,
      note:
        buildResultNote({
          totalCandidates: excluded.totalCandidates,
          shown: total,
          overBudget: excluded.overBudget,
          nearestOverBudget: excluded.nearestOverBudget,
          budgetMaxManwon: condition.priceRange.max?.toManwon() ?? null,
        }) ?? undefined,
    };
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

    /*
      예산은 **평형대별로** 본다.

      단지 전체 중위가로 거르면 큰 평형 때문에 중위가가 올라간 단지가 통째로 사라진다.
      광교아이파크는 최근 6개월에 10.7억~17.85억 거래가 31건 있는데 중위가가 15.5억이라
      "예산 15억" 검색에서 빠졌다 — 15억으로 살 수 있는 평형이 분명히 있는데도.
      서울·경기에서 이런 단지가 115곳이었다.

      사용자가 면적을 직접 골랐다면 그 면적대의 중위가가 이미 위에서 계산됐으므로
      평형대를 다시 나누지 않는다.
    */
    const areaChosen =
      (condition.areaRange.min !== null && !condition.minAreaIsDefault) ||
      condition.areaRange.max !== null;
    const byArea =
      budgetGiven && !areaChosen
        ? await this.tradeStats.medianPricesByArea(candidates.map((c) => c.id))
        : new Map<number, number[]>();

    /** 예산 안에서 살 수 있는 **가장 좋은 평형**의 가격. 없으면 null */
    const affordable = (complexId: number): number | null => {
      const inRange = (byArea.get(complexId) ?? []).filter((manwon) =>
        condition.priceRange.contains(Money.fromManwon(manwon)),
      );
      return inRange.length === 0 ? null : inRange[inRange.length - 1]!;
    };

    const filtered = candidates.filter((complex) => {
      const median = medians.get(complex.id);
      if (median === undefined) return !budgetGiven;
      if (condition.priceRange.contains(median)) return true;
      // 전체 중위가는 넘어도 예산에 드는 평형이 있으면 남긴다
      return affordable(complex.id) !== null;
    });

    // 예산 때문에 남은 단지는 **그 예산으로 살 수 있는 평형의 가격**을 보여준다.
    // 중위가 15.5억을 그대로 띄우면 "예산 15억인데 왜 15.5억이 나오지?" 가 된다.
    for (const complex of filtered) {
      const median = medians.get(complex.id);
      if (median !== undefined && condition.priceRange.contains(median)) continue;
      const price = affordable(complex.id);
      if (price !== null) medians.set(complex.id, Money.fromManwon(price));
    }

    /*
      **왜 결과가 적은지 설명할 재료를 함께 돌려준다.**

      "광교, 예산 10억"으로 찾으면 63곳 중 18곳만 남는다. 나머지는 예산을 넘어서인데,
      그 사실을 말해주지 않으면 사용자는 "광교에 아파트가 18개뿐인가?" 하고 오해하거나
      "왜 중흥S-클래스가 안 보이지?" 하며 서비스를 믿지 않게 된다.
      비어 있거나 적은 결과는 **이유와 함께** 보여줘야 한다.
    */
    const kept = new Set(filtered.map((c) => c.id));
    const overBudget = budgetGiven
      ? candidates
          .filter((complex) => !kept.has(complex.id) && medians.get(complex.id) !== undefined)
          .map((complex) => ({ complex, manwon: medians.get(complex.id)!.toManwon() }))
      : [];

    const max = condition.priceRange.max?.toManwon() ?? null;
    // 예산을 넘긴 것 중 **가장 가까운 것** — "조금만 올리면 이게 보인다"를 말해주기 위해
    const nearest =
      max === null
        ? null
        : overBudget
            .filter((row) => row.manwon > max)
            .sort((a, b) => a.manwon - b.manwon)[0] ?? null;

    return {
      filtered,
      medians,
      excluded: {
        totalCandidates: candidates.length,
        overBudget: overBudget.length,
        nearestOverBudget:
          nearest === null ? null : { name: nearest.complex.name, medianPriceManwon: nearest.manwon },
      },
    };
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
