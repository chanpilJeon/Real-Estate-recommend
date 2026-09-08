import { Money } from '@apt/shared';
import { describe, expect, it, vi } from 'vitest';

import { SearchCondition } from '../search';

import { RecommendationService } from './recommendation.service';

it('가장 높은 점수의 101번째 후보도 페이지 자르기 전에 평가한다', async () => {
  const filtered = Array.from({ length: 101 }, (_, n) => ({
    id: n + 1,
    households: 500,
    nearestSubwayM: n === 100 ? 0 : 1500,
    nearestSchoolM: n === 100 ? 0 : 1000,
    qualityScore: () => 0.5,
    qualityReasons: () => [],
    ageYears: () => 10,
    parkingPerHousehold: () => 1,
  }));
  const search = {
    findEligible: vi.fn().mockResolvedValue({
      filtered,
      medians: new Map(filtered.map((c) => [c.id, Money.fromManwon(80000)])),
    }),
    toSummary: (c: { id: number }) => ({ id: c.id }),
  };
  const stats = { annualTradeCounts: vi.fn().mockResolvedValue(new Map()) };
  const service = new RecommendationService(search as any, stats as any);
  const first = await service.recommend(
    SearchCondition.from({ regionCode: '1168000000', pageSize: 1 }),
    'location',
  );
  expect(first.total).toBe(101);
  expect(first.items[0]?.id).toBe(101);
  const second = await service.recommend(
    SearchCondition.from({ regionCode: '1168000000', pageSize: 1, page: 2 }),
    'location',
  );
  expect(second.items[0]?.id).toBe(1); // 동점은 ID로 안정 정렬
});

describe('빈 추천', () => {
  it('자료가 없으면 빈 결과와 0건을 반환한다', async () => {
    const service = new RecommendationService(
      { findEligible: async () => ({ filtered: [], medians: new Map() }) } as any,
      { annualTradeCounts: async () => new Map() } as any,
    );
    const result = await service.recommend(
      SearchCondition.from({ regionCode: '1168000000' }),
      'value',
    );
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
