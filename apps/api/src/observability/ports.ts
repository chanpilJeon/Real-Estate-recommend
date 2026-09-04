import type { PaginatedDto } from '@apt/shared';

import type {
  AppLogEntry,
  AppLogRecord,
  DataMetrics,
  ErrorGroup,
  JobRunSummary,
  LogFilter,
  ServiceMetrics,
} from './domain/types';

/**
 * observability 가 의존하는 저장소 추상 (ToDo.md 2.1-2 의존성 역전).
 * 구현(Prisma)은 모듈 배럴에서 내보내지 않는다.
 */

export interface IJobRunStore {
  start(input: {
    jobName: string;
    triggeredBy: string;
    params?: Record<string, unknown>;
  }): Promise<number>;
  finish(
    id: number,
    input: {
      status: 'success' | 'failed';
      rowsInserted: number;
      rowsUpdated: number;
      errorMessage?: string;
    },
  ): Promise<void>;
  history(limit: number, jobName?: string): Promise<JobRunSummary[]>;
  lastRun(jobName: string): Promise<JobRunSummary | null>;
}
export const JOB_RUN_STORE = Symbol('IJobRunStore');

export interface IAppLogStore {
  insertMany(entries: AppLogEntry[]): Promise<number>;
  query(filter: LogFilter): Promise<PaginatedDto<AppLogRecord>>;
  groupedErrors(since: Date, limit: number): Promise<ErrorGroup[]>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
export const APP_LOG_STORE = Symbol('IAppLogStore');

export interface IQuotaStore {
  increment(provider: string, date: Date, count: number, dailyLimit: number): Promise<void>;
  find(provider: string, date: Date): Promise<{ used: number; dailyLimit: number } | null>;
}
export const QUOTA_STORE = Symbol('IQuotaStore');

export interface IMetricsStore {
  dataMetrics(now: Date): Promise<DataMetrics>;
  serviceMetrics(days: number, now: Date): Promise<ServiceMetrics>;
}
export const METRICS_STORE = Symbol('IMetricsStore');
