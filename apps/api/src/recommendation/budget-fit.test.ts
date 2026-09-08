import { describe, expect, it } from 'vitest';

import { BUDGET_FLOOR_SCORE, BUDGET_SWEET_SPOT, ScoringPolicy, budgetFitScore } from './scoring-policy';

const 억 = 10_000; // 만원

describe('budgetFitScore — 예산을 알맞게 쓰는가', () => {
  it('예산의 70% 를 쓰는 지점이 최고점', () => {
    // 상한을 꽉 채우지 않는다 — 취득세·중개수수료·이사비가 따로 든다
    expect(budgetFitScore(BUDGET_SWEET_SPOT * 7 * 억, 7 * 억)).toBe(1);
  });

  it('상한을 꽉 채우면 조금 깎인다 (같은 조건이면 싼 쪽이 앞서도록)', () => {
    const 상한꽉 = budgetFitScore(7 * 억, 7 * 억);
    const 최고점 = budgetFitScore(4.9 * 억, 7 * 억);
    expect(상한꽉).toBeLessThan(최고점);
    expect(상한꽉).toBeGreaterThan(0.8); // 그렇다고 크게 불리하지는 않다
  });

  it('예산을 넘으면 0', () => {
    expect(budgetFitScore(8 * 억, 7 * 억)).toBe(0);
  });

  it('아주 싸면 점수가 낮아진다 — 하지만 0 은 아니다', () => {
    // 싸게 사는 것도 그 자체로 나쁜 선택은 아니다
    const score = budgetFitScore(9_700, 7 * 억);
    expect(score).toBeGreaterThanOrEqual(BUDGET_FLOOR_SCORE);
    expect(score).toBeLessThan(0.7);
  });

  it('쌀수록 점수가 낮아진다 (예전과 정반대) ★', () => {
    // 예전 공식은 `1 - 가격/예산` 이라 쌀수록 높았고, 그래서 14㎡ 원룸이 1위였다
    const 원룸 = budgetFitScore(9_700, 7 * 억);
    const 중형 = budgetFitScore(4 * 억, 7 * 억);
    const 예산에맞음 = budgetFitScore(6 * 억, 7 * 억);

    expect(원룸).toBeLessThan(중형);
    expect(중형).toBeLessThan(예산에맞음);
  });

  it('최고점 양옆이 이어진다 (경계에서 튀지 않는다)', () => {
    const 바로아래 = budgetFitScore(BUDGET_SWEET_SPOT * 7 * 억 - 1, 7 * 억);
    const 바로위 = budgetFitScore(BUDGET_SWEET_SPOT * 7 * 억 + 1, 7 * 억);
    expect(바로아래).toBeGreaterThan(0.99);
    expect(바로위).toBeGreaterThan(0.99);
  });

  it('예산이 0 이거나 음수면 중립(0.5)', () => {
    expect(budgetFitScore(3 * 억, 0)).toBe(0.5);
    expect(budgetFitScore(3 * 억, -1)).toBe(0.5);
  });
});

describe('ScoringPolicy — 예산 활용도가 순위에 반영된다', () => {
  const base = {
    liquidity: 0.05,
    nearestSubwayM: 500,
    nearestSchoolM: 300,
    quality: 0.6,
    qualityReasons: [],
    missingQuality: [],
  };

  it('같은 조건이면 예산에 맞는 쪽이 더 높은 점수를 받는다', () => {
    const policy = ScoringPolicy.preset('value');
    const 원룸 = policy.score({ ...base, medianPriceManwon: 9_700, budgetMaxManwon: 7 * 억 });
    const 예산에맞음 = policy.score({ ...base, medianPriceManwon: 5 * 억, budgetMaxManwon: 7 * 억 });

    expect(예산에맞음.total).toBeGreaterThan(원룸.total);
  });

  it('예산에 맞으면 그렇게 말해 준다', () => {
    const policy = ScoringPolicy.preset('value');
    const 결과 = policy.score({ ...base, medianPriceManwon: 6 * 억, budgetMaxManwon: 7 * 억 });
    expect(결과.reasons.some((r) => r.includes('예산에 맞는 가격대'))).toBe(true);
  });

  it('여유가 크면 조건을 올려보라고 알려 준다', () => {
    const policy = ScoringPolicy.preset('value');
    const 결과 = policy.score({ ...base, medianPriceManwon: 1 * 억, budgetMaxManwon: 7 * 억 });
    expect(결과.reasons.some((r) => r.includes('조건을 더 올려'))).toBe(true);
  });

  it('예산을 안 넣으면 가격은 중립이고 그 사실을 남긴다', () => {
    const policy = ScoringPolicy.preset('value');
    const 결과 = policy.score({ ...base, medianPriceManwon: 3 * 억, budgetMaxManwon: null });
    expect(결과.price).toBe(50);
    expect(결과.missingData).toContain('예산 상한 미설정');
  });
});
