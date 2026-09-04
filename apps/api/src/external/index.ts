/**
 * external 모듈 공개 API (ToDo.md 2.1-5, 3.6).
 *
 * HTTP 클라이언트·XML 파서·API 키는 내보내지 않는다.
 * 상위 모듈은 인터페이스와 정규화된 타입만 안다 —
 * 그래서 API 스펙이 바뀌어도 이 모듈만 고치면 된다.
 */
export { ExternalModule } from './external.module';
export {
  CATEGORY_SCHOOL,
  CATEGORY_SUBWAY,
  COMPLEX_INFO_CLIENT,
  GEOCODE_CLIENT,
  MOLIT_CLIENT,
  type IComplexInfoClient,
  type IGeocodeClient,
  type IMolitClient,
  type PlaceCategory,
} from './ports';
export type {
  RawComplexDetail,
  RawComplexInfo,
  RawPlace,
  RawRent,
  RawTrade,
} from './domain/raw-types';
export { MolitApiError } from './domain/molit-parser';
export { KakaoApiError } from './domain/kakao-parser';
export { SAMPLE_COMPLEXES, SAMPLE_PLACES, SAMPLE_SIGUNGU_CODES } from './fake/sample-data';
