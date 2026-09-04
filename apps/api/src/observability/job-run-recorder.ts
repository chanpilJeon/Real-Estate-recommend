import type { ILogger } from '../core';

import { truncateMessage } from './domain/log-key';
import type { JobRunSummary } from './domain/types';
import type { IJobRunStore } from './ports';

const CTX = 'job-runner';

/** 배치 실행 중 건수를 쌓고 메모를 남기는 손잡이 */
export interface JobContext {
  addInserted(n: number): void;
  addUpdated(n: number): void;
  log(msg: string): void;
}

export interface JobRunOptions {
  /** 'cron' (자동) 또는 'admin' (관리자 수동 트리거) */
  triggeredBy?: string;
  params?: Record<string, unknown>;
}

/**
 * 배치 실행 이력 기록기 (ToDo.md 3.4).
 *
 * **모든 배치는 이 `run()` 으로 감싸야 한다.** 그래야 "언제 돌았고, 몇 건 넣었고,
 * 실패했는지"가 빠짐없이 남는다. 이 프로젝트에서 가장 큰 운영 리스크는
 * "수집이 조용히 실패한 걸 며칠 뒤에 아는 것"이기 때문이다. (ToDo.md 0절)
 */
export class JobRunRecorder {
  constructor(
    private readonly store: IJobRunStore,
    private readonly logger: ILogger,
  ) {}

  async run<T>(
    jobName: string,
    fn: (ctx: JobContext) => Promise<T>,
    options: JobRunOptions = {},
  ): Promise<T> {
    let inserted = 0;
    let updated = 0;

    const ctx: JobContext = {
      addInserted: (n) => {
        inserted += n;
      },
      addUpdated: (n) => {
        updated += n;
      },
      log: (msg) => this.logger.info(jobName, msg),
    };

    // 기록 자체가 실패해도 본 작업은 돌린다.
    // 기록용 DB 쓰기 때문에 수집이 통째로 멈추는 편이 더 나쁘다.
    // 다만 조용히 넘기지 않고 error 로 남긴다.
    let runId: number | null = null;
    try {
      runId = await this.store.start({
        jobName,
        triggeredBy: options.triggeredBy ?? 'cron',
        params: options.params,
      });
    } catch (err) {
      this.logger.error(CTX, `배치 '${jobName}' 실행 이력을 시작 기록하지 못했습니다`, toError(err));
    }

    const startedAt = Date.now();
    try {
      const result = await fn(ctx);
      await this.finish(runId, jobName, { status: 'success', inserted, updated });
      this.logger.info(
        CTX,
        `배치 '${jobName}' 성공 (${Date.now() - startedAt}ms, 추가 ${inserted}건 / 갱신 ${updated}건)`,
      );
      return result;
    } catch (err) {
      const error = toError(err);
      await this.finish(runId, jobName, {
        status: 'failed',
        inserted,
        updated,
        errorMessage: truncateMessage(error.stack ?? error.message),
      });
      this.logger.error(CTX, `배치 '${jobName}' 실패 (${Date.now() - startedAt}ms)`, error);
      throw err;
    }
  }

  history(limit = 20, jobName?: string): Promise<JobRunSummary[]> {
    return this.store.history(limit, jobName);
  }

  lastRun(jobName: string): Promise<JobRunSummary | null> {
    return this.store.lastRun(jobName);
  }

  private async finish(
    runId: number | null,
    jobName: string,
    input: {
      status: 'success' | 'failed';
      inserted: number;
      updated: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    if (runId === null) return;
    try {
      await this.store.finish(runId, {
        status: input.status,
        rowsInserted: input.inserted,
        rowsUpdated: input.updated,
        errorMessage: input.errorMessage,
      });
    } catch (err) {
      this.logger.error(CTX, `배치 '${jobName}' 종료 기록에 실패했습니다`, toError(err));
    }
  }
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));
