import type { Coordinate } from '@apt/shared';

import type { RawComplexDetail, RawComplexInfo, RawPlace, RawRent, RawTrade } from './domain/raw-types';

/**
 * 외부 API 어댑터 추상 (ToDo.md 3.6).
 *
 * 상위 모듈은 이 인터페이스만 안다 — HTTP·XML·API 키는 external 밖으로 새지 않는다.
 * `AppConfig.demoMode === true` 면 DI 가 Fake 구현을 주입한다.
 */

/** 지하철역 / 학교 (카카오 카테고리 그룹 코드) */
export const CATEGORY_SUBWAY = 'SW8';
export const CATEGORY_SCHOOL = 'SC4';
export type PlaceCategory = typeof CATEGORY_SUBWAY | typeof CATEGORY_SCHOOL;

export interface IMolitClient {
  /** @param yearMonth 'YYYYMM' */
  fetchTrades(sigunguCode: string, yearMonth: string): Promise<RawTrade[]>;
  fetchRents(sigunguCode: string, yearMonth: string): Promise<RawRent[]>;
}
export const MOLIT_CLIENT = Symbol('IMolitClient');

export interface IComplexInfoClient {
  fetchComplexList(sigunguCode: string): Promise<RawComplexInfo[]>;
  fetchComplexDetail(kaptCode: string): Promise<RawComplexDetail | null>;
}
export const COMPLEX_INFO_CLIENT = Symbol('IComplexInfoClient');

export interface IGeocodeClient {
  addressToCoordinate(address: string): Promise<Coordinate | null>;
  searchPlaces(category: PlaceCategory, center: Coordinate, radiusM: number): Promise<RawPlace[]>;
}
export const GEOCODE_CLIENT = Symbol('IGeocodeClient');
