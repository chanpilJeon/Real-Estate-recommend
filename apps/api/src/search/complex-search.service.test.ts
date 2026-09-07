import { Coordinate, Money, RegionCode } from '@apt/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { Complex, type ComplexProps } from '../complex';

import { ComplexSearchService } from './complex-search.service';
import { SearchCondition } from './domain/search-condition';
import type { ISearchEventStore, ISearchRepository } from './search.repository';

const 역삼동 = '1168010100';

function makeComplex(id: number, name: string, overrides: Partial<ComplexProps> = {}): Complex {
  return new Complex({
    id,
    kaptCode: `K${id}`,
    name,
    nameNormalized: name,
    regionCode: RegionCode.parse(역삼동),
    address: '서울 강남구 역삼동',
    coordinate: new Coordinate(37.5, 127.03),
    households: 1000,
    buildingCount: 10,
    approvalDate: new Date('2010-01-01T00:00:00Z'),
    builtYear: 2010,
    parkingCount: 1000,
    heatingType: '지역난방',
    nearestSubwayM: 300,
    nearestSchoolM: 400,
    ...overrides,
  });
}

class FakeSearchRepository implements ISearchRepository {
  constructor(public complexes: Complex[] = []) {}
  findCandidates(): Promise<Complex[]> {
    return Promise.resolve(this.complexes);
  }
}

class FakeEventStore implements ISearchEventStore {
  readonly records: { regionCode: string; resultCount: number }[] = [];
  shouldFail = false;
  record(regionCode: string, _c: Record<string, unknown>, resultCount: number): Promise<void> {
    if (this.shouldFail) return Promise.reject(new Error('DB 오류'));
    this.records.push({ regionCode, resultCount });
    return Promise.resolve();
  }
}

/** medianPricesByComplex 만 흉내내는 최소 가짜 */
const fakeStats = (medians: Record<number, number>) =>
  ({
    medianPricesByComplex: (ids: number[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => medians[id] !== undefined)
            .map((id) => [id, Money.fromManwon(medians[id]!)]),
        ),
      ),
  }) as unknown as ConstructorParameters<typeof ComplexSearchService>[1];

const logger = { info: () => {}, warn: () => {}, error: () => {} };

