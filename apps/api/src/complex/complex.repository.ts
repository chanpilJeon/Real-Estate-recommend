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
  /** 지역 코드가 regions 에 없어 건너뛴 건수 */
  skipped: number;
}

/** 단지 저장소 추상 (ToDo.md 3.7). Prisma 구현은 배럴에서 내보내지 않는다. */
export interface IComplexRepository {
  findById(id: number): Promise<Complex | null>;
  findByRegion(code: RegionCode): Promise<Complex[]>;
  findByRegionPrefix(sigunguCode: string): Promise<Complex[]>;
  upsertMany(items: ComplexUpsertInput[]): Promise<UpsertResult>;
  updateNearestPoi(id: number, subwayM: number | null, schoolM: number | null): Promise<void>;
  countAll(): Promise<number>;
}
export const COMPLEX_REPOSITORY = Symbol('IComplexRepository');
