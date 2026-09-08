import type { PaginatedDto, PresetName, RecommendationDto } from '@apt/shared';
import { Injectable } from '@nestjs/common';

import { ComplexSearchService, SearchCondition } from '../search';
import { TradeStatsService } from '../trade';

import { ScoringPolicy } from './scoring-policy';

/**
 * 추천의 기본 전용면적 하한 (㎡).
 * 실거래 자료의 '아파트'에는 14㎡ 원룸형 주택도 섞여 있는데,
 * 집을 사려는 사람에게 내밀 만한 것이 아니다. 검색으로는 여전히 볼 수 있다.
 */
export const MIN_RECOMMENDED_SQM = 40;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly search: ComplexSearchService,
    private readonly stats: TradeStatsService,
  ) {}
  async recommend(
    condition: SearchCondition,
    preset: PresetName,
  ): Promise<PaginatedDto<RecommendationDto>> {
    // 조건을 안 넣은 사람에게 원룸형 주택을 추천하지 않는다 (사용자가 정했으면 그대로 둔다)
    const effective = condition.withDefaultMinArea(MIN_RECOMMENDED_SQM);
    const { filtered, medians } = await this.search.findEligible(effective);
    const counts = await this.stats.annualTradeCounts(filtered.map((c) => c.id));
    const policy = ScoringPolicy.preset(preset);
    const now = new Date();
    const ranked = filtered
      .map((complex) => {
        const median = medians.get(complex.id)?.toManwon() ?? null;
        const score = policy.score({
          medianPriceManwon: median,
          budgetMaxManwon: effective.priceRange.max?.toManwon() ?? null,
          liquidity:
            complex.households > 0 ? (counts.get(complex.id) ?? 0) / complex.households : null,
          nearestSubwayM: complex.nearestSubwayM,
          nearestSchoolM: complex.nearestSchoolM,
          quality: complex.qualityScore(now),
          qualityReasons: complex.qualityReasons(now),
          missingQuality: [
            complex.households <= 0 ? '세대수' : '',
            complex.ageYears(now) === null ? '연식' : '',
            complex.parkingPerHousehold() === null ? '주차' : '',
          ].filter(Boolean),
        });
        return {
          ...this.search.toSummary(complex, median),
          score: score.total,
          reasons: score.reasons,
          missingData: score.missingData,
          breakdown: {
            price: score.price,
            liquidity: score.liquidity,
            location: score.location,
            quality: score.quality,
          },
        };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const start = (effective.page - 1) * effective.pageSize;
    return {
      items: ranked.slice(start, start + effective.pageSize),
      total: ranked.length,
      page: effective.page,
      pageSize: effective.pageSize,
    };
  }
}
