import type { Complex } from '../complex';

import type { SearchCondition } from './domain/search-condition';

/**
 * 검색 저장소 추상 (ToDo.md 3.12).
 *
 * **가격 조건은 여기서 다루지 않는다.** 중위가는 trade 모듈이 계산하고,
 * 검색 서비스가 그 값으로 거른다. 가격 집계 SQL 이 두 곳에 생기면 안 된다 (3.8).
 */
/** 실제로 데이터가 쌓인 지역 */
export interface CollectedRegion {
  sigunguCode: string;
  name: string;
  complexCount: number;
  tradeCount: number;
  /** 그 지역 대표 법정동코드 (검색 링크에 쓴다) */
  regionCode: string;
}

export interface ISearchRepository {
  /** 단지 속성(지역·연식·세대수)과 면적 보유 여부로 1차 필터 */
  findCandidates(condition: SearchCondition): Promise<Complex[]>;
  /**
   * 단지가 하나라도 수집된 지역 목록.
   *
   * 데이터가 없는 지역을 검색하면 "조건에 맞는 단지가 없습니다"만 나와서
   * 조건이 까다로운 건지 데이터가 없는 건지 구분이 안 된다. 그걸 알려주기 위한 것.
   */
  collectedRegions(): Promise<CollectedRegion[]>;
}
export const SEARCH_REPOSITORY = Symbol('ISearchRepository');

/**
 * 검색 이력 기록.
 * `search_events` 는 observability 의 MetricsService 가 **읽고**,
 * 쓰는 쪽은 검색을 실제로 수행하는 이 모듈이다.
 */
export interface ISearchEventStore {
  record(regionCode: string, conditions: Record<string, unknown>, resultCount: number): Promise<void>;
}
export const SEARCH_EVENT_STORE = Symbol('ISearchEventStore');
