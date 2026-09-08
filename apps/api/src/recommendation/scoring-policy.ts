import type { PresetName } from '@apt/shared';

export interface ScoreWeights {
  price: number;
  liquidity: number;
  location: number;
  quality: number;
}
export interface ScoreInput {
  medianPriceManwon: number | null;
  budgetMaxManwon: number | null;
  liquidity: number | null;
  nearestSubwayM: number | null;
  nearestSchoolM: number | null;
  quality: number;
  qualityReasons: string[];
  missingQuality: string[];
}
export interface ScoreBreakdown extends ScoreWeights {
  total: number;
  reasons: string[];
  missingData: string[];
}
export const WEIGHTS: Record<PresetName, ScoreWeights> = {
  value: { price: 0.5, liquidity: 0.2, location: 0.15, quality: 0.15 },
  location: { price: 0.15, liquidity: 0.1, location: 0.6, quality: 0.15 },
  newbuild: { price: 0.15, liquidity: 0.1, location: 0.15, quality: 0.6 },
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * 예산의 이 비율을 쓰는 지점이 최고점.
 * 상한을 꽉 채우지 않는 이유: 취득세·중개수수료·이사비가 따로 든다.
 */
export const BUDGET_SWEET_SPOT = 0.7;
/** 아주 싼 집도 후보에서 빼지는 않는다 — 최저 점수 */
export const BUDGET_FLOOR_SCORE = 0.5;
/** 상한을 꽉 채웠을 때 깎는 폭. 같은 조건이면 싼 쪽을 고르도록 남겨 둔다 */
const BUDGET_TOP_PENALTY = 0.15;

/**
 * 예산을 얼마나 알맞게 쓰는가 (0~1).
 *
 * ⚠ 예전에는 `1 - 가격/예산` 이었다. 쌀수록 높은 점수라, 예산 7억인 사람에게
 *   9,700만원짜리 14㎡ 원룸이 1위로 올라왔다. **집을 사려는 사람은 가장 싼 것이 아니라
 *   예산 안에서 가장 좋은 집을 원한다.**
 *
 * 그래서 예산의 70~100% 를 쓰는 매물을 최고점으로 두고, 그보다 훨씬 싸면 점수를 낮춘다.
 * 다만 0 으로 떨어뜨리지는 않는다 — 싸게 사는 것도 그 자체로 나쁜 선택은 아니다.
 */
export function budgetFitScore(priceManwon: number, budgetMaxManwon: number): number {
  if (budgetMaxManwon <= 0) return 0.5;

  const ratio = priceManwon / budgetMaxManwon;
  if (ratio > 1) return 0; // 예산 초과 (보통 필터에서 이미 빠진다)

  // 최고점 위쪽은 완만하게 깎는다 — 그래야 같은 조건에서 싼 쪽이 앞선다
  if (ratio >= BUDGET_SWEET_SPOT) {
    return 1 - BUDGET_TOP_PENALTY * ((ratio - BUDGET_SWEET_SPOT) / (1 - BUDGET_SWEET_SPOT));
  }
  return BUDGET_FLOOR_SCORE + (1 - BUDGET_FLOOR_SCORE) * (ratio / BUDGET_SWEET_SPOT);
}

/** 초기 가중치 모델. 실거래 기반 비교 점수이며 시세 예측이나 수익률이 아니다. */
export class ScoringPolicy {
  constructor(private readonly weights: ScoreWeights) {
    const values = Object.values(weights);
    if (
      values.some((v) => !Number.isFinite(v) || v < 0) ||
      Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.000001
    )
      throw new Error('점수 가중치 합은 1이어야 합니다.');
  }
  static preset(name: PresetName) {
    return new ScoringPolicy(WEIGHTS[name]);
  }
  score(input: ScoreInput): ScoreBreakdown {
    const missingData = [...input.missingQuality];
    const reasons: string[] = [];
    let price = 0.5;
    if (input.medianPriceManwon === null) missingData.push('최근 6개월 매매가');
    if (input.budgetMaxManwon === null || input.budgetMaxManwon <= 0)
      missingData.push('예산 상한 미설정');
    else if (input.medianPriceManwon !== null) {
      price = budgetFitScore(input.medianPriceManwon, input.budgetMaxManwon);
      const used = Math.round((input.medianPriceManwon / input.budgetMaxManwon) * 100);
      reasons.push(
        used >= BUDGET_SWEET_SPOT * 100
          ? `예산의 ${used}% — 예산에 맞는 가격대`
          : `예산의 ${used}% — 여유가 커서 조건을 더 올려볼 수 있습니다`,
      );
    }
    const liquidity = input.liquidity === null ? 0.5 : clamp(input.liquidity / 0.1);
    if (input.liquidity === null) missingData.push('거래회전율');
    else reasons.push(`최근 1년 수집 거래량 / 세대수 ${(input.liquidity * 100).toFixed(1)}%`);
    const distanceScore = (meters: number | null, max: number, label: string) => {
      if (meters === null) {
        missingData.push(label);
        return 0.5;
      }
      reasons.push(`${label} 직선 ${meters.toLocaleString()}m`);
      return clamp(1 - meters / max);
    };
    const location =
      distanceScore(input.nearestSubwayM, 1500, '지하철역') * 0.7 +
      distanceScore(input.nearestSchoolM, 1000, '초등학교') * 0.3;
    reasons.push(...input.qualityReasons);
    const quality = clamp(input.quality);
    const total =
      100 *
      (price * this.weights.price +
        liquidity * this.weights.liquidity +
        location * this.weights.location +
        quality * this.weights.quality);
    return {
      total: round(total),
      price: round(price * 100),
      liquidity: round(liquidity * 100),
      location: round(location * 100),
      quality: round(quality * 100),
      reasons,
      missingData,
    };
  }
}
