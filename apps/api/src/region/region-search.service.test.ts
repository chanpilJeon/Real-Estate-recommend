import { RegionCode } from '@apt/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { Region } from './domain/region';
import { RegionSearchService } from './region-search.service';
import type { IRegionRepository } from './region.repository';

const r = (code: string, sido: string, sigungu: string, dong: string | null): Region =>
  new Region(RegionCode.parse(code), sido, sigungu, dong);

/** 실제 적재된 데이터에서 뽑은 표본 (2026-09-04 법정동코드 기준) */
const 강남구 = r('1168000000', '서울특별시', '강남구', null);
const 역삼동 = r('1168010100', '서울특별시', '강남구', '역삼동');
const 대치동 = r('1168010600', '서울특별시', '강남구', '대치동');
const 수원영통구 = r('4111700000', '경기도', '수원시 영통구', null);
const 영통동 = r('4111710500', '경기도', '수원시 영통구', '영통동');
// "신정동"은 전국 5곳에 실제로 존재한다
const 마포신정동 = r('1144011700', '서울특별시', '마포구', '신정동');
const 양천신정동 = r('1147010100', '서울특별시', '양천구', '신정동');
const 울산신정동 = r('3114010400', '울산광역시', '남구', '신정동');
// 생활권 별칭 "미사" → 하남시 일대
const 망월동 = r('4145010900', '경기도', '하남시', '망월동');
const 풍산동 = r('4145011000', '경기도', '하남시', '풍산동');

/** DB 없이 도는 가짜 저장소 — 이름 부분일치와 별칭 조회만 흉내낸다 */
class FakeRegionRepository implements IRegionRepository {
  constructor(
    private readonly regions: Region[] = [],
    private readonly aliases: Record<string, Region[]> = {},
  ) {}

  findByCode(code: RegionCode): Promise<Region | null> {
    return Promise.resolve(this.regions.find((x) => x.code.toString() === code.toString()) ?? null);
  }

  searchByKeyword(keyword: string, limit: number): Promise<Region[]> {
    const hit = this.regions.filter(
      (x) =>
        x.sido.includes(keyword) || x.sigungu.includes(keyword) || (x.dong ?? '').includes(keyword),
    );
    return Promise.resolve(hit.slice(0, limit));
  }

  findByAlias(alias: string): Promise<Region[]> {
    return Promise.resolve(this.aliases[alias] ?? []);
  }
}

describe('RegionSearchService — 지역 검색', () => {
  let service: RegionSearchService;

  beforeEach(() => {
    service = new RegionSearchService(
      new FakeRegionRepository(
        [강남구, 역삼동, 대치동, 수원영통구, 영통동, 마포신정동, 양천신정동, 울산신정동, 망월동, 풍산동],
        { 미사: [망월동, 풍산동], 대치: [대치동] },
      ),
    );
  });

  describe('동음이의 — 하나로 좁히지 않고 후보를 모두 준다', () => {
    it('"신정동"은 5곳 중 표본 3곳을 모두 돌려준다', async () => {
      const found = await service.search('신정동');
      expect(found).toHaveLength(3);
      expect(found.map((c) => c.fullName)).toEqual([
        '서울특별시 마포구 신정동',
        '서울특별시 양천구 신정동',
        '울산광역시 남구 신정동',
      ]);
    });

    it('"신정동"은 이름이 정확히 같으므로 모두 exact 로 표시한다', async () => {
      const found = await service.search('신정동');
      expect(found.every((c) => c.matchType === 'exact')).toBe(true);
    });

    it('"영통"은 시군구(수원시 영통구)와 동(영통동)을 함께 돌려준다', async () => {
      const found = await service.search('영통');
      expect(found.map((c) => c.fullName)).toEqual([
        '경기도 수원시 영통구',
        '경기도 수원시 영통구 영통동',
      ]);
    });
  });

  describe('정렬 — 넓은 단위를 먼저, 정확한 일치를 위로', () => {
    it('"강남" 검색 시 강남구가 그 아래 동들보다 먼저 나온다', async () => {
      const found = await service.search('강남');
      expect(found[0]?.fullName).toBe('서울특별시 강남구');
    });

    it('부분일치는 partial 로 표시한다', async () => {
      const found = await service.search('강남');
      expect(found.every((c) => c.matchType === 'partial')).toBe(true);
    });

    it('정확히 일치하는 지역이 부분일치보다 위에 온다', async () => {
      // "대치동"은 대치동에 exact, 다른 곳엔 안 걸린다
      const found = await service.search('대치동');
      expect(found[0]?.matchType).toBe('exact');
    });
  });

  describe('생활권 별칭', () => {
    it('"미사"는 행정구역명이 아니지만 하남시 일대를 찾아준다', async () => {
      const found = await service.search('미사');
      expect(found.map((c) => c.fullName)).toEqual(['경기도 하남시 망월동', '경기도 하남시 풍산동']);
      expect(found.every((c) => c.matchType === 'alias')).toBe(true);
    });

    it('resolveAlias 는 법정동 코드만 돌려준다', async () => {
      const codes = await service.resolveAlias('미사');
      expect(codes.map((c) => c.toString())).toEqual(['4145010900', '4145011000']);
    });

    it('별칭과 실제 지역명이 겹치면 exact 를 우선한다', async () => {
      // "대치"는 별칭에도 있고 대치동 이름에도 부분일치한다
      const found = await service.search('대치');
      const 대치 = found.find((c) => c.code === '1168010600');
      expect(대치?.matchType).toBe('alias'); // 이름 '대치동' 과 정확히 같지는 않으므로
    });

    it('없는 별칭은 빈 배열', async () => {
      expect(await service.resolveAlias('없는별칭')).toEqual([]);
    });
  });

  describe('입력 처리', () => {
    it('앞뒤 공백을 다듬는다', async () => {
      expect(await service.search('  역삼동  ')).toHaveLength(1);
    });

    it.each(['', '   '])('빈 검색어("%s")는 빈 배열', async (keyword) => {
      expect(await service.search(keyword)).toEqual([]);
    });

    it('limit 으로 결과 수를 제한한다', async () => {
      expect(await service.search('신정동', 2)).toHaveLength(2);
    });

    it('limit 상한(50)을 넘겨도 터지지 않는다', async () => {
      await expect(service.search('신정동', 9999)).resolves.toBeDefined();
    });
  });

  describe('응답에 담기는 값', () => {
    it('국토부 API 조회키(시군구코드)를 함께 준다', async () => {
      const [found] = await service.search('역삼동');
      expect(found?.code).toBe('1168010100');
      expect(found?.sigunguCode).toBe('11680'); // 수집 배치가 이 값으로 API 를 호출한다
      expect(found?.level).toBe('dong');
    });
  });
});
