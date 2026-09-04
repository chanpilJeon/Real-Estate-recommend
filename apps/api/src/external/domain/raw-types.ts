import type { Coordinate } from '@apt/shared';

/**
 * 외부 API 응답을 **정규화한** 자료형 (ToDo.md 3.6).
 *
 * 여기서 XML·원본 필드명·인코딩 문제가 끝난다. 상위 모듈은 이 타입만 본다.
 * 그래서 API 스펙이 바뀌어도 external 모듈만 고치면 된다.
 */

/** 아파트 매매 실거래 한 건 */
export interface RawTrade {
  /** 시군구코드 5자리 */
  sigunguCode: string;
  /** 법정동명 ("역삼동") — 코드가 아니라 이름으로 온다 */
  legalDongName: string;
  /** API 가 주는 단지명. 표기가 흔들려서 matching 모듈이 정제한다 */
  apartmentName: string;
  exclusiveSqm: number;
  /** 거래금액 (만원) */
  priceManwon: number;
  contractedAt: Date;
  floor: number;
  builtYear: number | null;
  /** 해제(취소)된 거래인가 — 목록에 섞이면 안 된다 (ToDo.md 7.3) */
  isCanceled: boolean;
  jibun: string;
}

/** 아파트 전월세 실거래 한 건 (전세가율 계산용) */
export interface RawRent {
  sigunguCode: string;
  legalDongName: string;
  apartmentName: string;
  exclusiveSqm: number;
  /** 보증금 (만원) */
  depositManwon: number;
  /** 월세 (만원). 0이면 전세 */
  monthlyManwon: number;
  contractedAt: Date;
  floor: number;
  builtYear: number | null;
  jibun: string;
}

/** 공동주택 단지 목록 한 건 */
export interface RawComplexInfo {
  kaptCode: string;
  name: string;
  sido: string;
  sigungu: string;
  dong: string;
}

/** 공동주택 단지 상세 */
export interface RawComplexDetail {
  kaptCode: string;
  name: string;
  address: string;
  households: number;
  buildingCount: number;
  /** 사용승인일 */
  approvalDate: Date | null;
  parkingCount: number;
  heatingType: string | null;
}

/** 카카오 로컬에서 찾은 장소 (지하철역·학교) */
export interface RawPlace {
  name: string;
  /** 'SW8' = 지하철역, 'SC4' = 학교 */
  categoryCode: string;
  coordinate: Coordinate;
  extra?: Record<string, unknown>;
}
