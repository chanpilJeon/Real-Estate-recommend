import type { PaginatedDto, PresetName, RecommendationDto } from '@apt/shared';
import { Injectable } from '@nestjs/common';

import { ComplexSearchService, SearchCondition } from '../search';
import { TradeStatsService } from '../trade';

import { ScoringPolicy } from './scoring-policy';

@Injectable()
export class RecommendationService {
  constructor(private readonly search: ComplexSearchService, private readonly stats: TradeStatsService) {}
  async recommend(condition: SearchCondition, preset: PresetName): Promise<PaginatedDto<RecommendationDto>> {
    const { filtered, medians } = await this.search.findEligible(condition);
    const counts = await this.stats.annualTradeCounts(filtered.map(c => c.id));
    const policy = ScoringPolicy.preset(preset);
    const now = new Date();
    const ranked = filtered.map(complex => {
      const median = medians.get(complex.id)?.toManwon() ?? null;
      const score = policy.score({
        medianPriceManwon: median, budgetMaxManwon: condition.priceRange.max?.toManwon() ?? null,
        liquidity: complex.households > 0 ? (counts.get(complex.id) ?? 0) / complex.households : null,
        nearestSubwayM: complex.nearestSubwayM, nearestSchoolM: complex.nearestSchoolM,
        quality: complex.qualityScore(now), qualityReasons: complex.qualityReasons(now),
        missingQuality: [complex.households <= 0 ? '세대수' : '', complex.ageYears(now) === null ? '연식' : '', complex.parkingPerHousehold() === null ? '주차' : ''].filter(Boolean),
      });
      return { ...this.search.toSummary(complex, median), score: score.total, reasons: score.reasons,
        missingData: score.missingData, breakdown: { price: score.price, liquidity: score.liquidity, location: score.location, quality: score.quality } };
    }).sort((a, b) => b.score - a.score || a.id - b.id);
    const start = (condition.page - 1) * condition.pageSize;
    return { items: ranked.slice(start, start + condition.pageSize), total: ranked.length, page: condition.page, pageSize: condition.pageSize };
  }
}
