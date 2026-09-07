import { Coordinate, RegionCode } from '@apt/shared';
import type { Prisma } from '@prisma/client';

import { Complex } from './domain/complex';

export type ComplexRow = Prisma.ComplexGetPayload<Record<string, never>>;

/**
 * Prisma 행 → 도메인 모델.
 *
 * 별도 파일로 뺀 이유: 검색 모듈(L4)도 단지를 직접 조회하는데
 * (ToDo.md 3.12 "단지 + 중위가 조인 쿼리"), 변환 규칙이 두 벌이 되면
 * 한쪽만 고쳐지는 사고가 난다.
 */
export function toComplexDomain(row: ComplexRow): Complex {
  return new Complex({
    id: row.id,
    kaptCode: row.kaptCode,
    name: row.name,
    nameNormalized: row.nameNormalized,
    regionCode: RegionCode.parse(row.regionCode),
    address: row.address,
    coordinate:
      row.lat === null || row.lng === null ? null : new Coordinate(Number(row.lat), Number(row.lng)),
    households: row.households,
    buildingCount: row.buildingCount,
    approvalDate: row.approvalDate,
    builtYear: row.builtYear,
    parkingCount: row.parkingCount,
    heatingType: row.heatingType,
    nearestSubwayM: row.nearestSubwayM,
    nearestSchoolM: row.nearestSchoolM,
  });
}
