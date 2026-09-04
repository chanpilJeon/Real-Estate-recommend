import { Area, Money } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { Rent, Trade, type TradeProps } from './trade';

function makeTrade(overrides: Partial<TradeProps> = {}): Trade {
  return new Trade({
    id: '1',
    complexId: 7,
    regionCode: '1168010100',
    rawName: '래미안역삼',
    price: Money.fromManwon(182_500),
    area: Area.fromSqm(84.97),
    contractedAt: new Date('2026-08-15T00:00:00Z'),
    floor: 12,
    builtYear: 2005,
    isCanceled: false,
    ...overrides,
  });
}

describe('Trade — 실거래 도메인', () => {
  describe('pricePerPyeong — 평당가', () => {
    it('금액을 평수로 나눈다', () => {
      // 182,500만원 ÷ 25.7평 ≈ 7,101만원
      expect(makeTrade().pricePerPyeong().toManwon()).toBe(7_101);
    });

    it('면적이 작을수록 평당가가 높게 나온다 (같은 총액일 때)', () => {
      const small = makeTrade({ area: Area.fromSqm(59.94) });
      const large = makeTrade({ area: Area.fromSqm(114.87) });
      expect(small.pricePerPyeong().toManwon()).toBeGreaterThan(large.pricePerPyeong().toManwon());
    });
  });

  describe('isOutlier', () => {
    const median = Money.fromManwon(180_000);

    it('시세와 비슷하면 이상치가 아니다', () => {
      expect(makeTrade({ price: Money.fromManwon(185_000) }).isOutlier(median)).toBe(false);
    });

    it('1억짜리 직거래는 이상치다', () => {
      expect(makeTrade({ price: Money.fromManwon(10_000) }).isOutlier(median)).toBe(true);
    });

    it('비정상적으로 비싼 거래도 이상치다', () => {
      expect(makeTrade({ price: Money.fromManwon(900_000) }).isOutlier(median)).toBe(true);
    });

    it('경계값(정확히 ±40%)은 이상치가 아니다', () => {
      expect(makeTrade({ price: Money.fromManwon(108_000) }).isOutlier(median)).toBe(false);
      expect(makeTrade({ price: Money.fromManwon(252_000) }).isOutlier(median)).toBe(false);
    });
  });

  describe('isUsableForStats', () => {
    it('해제된 거래는 통계에서 뺀다 (ToDo.md 7.3)', () => {
      expect(makeTrade({ isCanceled: true }).isUsableForStats()).toBe(false);
      expect(makeTrade({ isCanceled: false }).isUsableForStats()).toBe(true);
    });
  });
});

describe('Rent — 전월세 도메인', () => {
  const makeRent = (monthlyManwon: number): Rent =>
    new Rent({
      id: '1',
      complexId: 7,
      rawName: '래미안역삼',
      deposit: Money.fromManwon(70_000),
      monthly: Money.fromManwon(monthlyManwon),
      area: Area.fromSqm(84.97),
      contractedAt: new Date('2026-08-10T00:00:00Z'),
      floor: 7,
    });

  it('월세가 0이면 전세다', () => {
    expect(makeRent(0).isJeonse()).toBe(true);
  });

  it('월세가 있으면 전세가 아니다 (반전세 포함)', () => {
    expect(makeRent(50).isJeonse()).toBe(false);
  });
});
