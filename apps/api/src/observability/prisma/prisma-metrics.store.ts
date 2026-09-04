import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import { daysBetweenKst } from '../domain/kst-date';
import type { DataMetrics, ServiceMetrics } from '../domain/types';
import type { IMetricsStore } from '../ports';

@Injectable()
export class PrismaMetricsStore implements IMetricsStore {
  constructor(private readonly prisma: PrismaService) {}

  async dataMetrics(now: Date): Promise<DataMetrics> {
    const [regionCount, complexCount, tradeCount, rentCount, latest, unresolved] = await Promise.all([
      this.prisma.region.count({ where: { isActive: true } }),
      this.prisma.complex.count(),
      this.prisma.trade.count(),
      this.prisma.rent.count(),
      // 인덱스만 읽고 끝난다 (EXPLAIN: Select tables optimized away)
      this.prisma.trade.aggregate({ _max: { contractedAt: true } }),
      this.prisma.matchFailure.count({ where: { resolvedAt: null } }),
    ]);

    const latestContractDate = latest._max.contractedAt ?? null;

    return {
      regionCount,
      complexCount,
      tradeCount,
      rentCount,
      latestContractDate,
      // 3일 이상 정체면 수집 장애를 의심한다 (ToDo.md 8절)
      freshnessDays: latestContractDate === null ? null : daysBetweenKst(latestContractDate, now),
      unresolvedMatchFailures: unresolved,
    };
  }

  async serviceMetrics(days: number, now: Date): Promise<ServiceMetrics> {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [searchCount, popular] = await Promise.all([
      this.prisma.searchEvent.count({ where: { createdAt: { gte: since } } }),
      this.prisma.searchEvent.groupBy({
        by: ['regionCode'],
        where: { createdAt: { gte: since } },
        _count: { regionCode: true },
        orderBy: { _count: { regionCode: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      days,
      searchCount,
      popularRegions: popular.map((p) => ({ regionCode: p.regionCode, count: p._count.regionCode })),
    };
  }
}
