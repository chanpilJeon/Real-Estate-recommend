import { RegionCode, type RegionCandidateDto } from '@apt/shared';

import type { Region, RegionLevel } from './domain/region';
import type { IRegionRepository } from './region.repository';

/** 결과 정렬 우선순위 — 정확히 일치한 것을 맨 위로 */
const MATCH_PRIORITY: Record<RegionCandidateDto['matchType'], number> = {
  exact: 0,
  alias: 1,
  partial: 2,
};

/** 같은 우선순위 안에서는 넓은 행정단위를 먼저 (강남구 → 강남구 역삼동) */
const LEVEL_PRIORITY: Record<RegionLevel, number> = { sido: 0, sigungu: 1, dong: 2 };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** 순위를 매긴 뒤 잘라야 하므로 DB 에서는 넉넉히 가져온다 */
const FETCH_MULTIPLIER = 5;
const MAX_FETCH = 300;

/**
 * 지역 검색 (ToDo.md 3.3, 5.1).
 *
 * 프레임워크 데코레이터를 붙이지 않은 평범한 클래스다 —
 * 테스트에서 가짜 저장소를 넣어 `new` 로 바로 만들 수 있게 하기 위함이다.
 */
export class RegionSearchService {
  constructor(private readonly repository: IRegionRepository) {}

  /**
   * "영통" → [수원시 영통구, 영통동] 처럼 후보를 여러 개 돌려준다.
   *
   * 동음이의가 실제로 흔하다 — "신정동"은 전국 5곳에 있다.
   * 그래서 하나를 골라주지 않고 후보를 모두 주고 사용자가 고르게 한다.
   */
  async search(keyword: string, limit = DEFAULT_LIMIT): Promise<RegionCandidateDto[]> {
    const trimmed = keyword.trim();
    if (trimmed === '') return [];

    const take = Math.min(Math.max(1, limit), MAX_LIMIT);
    const [byName, byAlias] = await Promise.all([
      this.repository.searchByKeyword(trimmed, Math.min(take * FETCH_MULTIPLIER, MAX_FETCH)),
      this.repository.findByAlias(trimmed),
    ]);

    const candidates = new Map<string, RegionCandidateDto>();

    // 별칭을 먼저 넣고, 이름 일치가 있으면 그쪽으로 덮어쓴다.
    // 사용자가 실제 지역명을 입력한 경우 'exact' 로 보이는 편이 이해하기 쉽다.
    for (const region of byAlias) {
      candidates.set(region.code.toString(), toCandidate(region, 'alias'));
    }
    for (const region of byName) {
      const matchType = region.matchesExactly(trimmed) ? 'exact' : 'partial';
      const existing = candidates.get(region.code.toString());
      if (existing === undefined || MATCH_PRIORITY[matchType] < MATCH_PRIORITY[existing.matchType]) {
        candidates.set(region.code.toString(), toCandidate(region, matchType));
      }
    }

    return [...candidates.values()].sort(compareCandidates).slice(0, take);
  }

  /** 생활권 별칭 해석: "미사" → 하남시 망월동·풍산동·선동·덕풍동 */
  async resolveAlias(keyword: string): Promise<RegionCode[]> {
    const trimmed = keyword.trim();
    if (trimmed === '') return [];
    const regions = await this.repository.findByAlias(trimmed);
    return regions.map((r) => r.code);
  }

  async findByCode(code: string): Promise<Region | null> {
    return this.repository.findByCode(RegionCode.parse(code));
  }

  /**
   * 실거래 API 가 준 법정동 **이름**을 코드로 바꾼다 (수집기가 쓴다).
   * 못 찾으면 시군구 대표 행으로 대체한다 — 동을 모른다고 거래를 버리면 안 된다.
   */
  async resolveDongCode(sigunguCode: string, dongName: string): Promise<RegionCode | null> {
    const exact = await this.repository.findByDongName(sigunguCode, dongName.trim());
    if (exact !== null) return exact.code;

    const fallback = await this.repository.findSigunguRegion(sigunguCode);
    return fallback?.code ?? null;
  }
}

function toCandidate(region: Region, matchType: RegionCandidateDto['matchType']): RegionCandidateDto {
  return {
    code: region.code.toString(),
    sigunguCode: region.code.toSigunguCode(),
    fullName: region.fullName(),
    level: region.level(),
    matchType,
  };
}

function compareCandidates(a: RegionCandidateDto, b: RegionCandidateDto): number {
  const byMatch = MATCH_PRIORITY[a.matchType] - MATCH_PRIORITY[b.matchType];
  if (byMatch !== 0) return byMatch;

  const byLevel = LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level];
  if (byLevel !== 0) return byLevel;

  return a.code.localeCompare(b.code);
}
