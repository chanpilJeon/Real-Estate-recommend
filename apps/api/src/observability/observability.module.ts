import { Global, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { LOGGER, type ILogger } from '../core';

import { ApiQuotaTracker } from './api-quota-tracker';
import { JobRunRecorder } from './job-run-recorder';
import { LogPurgeJob } from './log-purge.job';
import { LogStore } from './log-store';
import { MetricsService } from './metrics.service';
import {
  APP_LOG_STORE,
  JOB_RUN_STORE,
  METRICS_STORE,
  QUOTA_STORE,
  type IAppLogStore,
  type IJobRunStore,
  type IMetricsStore,
  type IQuotaStore,
} from './ports';
import { PrismaAppLogStore } from './prisma/prisma-app-log.store';
import { PrismaJobRunStore } from './prisma/prisma-job-run.store';
import { PrismaMetricsStore } from './prisma/prisma-metrics.store';
import { PrismaQuotaStore } from './prisma/prisma-quota.store';

/**
 * 관측 모듈 (계층 L1).
 *
 * `@Global()` 인 이유: 배치를 가진 모든 모듈(collector 등)이 JobRunRecorder 를 써야 한다.
 * 계층 규칙상 상위가 하위를 참조하는 방향이므로 위반이 아니다.
 *
 * 서비스들은 데코레이터 없는 평범한 클래스라 useFactory 로 조립한다 —
 * 테스트에서 가짜 저장소를 넣어 바로 만들 수 있게 하기 위함.
 */
@Global()
@Module({
  providers: [
    PrismaJobRunStore,
    PrismaAppLogStore,
    PrismaQuotaStore,
    PrismaMetricsStore,
    { provide: JOB_RUN_STORE, useExisting: PrismaJobRunStore },
    { provide: APP_LOG_STORE, useExisting: PrismaAppLogStore },
    { provide: QUOTA_STORE, useExisting: PrismaQuotaStore },
    { provide: METRICS_STORE, useExisting: PrismaMetricsStore },
    {
      provide: JobRunRecorder,
      useFactory: (store: IJobRunStore, logger: ILogger) => new JobRunRecorder(store, logger),
      inject: [JOB_RUN_STORE, LOGGER],
    },
    {
      provide: LogStore,
      useFactory: (store: IAppLogStore, logger: ILogger) => new LogStore(store, logger),
      inject: [APP_LOG_STORE, LOGGER],
    },
    {
      provide: ApiQuotaTracker,
      useFactory: (store: IQuotaStore) => new ApiQuotaTracker(store),
      inject: [QUOTA_STORE],
    },
    {
      provide: MetricsService,
      useFactory: (store: IMetricsStore) => new MetricsService(store),
      inject: [METRICS_STORE],
    },
    LogPurgeJob,
  ],
  exports: [JobRunRecorder, LogStore, ApiQuotaTracker, MetricsService, LogPurgeJob],
})
export class ObservabilityModule implements OnModuleInit, OnApplicationShutdown {
  constructor(private readonly logStore: LogStore) {}

  onModuleInit(): void {
    this.logStore.start();
  }

  /** 종료 시 버퍼에 남은 로그를 마저 저장한다 */
  async onApplicationShutdown(): Promise<void> {
    await this.logStore.stop();
  }
}
