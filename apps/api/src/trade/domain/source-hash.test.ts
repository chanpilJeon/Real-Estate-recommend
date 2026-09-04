import { describe, expect, it } from 'vitest';

import { buildRentSourceHash, buildTradeSourceHash, type TradeIdentity } from './source-hash';

const base: TradeIdentity = {
  regionCode: '1168010100',
  rawName: '래미안역삼',
  exclusiveSqm: 84.97,
  priceManwon: 182_500,
  contractedAt: new Date('2026-08-15T00:00:00Z'),
  floor: 12,
};

describe('실거래 지문(sourceHash)', () => {
  it('DB 컬럼 길이(CHAR(64))에 맞는다', () => {
    expect(buildTradeSourceHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('같은 거래는 같은 지문 (재수집해도 중복 적재되지 않는다)', () => {
    expect(buildTradeSourceHash(base)).toBe(buildTradeSourceHash({ ...base }));
  });

  it.each([
    ['지역', { regionCode: '1168010200' }],
    ['단지명', { rawName: '래미안대치' }],
    ['면적', { exclusiveSqm: 59.94 }],
    ['금액', { priceManwon: 182_600 }],
    ['계약일', { contractedAt: new Date('2026-08-16T00:00:00Z') }],
    ['층', { floor: 13 }],
  ])('%s가 다르면 다른 지문이다', (_label, diff) => {
    expect(buildTradeSourceHash({ ...base, ...diff })).not.toBe(buildTradeSourceHash(base));
  });

  it('단지명 앞뒤 공백은 무시한다 (API 응답이 흔들려도 같은 거래)', () => {
    expect(buildTradeSourceHash({ ...base, rawName: '  래미안역삼  ' })).toBe(buildTradeSourceHash(base));
  });

  it('면적 표기가 흔들려도 같은 지문이다 (84.97 vs 84.970)', () => {
    expect(buildTradeSourceHash({ ...base, exclusiveSqm: 84.9700001 })).toBe(buildTradeSourceHash(base));
  });

  it('계약일의 시각 부분은 무시한다 (날짜만 본다)', () => {
    expect(
      buildTradeSourceHash({ ...base, contractedAt: new Date('2026-08-15T23:59:00Z') }),
    ).toBe(buildTradeSourceHash(base));
  });

  describe('전월세 지문', () => {
    const rent = {
      regionCode: '1168010100',
      rawName: '래미안역삼',
      exclusiveSqm: 84.97,
      depositManwon: 70_000,
      monthlyManwon: 0,
      contractedAt: new Date('2026-08-10T00:00:00Z'),
      floor: 7,
    };

    it('보증금이 다르면 다른 지문', () => {
      expect(buildRentSourceHash({ ...rent, depositManwon: 71_000 })).not.toBe(buildRentSourceHash(rent));
    });

    it('보증금이 같아도 월세가 다르면 다른 거래다 (반전세 구분)', () => {
      expect(buildRentSourceHash({ ...rent, monthlyManwon: 50 })).not.toBe(buildRentSourceHash(rent));
    });
  });
});
