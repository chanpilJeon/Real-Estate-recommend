import { InvalidValueError } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SearchCondition } from './search-condition';

const 역삼동 = '1168010100';
const 강남구 = '1168000000';

describe('SearchCondition — 검색 조건 값 객체', () => {
  describe('지역', () => {
    it('법정동 코드 하나를 받는다', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동 });
      expect(cond.regionCodes.map((c) => c.toString())).toEqual([역삼동]);
    });

    it('쉼표로 여러 지역을 받는다 (생활권 별칭이 여러 동으로 풀린다)', () => {
      const cond = SearchCondition.from({ regionCode: `${역삼동},1168010600` });
      expect(cond.regionCodes).toHaveLength(2);
    });

    it('중복은 하나로 합친다', () => {
      expect(SearchCondition.from({ regionCode: `${역삼동},${역삼동}` }).regionCodes).toHaveLength(1);
    });

    it('공백을 다듬는다', () => {
      expect(SearchCondition.from({ regionCode: ` ${역삼동} ` }).regionCodes).toHaveLength(1);
    });

    it('지역이 없으면 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: '' })).toThrow(InvalidValueError);
      expect(() => SearchCondition.from({ regionCode: '  ' })).toThrow(InvalidValueError);
    });

    it('형식이 틀린 코드는 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: '123' })).toThrow(InvalidValueError);
    });
  });

  describe('시군구 vs 읍면동 구분 ★', () => {
    it('시군구를 고르면 그 아래 전체를 훑도록 접두어를 준다', () => {
      // "강남구"를 골랐는데 강남구라는 이름의 동만 찾으면 결과가 0건이 된다
      const cond = SearchCondition.from({ regionCode: 강남구 });
      expect(cond.sigunguPrefixes()).toEqual(['11680']);
      expect(cond.dongCodes()).toEqual([]);
    });

    it('읍면동을 고르면 그 동만 본다', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동 });
      expect(cond.dongCodes()).toEqual([역삼동]);
      expect(cond.sigunguPrefixes()).toEqual([]);
    });

    it('섞여 있어도 각각 분류한다', () => {
      const cond = SearchCondition.from({ regionCode: `${강남구},${역삼동}` });
      expect(cond.sigunguPrefixes()).toEqual(['11680']);
      expect(cond.dongCodes()).toEqual([역삼동]);
    });
  });

  describe('예산 범위', () => {
    it('하한과 상한을 받는다', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동, priceMin: 50_000, priceMax: 70_000 });
      expect(cond.priceRange.min?.toManwon()).toBe(50_000);
      expect(cond.priceRange.max?.toManwon()).toBe(70_000);
    });

    it('상한만 지정할 수 있다 (흔한 경우)', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000 });
      expect(cond.priceRange.min).toBeNull();
    });

    it('하한이 상한보다 크면 거부한다', () => {
      expect(() =>
        SearchCondition.from({ regionCode: 역삼동, priceMin: 70_000, priceMax: 50_000 }),
      ).toThrow(/예산/);
    });

    it('음수 예산은 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, priceMin: -1 })).toThrow(InvalidValueError);
    });

    it('숫자가 아니면 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, priceMax: NaN })).toThrow(InvalidValueError);
    });
  });

  describe('면적 범위', () => {
    it('전용면적 하한·상한을 받는다', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동, areaMin: 59, areaMax: 85 });
      expect(cond.areaRange.min?.toSqm()).toBe(59);
    });

    it('뒤집힌 범위는 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, areaMin: 85, areaMax: 59 })).toThrow(/면적/);
    });

    it('0 이하 면적은 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, areaMin: 0 })).toThrow(InvalidValueError);
    });
  });

  describe('연식·세대수', () => {
    it('사용승인 연도 하한을 받는다', () => {
      expect(SearchCondition.from({ regionCode: 역삼동, builtAfter: 2010 }).minBuiltYear).toBe(2010);
    });

    it('말이 안 되는 연도는 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, builtAfter: 1800 })).toThrow(/연도/);
      expect(() => SearchCondition.from({ regionCode: 역삼동, builtAfter: 3000 })).toThrow(/연도/);
    });

    it('최소 세대수를 받는다', () => {
      expect(SearchCondition.from({ regionCode: 역삼동, minHouseholds: 500 }).minHouseholds).toBe(500);
    });

    it('0세대는 조건 없음으로 본다', () => {
      expect(SearchCondition.from({ regionCode: 역삼동, minHouseholds: 0 }).minHouseholds).toBeNull();
    });

    it('음수 세대수는 거부한다', () => {
      expect(() => SearchCondition.from({ regionCode: 역삼동, minHouseholds: -1 })).toThrow(InvalidValueError);
    });
  });

  describe('페이지', () => {
    it('기본값', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동 });
      expect(cond.page).toBe(1);
      expect(cond.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });

    it(`상한(${MAX_PAGE_SIZE})을 넘기지 않는다`, () => {
      expect(SearchCondition.from({ regionCode: 역삼동, pageSize: 9999 }).pageSize).toBe(MAX_PAGE_SIZE);
    });

    it('0 이하 페이지는 1로 본다', () => {
      expect(SearchCondition.from({ regionCode: 역삼동, page: 0 }).page).toBe(1);
    });
  });

  describe('toCacheKey', () => {
    it('조건이 같으면 같은 키', () => {
      const a = SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000 });
      const b = SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000 });
      expect(a.toCacheKey()).toBe(b.toCacheKey());
    });

    it('지역 순서가 달라도 같은 키 (같은 검색이다)', () => {
      const a = SearchCondition.from({ regionCode: `${역삼동},1168010600` });
      const b = SearchCondition.from({ regionCode: `1168010600,${역삼동}` });
      expect(a.toCacheKey()).toBe(b.toCacheKey());
    });

    it('조건이 하나라도 다르면 다른 키', () => {
      const a = SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000 });
      const b = SearchCondition.from({ regionCode: 역삼동, priceMax: 80_000 });
      expect(a.toCacheKey()).not.toBe(b.toCacheKey());
    });
  });

  describe('toLogPayload — search_events 기록용', () => {
    it('조건을 평범한 객체로 낸다', () => {
      const cond = SearchCondition.from({ regionCode: 역삼동, priceMax: 70_000, minHouseholds: 500 });
      expect(cond.toLogPayload()).toMatchObject({
        regionCodes: [역삼동],
        priceMin: null,
        priceMax: 70_000,
        minHouseholds: 500,
      });
    });
  });
});
