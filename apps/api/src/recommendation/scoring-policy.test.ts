import { describe, expect, it } from 'vitest';

import { ScoringPolicy, WEIGHTS, type ScoreInput } from './scoring-policy';

const base: ScoreInput = {
  medianPriceManwon: 90000,
  budgetMaxManwon: 100000,
  liquidity: 0.03,
  nearestSubwayM: 1400,
  nearestSchoolM: 900,
  quality: 0.1,
  qualityReasons: [],
  missingQuality: [],
};
const candidates = [
  { name: '저렴한 단지', input: { ...base, medianPriceManwon: 20000 } },
  { name: '역 옆 단지', input: { ...base, nearestSubwayM: 50, nearestSchoolM: 50 } },
  { name: '신축 대단지', input: { ...base, quality: 1 } },
];
describe('추천 정책', () => {
  it.each([
    ['value', '저렴한 단지'],
    ['location', '역 옆 단지'],
    ['newbuild', '신축 대단지'],
  ] as const)('%s 프리셋은 %s를 우선한다', (preset, expected) => {
    const policy = ScoringPolicy.preset(preset);
    const ranked = [...candidates].sort(
      (a, b) => policy.score(b.input).total - policy.score(a.input).total,
    );
    expect(ranked[0]?.name).toBe(expected);
  });
  it('없는 입지·예산·거래량은 중립이며 거짓 근거를 만들지 않는다', () => {
    const result = ScoringPolicy.preset('location').score({
      ...base,
      medianPriceManwon: null,
      budgetMaxManwon: null,
      liquidity: null,
      nearestSubwayM: null,
      nearestSchoolM: null,
      quality: 0.5,
    });
    expect(result.total).toBe(50);
    expect(result.reasons).toEqual([]);
    expect(result.missingData).toContain('지하철역');
  });
  it('예산 상한 0에서도 NaN이나 무한대가 생기지 않는다', () => {
    expect(
      Number.isFinite(ScoringPolicy.preset('value').score({ ...base, budgetMaxManwon: 0 }).total),
    ).toBe(true);
  });
  it('가중치가 잘못되면 즉시 거부한다', () => {
    expect(() => new ScoringPolicy({ ...WEIGHTS.value, price: -1 })).toThrow();
  });
  it('높은 거래회전율이나 먼 거리가 점수 범위를 벗어나지 않는다', () => {
    const result = ScoringPolicy.preset('value').score({
      ...base,
      liquidity: 2,
      nearestSubwayM: 90000,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });
});
