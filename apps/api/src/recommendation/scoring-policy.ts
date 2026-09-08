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
      const margin = clamp(1 - input.medianPriceManwon / input.budgetMaxManwon);
      price = margin;
      reasons.push(`예산 상한 대비 ${Math.round(margin * 100)}% 여유`);
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
