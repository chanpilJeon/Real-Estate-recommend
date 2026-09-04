/**
 * API 계약 (ToDo.md 3.1).
 *
 * web 과 api 가 **같은 파일**을 참조한다. 백엔드 응답 모양이 바뀌면
 * 프론트가 컴파일 단계에서 깨지게 만드는 것이 목적이다.
 *
 * 규칙: DTO 는 순수 데이터 모양만 담는다 (메서드·클래스 금지).
 *       금액은 만원, 면적은 m² 단위로 통일한다.
 */

/** 목록 응답 공통 형태 */
export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 검색 조건 — HTTP 쿼리스트링에서 파싱된다 */
export interface SearchConditionDto {
  regionCode: string;
  /** 예산 하한 (만원) */
  priceMin?: number;
  /** 예산 상한 (만원) */
  priceMax?: number;
  /** 전용면적 하한 (m²) */
  areaMin?: number;
  /** 전용면적 상한 (m²) */
  areaMax?: number;
  /** 사용승인 연도 하한 — 이 연도 이후 준공된 단지만 */
  builtAfter?: number;
  minHouseholds?: number;
}

/** 단지 목록 한 줄 */
export interface ComplexSummaryDto {
  id: number;
  name: string;
  address: string;
  regionCode: string;
  lat: number | null;
  lng: number | null;
  households: number;
  builtYear: number | null;
  /** 최근 6개월 이상치 제외 중위가 (만원). 거래가 없으면 null */
  medianPriceManwon: number | null;
  /** 배치에서 사전 계산된 최근접 거리 (m) */
  nearestSubwayM: number | null;
  nearestSchoolM: number | null;
}

/** 추천 결과 — 단지 정보 + 점수 + 사람이 읽는 근거 */
export interface RecommendationDto extends ComplexSummaryDto {
  /** 0~100 */
  score: number;
  /** "예산 대비 상위 15%", "역 도보 7분" 같은 문장 */
  reasons: string[];
}
