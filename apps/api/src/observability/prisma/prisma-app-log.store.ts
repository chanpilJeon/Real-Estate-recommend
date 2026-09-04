import type { PaginatedDto } from '@apt/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../core';
import type { AppLogEntry, AppLogRecord, ErrorGroup, LogFilter, LogLevel } from '../domain/types';
import type { IAppLogStore } from '../ports';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PrismaAppLogStore implements IAppLogStore {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(entries: AppLogEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const result = await this.prisma.appLog.createMany({
      data: entries.map((e) => ({
        level: e.level,
        context: e.context,
        message: e.message,
        messageKey: e.messageKey,
        meta: e.meta === undefined ? undefined : (JSON.parse(JSON.stringify(e.meta)) as Prisma.InputJsonValue),
        createdAt: e.createdAt,
      })),
    });
    return result.count;
  }

  async query(filter: LogFilter): Promise<PaginatedDto<AppLogRecord>> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(Math.max(1, filter.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const where: Prisma.AppLogWhereInput = {
      ...(filter.level === undefined ? {} : { level: filter.level }),
      ...(filter.context === undefined ? {} : { context: filter.context }),
      ...(filter.q === undefined || filter.q === '' ? {} : { message: { contains: filter.q } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.appLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.appLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        // BigInt 는 JSON 직렬화가 안 되므로 문자열로 바꿔 내보낸다
        id: row.id.toString(),
        level: row.level as LogLevel,
        context: row.context,
        message: row.message,
        messageKey: row.messageKey,
        meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 같은 messageKey 끼리 묶어 많이 난 순으로 (대시보드 "에러 Top") */
  async groupedErrors(since: Date, limit: number): Promise<ErrorGroup[]> {
    const groups = await this.prisma.appLog.groupBy({
      by: ['messageKey'],
      where: { level: 'error', createdAt: { gte: since } },
      _count: { messageKey: true },
      _max: { createdAt: true },
      orderBy: { _count: { messageKey: 'desc' } },
      take: limit,
    });

    // 그룹마다 대표 메시지(가장 최근 것)를 붙인다
    return Promise.all(
      groups.map(async (g) => {
        const latest = await this.prisma.appLog.findFirst({
          where: { messageKey: g.messageKey },
          orderBy: { createdAt: 'desc' },
          select: { message: true, context: true },
        });
        return {
          messageKey: g.messageKey,
          context: latest?.context ?? '',
          sample: latest?.message ?? '',
          count: g._count.messageKey,
          lastSeenAt: g._max.createdAt ?? since,
        };
      }),
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.appLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }
}