describe('ComplexSearchService — 조건 검색', () => {
  let events: FakeEventStore;

  beforeEach(() => {
    events = new FakeEventStore();
  });

  const build = (complexes: Complex[], medians: Record<number, number>) =>
    new ComplexSearchService(new FakeSearchRepository(complexes), fakeStats(medians), events, logger);

  describe('예산 필터', () => {
    const complexes = [makeComplex(1, '싼단지'), makeComplex(2, '중간단지'), makeComplex(3, '비싼단지')];
    const medians = { 1: 50_000, 2: 65_000, 3: 90_000 };

    it('예산 범위 안의 단지만 남긴다', async () => {
      const service = build(complexes, medians);
      const result = await service.search(
        SearchCondition.from({ regionCode: 역삼동, priceMin: 50_000, priceMax: 70_000 }),
      );

      expect(result.items.map((i) => i.name)).toEqual(['싼단지', '중간단지']);
      expect(result.total).toBe(2);
    });

    it('경계값을 포함한다', async () => {
      const service = build(complexes, medians);
      const result = await service.search(
        SearchCondition.from({ regionCode: 역삼동, priceMin: 50_000, priceMax: 50_000 }),
      );
      expect(result.items.map((i) => i.name)).toEqual(['싼단지']);
    });

    it('중위가를 응답에 담는다', async () => {
      const service = build(complexes, medians);
      const result = await service.search(SearchCondition.from({ regionCode: 역삼동 }));

      expect(result.items.find((i) => i.id === 1)?.medianPriceManwon).toBe(50_000);
    });
  });

  describe('거래가 없어 가격을 모르는 단지 ★', () => {
    const complexes = [makeComplex(1, '거래있음'), makeComplex(2, '거래없음')];

    it('예산 조건이 있으면 뺀다 ("알 수 없음"을 "맞음"으로 보면 안 된다)', async () => {
      const service = build(complexes, { 1: 60_000 });
      const result = await service.search(
        SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000 }),
      );

      expect(result.items.map((i) => i.name)).toEqual(['거래있음']);
    });

    it('예산 조건이 없으면 남긴다 (단지 자체는 볼 수 있어야 한다)', async () => {
      const service = build(complexes, { 1: 60_000 });
      const result = await service.search(SearchCondition.from({ regionCode: 역삼동 }));

      expect(result.items).toHaveLength(2);
      expect(result.items.find((i) => i.name === '거래없음')?.medianPriceManwon).toBeNull();
    });

    it('가격을 모르는 단지는 정렬에서 항상 뒤로 (0원 취급하면 맨 앞에 온다)', async () => {
      const service = build(complexes, { 1: 60_000 });
      const result = await service.search(SearchCondition.from({ regionCode: 역삼동 }), 'price');

      expect(result.items.map((i) => i.name)).toEqual(['거래있음', '거래없음']);
    });
  });

  describe('정렬', () => {
    const complexes = [
      makeComplex(1, '작고비쌈', { households: 300, builtYear: 2020 }),
      makeComplex(2, '크고쌈', { households: 2000, builtYear: 2000 }),
    ];
    const medians = { 1: 90_000, 2: 50_000 };

    it('기본은 가격 낮은 순', async () => {
      const result = await build(complexes, medians).search(
        SearchCondition.from({ regionCode: 역삼동 }),
      );
      expect(result.items.map((i) => i.name)).toEqual(['크고쌈', '작고비쌈']);
    });

    it('세대수 많은 순', async () => {
      const result = await build(complexes, medians).search(
        SearchCondition.from({ regionCode: 역삼동 }),
        'households',
      );
      expect(result.items[0]?.name).toBe('크고쌈');
    });

    it('신축 순 — 연식 미상은 뒤로', async () => {
      const withUnknown = [...complexes, makeComplex(3, '연식미상', { builtYear: null })];
      const result = await build(withUnknown, { ...medians, 3: 70_000 }).search(
        SearchCondition.from({ regionCode: 역삼동 }),
        'newest',
      );
      expect(result.items.map((i) => i.name)).toEqual(['작고비쌈', '크고쌈', '연식미상']);
    });
  });

  describe('페이지네이션', () => {
    const many = Array.from({ length: 25 }, (_, i) => makeComplex(i + 1, `단지${i + 1}`));
    const medians = Object.fromEntries(many.map((c, i) => [c.id, 50_000 + i * 1000]));

    it('페이지 크기만큼 자르고 전체 건수를 알려준다', async () => {
      const result = await build(many, medians).search(
        SearchCondition.from({ regionCode: 역삼동, pageSize: 10 }),
      );

      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
    });

    it('다음 페이지', async () => {
      const result = await build(many, medians).search(
        SearchCondition.from({ regionCode: 역삼동, pageSize: 10, page: 3 }),
      );
      expect(result.items).toHaveLength(5);
    });

    it('범위를 벗어난 페이지는 빈 목록 (오류가 아니다)', async () => {
      const result = await build(many, medians).search(
        SearchCondition.from({ regionCode: 역삼동, pageSize: 10, page: 99 }),
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(25);
    });

    it('전체 건수는 거른 뒤 기준이다 (페이지 자르기 전)', async () => {
      const result = await build(many, medians).search(
        SearchCondition.from({ regionCode: 역삼동, priceMax: 55_000, pageSize: 10 }),
      );
      expect(result.total).toBe(6); // 50,000 ~ 55,000
    });
  });

  describe('검색 이력 기록', () => {
    it('검색할 때마다 남긴다', async () => {
      await build([makeComplex(1, 'A')], { 1: 50_000 }).search(
        SearchCondition.from({ regionCode: 역삼동 }),
      );

      expect(events.records).toEqual([{ regionCode: 역삼동, resultCount: 1 }]);
    });

    it('기록이 실패해도 검색 결과는 정상으로 돌려준다', async () => {
      events.shouldFail = true;
      const result = await build([makeComplex(1, 'A')], { 1: 50_000 }).search(
        SearchCondition.from({ regionCode: 역삼동 }),
      );

      expect(result.items).toHaveLength(1);
    });
  });
});
