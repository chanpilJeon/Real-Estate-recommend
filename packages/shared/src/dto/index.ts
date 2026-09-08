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
  breakdown: { price: number; liquidity: number; location: number; quality: number };
  missingData: string[];
  /** "예산 대비 상위 15%", "역 도보 7분" 같은 문장 */
  reasons: string[];
}

/** 지역 검색 결과 한 건 (ToDo.md 3.3) */
export interface RegionCandidateDto {
  /** 법정동코드 10자리 */
  code: string;
  /** 국토부 실거래가 API 조회키 (앞 5자리) */
  sigunguCode: string;
  /** "경기도 수원시 영통구 영통동" */
  fullName: string;
  level: 'sido' | 'sigungu' | 'dong';
  /**
   * exact  = 이름이 정확히 일치 ("역삼동")
   * alias  = 생활권 별칭으로 찾음 ("미사" → 하남시 망월동 등)
   * partial = 이름 일부가 일치 ("강남" → 강남구)
   */
  matchType: 'exact' | 'alias' | 'partial';
}

/** 단지 상세 (GET /complexes/:id) */
export interface ComplexDetailDto extends ComplexSummaryDto {
  kaptCode: string | null;
  buildingCount: number;
  parkingCount: number;
  /** 세대당 주차 대수. 세대수를 모르면 null */
  parkingPerHousehold: number | null;
  heatingType: string | null;
  approvalDate: string | null;
  /** 연식(년). 사용승인일·건축년도가 모두 없으면 null */
  ageYears: number | null;
  /** 단지 품질 점수 0~1 (세대수·연식·주차) */
  qualityScore: number;
  /** "1,284세대 대단지" 같은 사람이 읽는 근거 */
  qualityReasons: string[];
  isLargeScale: boolean;
}
