import type { PaginatedDto } from '@apt/shared';

/** 매칭 후보로 쓰는 최소 정보 — 단지 전체를 들고 오지 않는다 */
export interface CandidateComplex {
  id: number;
  name: string;
  nameNormalized: string;
  regionCode: string;
  builtYear: number | null;
}

export interface MatchFailureRecord {
  id: number;
  regionCode: string;
  rawName: string;
  builtYear: number | null;
  occurrences: number;
  candidates: { complexId: number; name: string; score: number }[];
  createdAt: Date;
}

export interface RecordFailureInput {
  regionCode: string;
  rawName: string;
  builtYear: number | null;
  candidates: { complexId: number; name: string; score: number }[];
}

/**
 * 매칭 전용 저장소 (수동 보정 사전 + 실패 기록).
 *
 * 단지 후보 조회는 여기에 두지 않고 complex 모듈의 저장소를 쓴다 —
 * 단지 마스터의 소유자는 complex 이고, 조회 규칙이 두 곳에 갈라지면 안 된다.
 */
export interface IMatchRepository {
  /** 관리자가 손으로 이어붙인 사전. 있으면 무조건 이걸 따른다 */
  findOverride(regionCode: string, rawName: string): Promise<number | null>;
  saveOverride(regionCode: string, rawName: string, complexId: number): Promise<void>;

  /** 같은 실패가 반복되면 건수만 올린다 */
  recordFailure(input: RecordFailureInput): Promise<void>;
  listPendingFailures(page: number, pageSize: number): Promise<PaginatedDto<MatchFailureRecord>>;
  findFailure(id: number): Promise<MatchFailureRecord | null>;
  markResolved(id: number, complexId: number): Promise<void>;
  /**
   * 더 이상 남아 있지 않은 실패 기록을 닫는다.
   *
   * 실패는 "그때 못 붙였다"는 기록이라, 나중에 다른 경로로 거래가 붙어도 그대로 남는다.
   * 그러면 대시보드가 **이미 끝난 일을 할 일로 보여준다.** 사람을 헛되이 부르지 않도록,
   * 그 이름의 미매칭 거래가 하나도 없으면 자동으로 닫는다.
   *
   * @returns 닫은 건수
   */
  closeAlreadyMatched(): Promise<number>;
  countPending(): Promise<number>;
}
export const MATCH_REPOSITORY = Symbol('IMatchRepository');
