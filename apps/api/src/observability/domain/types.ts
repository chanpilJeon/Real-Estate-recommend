/** observability 모듈이 주고받는 자료형 (ToDo.md 3.4) */

export type LogLevel = 'info' | 'warn' | 'error';
export type JobStatus = 'running' | 'success' | 'failed';

/** DB 에 적재되기 전의 로그 한 건 */
export interface AppLogEntry {
  level: LogLevel;
  context: string;
  message: string;
  /** 같은 종류의 오류를 묶기 위한 해시 (대시보드 "에러 Top" 용) */
  messageKey: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

/** DB 에서 읽어온 로그 한 건 */
export interface AppLogRecord extends AppLogEntry {
  /** BigInt 는 JSON 으로 못 내보내므로 문자열로 다룬다 */
  id: string;
}

export interface LogFilter {
  level?: LogLevel;
  context?: string;
  /** 메시지 부분 검색 */
  q?: string;
  page?: number;
  pageSize?: number;
}

/** 같은 메시지끼리 묶은 오류 그룹 */
export interface ErrorGroup {
  messageKey: string;
  context: string;
  /** 대표 메시지 (가장 최근 것) */
  sample: string;
  count: number;
  lastSeenAt: Date;
}

export interface JobRunSummary {
  id: number;
  jobName: string;
  status: JobStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage: string | null;
  triggeredBy: string;
}

/** 대시보드 "핵심 지표" 중 데이터 쪽 (ToDo.md 8절) */
export interface DataMetrics {
  regionCount: number;
  complexCount: number;
  tradeCount: number;
  rentCount: number;
  /** 가장 최근 실거래 계약일 — 수집이 멈췄는지 판단하는 핵심 지표 */
  latestContractDate: Date | null;
  /** 오늘 기준 며칠 전 데이터인지. 3일 이상이면 수집 장애 의심 */
  freshnessDays: number | null;
  /** 아직 사람이 보정하지 않은 단지명 매칭 실패 건수 */
  unresolvedMatchFailures: number;
}

/** 대시보드 "핵심 지표" 중 서비스 쪽 */
export interface ServiceMetrics {
  days: number;
  searchCount: number;
  popularRegions: { regionCode: string; count: number }[];
}
