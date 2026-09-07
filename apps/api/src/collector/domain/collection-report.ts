/** 수집 결과 보고 (ToDo.md 3.11) */
export interface CollectionReport {
  /** job_runs 레코드 id. 기록에 실패했으면 null */
  jobRunId: number | null;
  regionsProcessed: number;
  /** 처리 중 실패해 건너뛴 지역 수 */
  regionsFailed: number;
  monthsProcessed: number;
  complexesInserted: number;
  complexesUpdated: number;
  tradesInserted: number;
  tradesSkipped: number;
  rentsInserted: number;
  rentsSkipped: number;
  /** 단지에 이어붙이지 못한 거래 수 */
  unmatchedTrades: number;
  /** 새로 쌓인 매칭 실패 종류 수 */
  matchFailures: number;
  errors: string[];
  durationMs: number;
}

export function emptyReport(): CollectionReport {
  return {
    jobRunId: null,
    regionsProcessed: 0,
    regionsFailed: 0,
    monthsProcessed: 0,
    complexesInserted: 0,
    complexesUpdated: 0,
    tradesInserted: 0,
    tradesSkipped: 0,
    rentsInserted: 0,
    rentsSkipped: 0,
    unmatchedTrades: 0,
    matchFailures: 0,
    errors: [],
    durationMs: 0,
  };
}
