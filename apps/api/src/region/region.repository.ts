import type { RegionCode } from '@apt/shared';

import type { Region } from './domain/region';

/**
 * 지역 저장소 추상 (ToDo.md 3.3).
 *
 * 서비스는 이 인터페이스에만 의존한다 — Prisma 구현은 외부에 노출하지 않는다.
 *
 * ※ 명세의 `findAliases(keyword): RegionAlias[]` 대신 `findByAlias(): Region[]` 로 둔다.
 *   별칭 레코드를 받아 다시 지역을 조회하면 N+1 질의가 되기 때문이다.
 *   외부에 드러나는 서비스 API(`search`/`resolveAlias`)는 명세 그대로다.
 */
export interface IRegionRepository {
  findByCode(code: RegionCode): Promise<Region | null>;
  /** 시도·시군구·동 이름에 keyword 가 포함된 지역 (폐지된 지역 제외) */
  searchByKeyword(keyword: string, limit: number): Promise<Region[]>;
  /** 생활권 별칭("미사")에 연결된 지역들. 별칭은 정확히 일치할 때만 인정한다. */
  findByAlias(alias: string): Promise<Region[]>;
}

/** DI 토큰 — 인터페이스는 런타임에 존재하지 않는다. */
export const REGION_REPOSITORY = Symbol('IRegionRepository');
