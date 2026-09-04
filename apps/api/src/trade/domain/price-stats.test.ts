import { describe, expect, it } from 'vitest';

import {
  isOutlier,
  median,
  medianExcludingOutliers,
  monthlyMedians,
  OUTLIER_THRESHOLD,
  yearMonthOf,
} from './price-stats';

describe('가격 통계 (순수 함수)', () => {
  describe('median', () => {
    it('홀수 개는 가운데 값', () => {
      expect(median([100, 300, 200])).toBe(200);
    });

    it('짝수 개는 가운데 두 값의 평균', () => {
      expect(median([100, 200, 300, 400])).toBe(250);
    });

    it('한 건이면 그 값', () => {
      expect(median([180_000])).toBe(180_000);
    });

    it('빈 배열은 null (0을 돌려주면 "0원 단지"가 된다)', () => {
      expect(median([])).toBeNull();
    });

    it('원본 배열을 건드리지 않는다', () => {
      const values = [300, 100, 200];
      median(values);
      expect(values).toEqual([300, 100, 200]);
    });

    it('평균과 달리 극단값에 잘 흔들리지 않는다', () => {
      // 1억짜리 직거래가 섞여도 중위값은 시세를 지킨다
      expect(median([180_000, 185_000, 190_000, 10_000])).toBe(182_500);
    });
  });

  describe('isOutlier', () => {
    it(`중위가 대비 ±${OUTLIER_THRESHOLD * 100}% 밖이면 이상치`, () => {
      expect(isOutlier(59_000, 100_000)).toBe(true); // -41%
      expect(isOutlier(141_000, 100_000)).toBe(true); // +41%
    });

    it('경계값(정확히 ±40%)은 이상치가 아니다', () => {
      expect(isOutlier(60_000, 100_000)).toBe(false);
      expect(isOutlier(140_000, 100_000)).toBe(false);
    });

    it('중위가가 0이면 판정하지 않는다 (0으로 나누지 않는다)', () => {
      expect(isOutlier(100, 0)).toBe(false);
    });
  });

  describe('medianExcludingOutliers — 이상치 제외 중위가 ★', () => {
    it('정상 거래만 있으면 그대로 중위값', () => {
      const result = medianExcludingOutliers([180_000, 185_000, 190_000]);
      expect(result).toEqual({ median: 185_000, usedCount: 3, excludedCount: 0 });
    });

    it('직거래로 의심되는 헐값을 걷어낸다', () => {
      // 10,000만원(1억)은 시세 18억 대비 -94% → 증여성 거래로 의심
      const result = medianExcludingOutliers([180_000, 185_000, 190_000, 195_000, 10_000]);

      expect(result?.excludedCount).toBe(1);
      expect(result?.median).toBe(187_500); // 정상 4건의 중위값
    });

    it('비정상적으로 높은 거래도 걷어낸다', () => {
      const result = medianExcludingOutliers([180_000, 185_000, 190_000, 195_000, 900_000]);
      expect(result?.excludedCount).toBe(1);
    });

    it('이상치를 뺀 뒤 값이 달라진다 (제외가 실제로 반영되는지)', () => {
      const values = [100_000, 105_000, 110_000, 300_000];
      expect(median(values)).not.toBe(medianExcludingOutliers(values)?.median);
    });

    it('빈 배열은 null', () => {
      expect(medianExcludingOutliers([])).toBeNull();
    });

    it('한 건뿐이면 그 값을 그대로 쓴다 (혼자서는 이상치가 될 수 없다)', () => {
      expect(medianExcludingOutliers([180_000])).toEqual({
        median: 180_000,
        usedCount: 1,
        excludedCount: 0,
      });
    });

    it('두 건이 극단적으로 벌어져도 결과를 낸다', () => {
      const result = medianExcludingOutliers([100_000, 500_000]);
      expect(result).not.toBeNull();
      expect(result!.median).toBeGreaterThan(0);
    });
  });

  describe('monthlyMedians — 월별 추이', () => {
    const at = (ym: string, day: number, price: number) => ({
      contractedAt: new Date(`${ym}-${String(day).padStart(2, '0')}T00:00:00Z`),
      priceManwon: price,
    });

    it('달별로 묶어 중위값을 낸다', () => {
      const points = monthlyMedians([
        at('2026-07', 5, 180_000),
        at('2026-07', 20, 190_000),
        at('2026-08', 3, 200_000),
      ]);

      expect(points).toEqual([
        { yearMonth: '2026-07', medianManwon: 185_000, count: 2 },
        { yearMonth: '2026-08', medianManwon: 200_000, count: 1 },
      ]);
    });

    it('시간 순으로 정렬한다', () => {
      const points = monthlyMedians([
        at('2026-08', 3, 200_000),
        at('2026-06', 3, 170_000),
        at('2026-07', 3, 180_000),
      ]);
      expect(points.map((p) => p.yearMonth)).toEqual(['2026-06', '2026-07', '2026-08']);
    });

    it('이상치는 추세에서 뺀다 (ToDo.md 5.3: 표시는 하되 추세선 계산에서 제외)', () => {
      const points = monthlyMedians([
        at('2026-07', 5, 180_000),
        at('2026-07', 10, 185_000),
        at('2026-07', 15, 190_000),
        at('2026-07', 20, 10_000), // 직거래 의심
      ]);

      expect(points[0]?.count).toBe(3);
      expect(points[0]?.medianManwon).toBe(185_000);
    });

    it('이상치 기준은 전체 기간으로 잡는다 (거래 1건인 달이 기준을 흔들지 않게)', () => {
      // 8월에 단 1건(이상치)만 있는 경우, 그 달만 따로 보면 이상치를 못 잡는다
      const points = monthlyMedians([
        at('2026-06', 5, 180_000),
        at('2026-06', 10, 182_000),
        at('2026-07', 5, 185_000),
        at('2026-07', 10, 188_000),
        at('2026-08', 5, 20_000), // 직거래 의심
      ]);

      expect(points.map((p) => p.yearMonth)).not.toContain('2026-08');
    });

    it('거래가 없는 달은 점을 만들지 않는다 (0으로 그리면 폭락처럼 보인다)', () => {
      const points = monthlyMedians([at('2026-06', 5, 180_000), at('2026-08', 5, 185_000)]);
      expect(points.map((p) => p.yearMonth)).toEqual(['2026-06', '2026-08']);
    });

    it('빈 입력은 빈 배열', () => {
      expect(monthlyMedians([])).toEqual([]);
    });
  });

  describe('yearMonthOf', () => {
    it('YYYY-MM 형식으로 만든다 (월은 2자리)', () => {
      expect(yearMonthOf(new Date('2026-08-15T00:00:00Z'))).toBe('2026-08');
      expect(yearMonthOf(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
    });
  });
});
