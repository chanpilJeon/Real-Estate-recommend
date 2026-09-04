import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InjectLogger, type ILogger } from '../core';

import { JobRunRecorder } from './job-run-recorder';
import { LogStore } from './log-store';

/** 이 일수보다 오래된 로그는 지운다 (ToDo.md 9절: app_logs 비대화 방지) */
export const LOG_RETENTION_DAYS = 30;

@Injectable()
export class LogPurgeJob {
  constructor(
    private readonly logStore: LogStore,
    private readonly recorder: JobRunRecorder,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  /** 매일 새벽 4시 — 수집 배치(06:00)와 겹치지 않는 시간대 */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'log-purge' })
  async handleCron(): Promise<void> {
    try {
      await this.run();
    } catch {
      // 이미 JobRunRecorder 가 기록하고 로그를 남겼다. cron 이 죽지 않게 여기서 멈춘다.
    }
  }

  run(triggeredBy = 'cron'): Promise<number> {
    return this.recorder.run(
      'log-purge',
      async (ctx) => {
        const deleted = await this.logStore.purgeOlderThan(LOG_RETENTION_DAYS);
        ctx.addUpdated(deleted);
        this.logger.info('log-purge', `오래된 로그 ${deleted}건을 정리했습니다`);
        return deleted;
      },
      { triggeredBy, params: { retentionDays: LOG_RETENTION_DAYS } },
    );
  }
}
