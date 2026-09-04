import { Coordinate, RegionCode } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import type { ComplexUpsertInput, IComplexRepository, UpsertResult } from './complex.repository';
import { ComplexService } from './complex.service';
import { Complex, type ComplexProps } from './domain/complex';

const NOW = new Date('2026-09-04T00:00:00Z');

function makeComplex(overrides: Partial<ComplexProps> = {}): Complex {
  return new Complex({
    id: 7,
    kaptCode: 'A0001',
    name: '래미안역삼',
    nameNormalized: '래미안역삼',
    regionCode: RegionCode.parse('1168010100'),
    address: '서울특별시 강남구 역삼동 736-1',
    coordinate: new Coordinate(37.4998, 127.0374),
    households: 1284,
    buildingCount: 12,
    approvalDate: new Date('2005-11-30T00:00:00Z'),
    builtYear: 2005,
    parkingCount: 1650,
    heatingType: '지역난방',
    nearestSubwayM: 125,
    nearestSchoolM: 330,
    ...overrides,
  });
}

class FakeRepo implements IComplexRepository {
  constructor(private readonly complex: Complex | null) {}
  findById(): Promise<Complex | null> {
    return Promise.resolve(this.complex);
  }
  findByRegion(): Promise<Complex[]> {
    return Promise.resolve(this.complex === null ? [] : [this.complex]);
  }
  findByRegionPrefix(): Promise<Complex[]> {
    return Promise.resolve([]);
  }
  upsertMany(_items: ComplexUpsertInput[]): Promise<UpsertResult> {
    return Promise.resolve({ inserted: 0, updated: 0, skipped: 0 });
  }
  updateNearestPoi(): Promise<void> {
    return Promise.resolve();
  }
  countAll(): Promise<number> {
    return Promise.resolve(0);
  }
}

const service = (complex: Complex | null): ComplexService =>
  new ComplexService(new FakeRepo(complex), () => NOW);

describe('ComplexService — 단지 조회', () => {
  it('없는 단지는 null', async () => {
    expect(await service(null).findById(1)).toBeNull();
  });

  describe('toDetailDto — 도메인 → API 응답', () => {
    it('도메인이 계산한 값을 그대로 싣는다 (서비스가 규칙을 복제하지 않는다)', async () => {
      const complex = makeComplex();
      const dto = await service(complex).findById(7);

      expect(dto?.ageYears).toBe(complex.ageYears(NOW));
      expect(dto?.qualityScore).toBe(complex.qualityScore(NOW));
      expect(dto?.qualityReasons).toEqual(complex.qualityReasons(NOW));
      expect(dto?.isLargeScale).toBe(complex.isLargeScale());
    });

    it('좌표를 lat/lng 로 펼친다', async () => {
      const dto = await service(makeComplex()).findById(7);
      expect(dto?.lat).toBe(37.4998);
      expect(dto?.lng).toBe(127.0374);
    });

    it('좌표가 없으면 lat/lng 가 null (지오코딩 실패 단지)', async () => {
      const dto = await service(makeComplex({ coordinate: null })).findById(7);
      expect(dto?.lat).toBeNull();
      expect(dto?.lng).toBeNull();
    });

    it('사용승인일을 YYYY-MM-DD 로 내보낸다', async () => {
      expect((await service(makeComplex()).findById(7))?.approvalDate).toBe('2005-11-30');
    });

    it('세대당 주차는 소수점 2자리로 반올림한다', async () => {
      const dto = await service(makeComplex({ households: 1284, parkingCount: 1650 })).findById(7);
      expect(dto?.parkingPerHousehold).toBe(1.29);
    });

    it('세대수를 모르면 세대당 주차는 null (0으로 나누지 않는다)', async () => {
      expect((await service(makeComplex({ households: 0 })).findById(7))?.parkingPerHousehold).toBeNull();
    });

    it('중위가는 항상 null 이다 — 가격 집계는 trade 모듈만 한다 (ToDo.md 3.8)', async () => {
      expect((await service(makeComplex()).findById(7))?.medianPriceManwon).toBeNull();
    });
  });
});
