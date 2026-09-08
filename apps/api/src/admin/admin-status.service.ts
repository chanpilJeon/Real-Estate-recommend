import { Injectable } from '@nestjs/common';

import { AdminAuthService } from '../admin-auth';
import { JOB_BACKFILL, JOB_DAILY } from '../collector';
import { AppConfig, PrismaService } from '../core';
import { MatchFailureService } from '../matching';
import { ApiQuotaTracker, JobRunRecorder, MetricsService } from '../observability';

import { judgeStatus, type ServiceStatus, type StatusSignals } from './domain/service-status';

/** 무거운 집계를 매 새로고침마다 다시 계산하지 않는다 (ToDo.md 8절: 5분 캐시) */
const METRICS_TTL_MS = 5 * 60 * 1000;

export interface AdminHealth extends ServiceStatus {
  /** 화면이 숫자를 따로 보여줄 수 있게 원자료도 함께 준다 */
  databaseLatencyMs: number;
  checkedAt: Date;
}

/**
 * 대시보드가 쓰는 상태·지표를 모은다 (ToDo.md 3.13, 8절).
 *
 * 판정 규칙은 여기 두지 않는다 — `domain/service-status.ts` 의 순수 함수가 정한다.
 * 이 클래스는 **신호를 모아서 넘기는 일만** 한다.
 */
@Injectable()
export class AdminStatusService {
  private metricsCache: { at: number; value: unknown } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly quota: ApiQuotaTracker,
    private readonly jobs: JobRunRecorder,
    private readonly matchFailures: MatchFailureService,
    private readonly auth: AdminAuthService,
    private readonly config: AppConfig,
  ) {}

  async health(adminId: number): Promise<AdminHealth> {
    const [db, data, quotas, daily, backfill, usingDefaultPassword] = await Promise.all([
      this.prisma.healthCheck(),
      this.metrics.dataMetrics(),
      this.quota.allUsage(),
      this.jobs.lastRun(JOB_DAILY),
      // 손으로 돌린 수집도 "마지막 수집"이다 — 자동 실행만 보면 방금 돌린 게 안 보인다
      this.jobs.lastRun(JOB_BACKFILL),
      this.auth.isUsingDefaultPassword(adminId),
    ]);

    const lastCollect = [daily, backfill]
      .filter((run): run is NonNullable<typeof run> => run !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

    const signals: StatusSignals = {
      databaseOk: db.ok,
      freshnessDays: data.freshnessDays,
      lastCollect:
        lastCollect === undefined
          ? null
          : { status: lastCollect.status, finishedAt: lastCollect.finishedAt },
      quotas: quotas.map((q) => ({
        provider: q.provider,
        used: q.used,
        limit: q.limit,
        ratio: q.ratio,
      })),
      unresolvedMatchFailures: data.unresolvedMatchFailures,
      usingDefaultPassword,
      hasCollectRegions: this.config.collectSigunguCodes.length > 0,
    };

    return {
      ...judgeStatus(signals),
      databaseLatencyMs: db.latencyMs,
      checkedAt: new Date(),
    };
  }

  /** 핵심 지표. 무거워서 5분 동안 재사용한다 */
  async metricsSummary(): Promise<unknown> {
    const cached = this.metricsCache;
    if (cached !== null && Date.now() - cached.at < METRICS_TTL_MS) return cached.value;

    const [data, service, quotas, recentJobs] = await Promise.all([
      this.metrics.dataMetrics(),
      this.metrics.serviceMetrics(7),
      this.quota.allUsage(),
      this.jobs.history(7),
    ]);

    const value = { data, service, quotas, recentJobs, computedAt: new Date() };
    this.metricsCache = { at: Date.now(), value };
    return value;
  }

  /** 수집을 손으로 돌린 직후 등 캐시가 낡았을 때 */
  invalidateMetricsCache(): void {
    this.metricsCache = null;
  }

  countPendingMatches(): Promise<number> {
    return this.matchFailures.countPending();
  }
}
