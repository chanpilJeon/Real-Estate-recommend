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
  countPending(): Promise<number>;
}
export const MATCH_REPOSITORY = Symbol('IMatchRepository');
