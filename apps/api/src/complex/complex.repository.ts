import type { RegionCode } from '@apt/shared';

import type { Complex } from './domain/complex';

/** 수집기가 넘기는 단지 upsert 입력 */
export interface ComplexUpsertInput {
  kaptCode: string | null;
  name: string;
  regionCode: string;
  address: string;
  lat: number | null;
  lng: number | null;
  households: number;
  buildingCount: number;
  approvalDate: Date | null;
  builtYear: number | null;
  parkingCount: number;
  heatingType: string | null;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  /** 지역 코드가 regions 에 없거나, createMissing=false 인데 없던 단지라 건너뛴 건수 */
  skipped: number;
}

export interface UpsertOptions {
  /**
   * 없는 단지를 새로 만들지 여부. 기본 true.
   *
   * **어떤 단지가 존재하는가는 실거래가 정한다.** K-apt(공동주택 정보)는 보강만 한다 —
   * false 로 부르면 이미 있는 단지에만 정보를 덧씌우고, 거래가 한 건도 없는 단지는
   * 만들지 않는다. 두 API 가 같은 단지를 다른 이름으로 부르기 때문에
   * (예: 실거래 '한보미도맨션2' ↔ K-apt '대치미도맨션'), 양쪽 다 만들면
   * 같은 아파트가 목록에 두 번 나온다.
   */
  createMissing?: boolean;
}

/** 단지 저장소 추상 (ToDo.md 3.7). Prisma 구현은 배럴에서 내보내지 않는다. */
export interface IComplexRepository {
  findById(id: number): Promise<Complex | null>;
  findByRegion(code: RegionCode): Promise<Complex[]>;
  findByRegionPrefix(sigunguCode: string): Promise<Complex[]>;
  upsertMany(items: ComplexUpsertInput[], options?: UpsertOptions): Promise<UpsertResult>;
  updateNearestPoi(id: number, subwayM: number | null, schoolM: number | null): Promise<void>;
  countAll(): Promise<number>;
}
export const COMPLEX_REPOSITORY = Symbol('IComplexRepository');
