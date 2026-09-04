import type { ComplexDetailDto, RegionCode } from '@apt/shared';

import type { IComplexRepository } from './complex.repository';
import type { Complex } from './domain/complex';

/**
 * 단지 조회 유스케이스 (계층 L2).
 * 컨트롤러는 저장소를 직접 알지 못한다 (ToDo.md 2.1-1).
 */
export class ComplexService {
  constructor(
    private readonly repository: IComplexRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findById(id: number): Promise<ComplexDetailDto | null> {
    const complex = await this.repository.findById(id);
    return complex === null ? null : this.toDetailDto(complex);
  }

  findByRegion(code: RegionCode): Promise<Complex[]> {
    return this.repository.findByRegion(code);
  }

  countAll(): Promise<number> {
    return this.repository.countAll();
  }

  /** 도메인 객체 → API 응답. 점수·연식 계산은 도메인에 맡기고 여기서 복제하지 않는다. */
  toDetailDto(complex: Complex): ComplexDetailDto {
    const asOf = this.now();
    const coordinate = complex.coordinate;

    return {
      id: complex.id,
      kaptCode: complex.kaptCode,
      name: complex.name,
      address: complex.address,
      regionCode: complex.regionCode.toString(),
      lat: coordinate?.lat ?? null,
      lng: coordinate?.lng ?? null,
      households: complex.households,
      buildingCount: complex.buildingCount,
      builtYear: complex.builtYear,
      approvalDate: complex.approvalDate?.toISOString().slice(0, 10) ?? null,
      parkingCount: complex.parkingCount,
      parkingPerHousehold: round2(complex.parkingPerHousehold()),
      heatingType: complex.heatingType,
      ageYears: complex.ageYears(asOf),
      qualityScore: complex.qualityScore(asOf),
      qualityReasons: complex.qualityReasons(asOf),
      isLargeScale: complex.isLargeScale(),
      nearestSubwayM: complex.nearestSubwayM,
      nearestSchoolM: complex.nearestSchoolM,
      // 중위가는 trade 모듈(4-C)이 채운다. 여기서 가격을 계산하지 않는다 —
      // 가격 집계는 trade 모듈 밖에 존재하면 안 된다 (ToDo.md 3.8 캡슐화)
      medianPriceManwon: null,
    };
  }
}

const round2 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;
