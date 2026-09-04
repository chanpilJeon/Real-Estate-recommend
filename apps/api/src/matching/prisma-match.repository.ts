import type { PaginatedDto } from '@apt/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../core';

import type {
  IMatchRepository,
  MatchFailureRecord,
  RecordFailureInput,
} from './match.repository';

type FailureRow = Prisma.MatchFailureGetPayload<Record<string, never>>;

const toRecord = (row: FailureRow): MatchFailureRecord => ({
  id: row.id,
  regionCode: row.regionCode,
  rawName: row.rawName,
  builtYear: row.builtYear,
  occurrences: row.occurrences,
  candidates: (row.candidates ?? []) as MatchFailureRecord['candidates'],
  createdAt: row.createdAt,
});

@Injectable()
export class PrismaMatchRepository implements IMatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOverride(regionCode: string, rawName: string): Promise<number | null> {
    const row = await this.prisma.matchOverride.findUnique({
      where: { regionCode_rawName: { regionCode, rawName } },
      select: { complexId: true },
    });
    return row?.complexId ?? null;
  }

  async saveOverride(regionCode: string, rawName: string, complexId: number): Promise<void> {
    await this.prisma.matchOverride.upsert({
      where: { regionCode_rawName: { regionCode, rawName } },
      create: { regionCode, rawName, complexId },
      update: { complexId },
    });
  }

  /**
   * 같은 실패가 반복되면 새 행을 만들지 않고 건수만 올린다.
   * 한 지역을 수집할 때마다 같은 단지가 수십 번 실패하므로,
   * 행을 계속 만들면 보정 화면이 같은 항목으로 뒤덮인다.
   */
  async recordFailure(input: RecordFailureInput): Promise<void> {
    // ⚠ upsert 를 쓰지 않는다. 유니크 키에 들어 있는 builtYear 가 nullable 이라
    //   Prisma 의 복합 유니크 입력이 null 을 받지 못하고, MySQL 도 NULL 을
    //   서로 다른 값으로 취급해 중복을 못 막는다. 직접 조회해서 가른다.
    const existing = await this.prisma.matchFailure.findFirst({
      where: {
        regionCode: input.regionCode,
        rawName: input.rawName,
        builtYear: input.builtYear,
      },
      select: { id: true },
    });

    const candidates = input.candidates as unknown as Prisma.InputJsonValue;

    if (existing === null) {
      await this.prisma.matchFailure.create({
        data: {
          regionCode: input.regionCode,
          rawName: input.rawName,
          builtYear: input.builtYear,
          occurrences: 1,
          candidates,
        },
      });
      return;
    }

    await this.prisma.matchFailure.update({
      where: { id: existing.id },
      data: {
        occurrences: { increment: 1 },
        // 매칭 규칙이 나아졌을 수 있으니 후보 목록은 최신으로 갱신한다
        candidates,
      },
    });
  }

  async listPendingFailures(page: number, pageSize: number): Promise<PaginatedDto<MatchFailureRecord>> {
    const where: Prisma.MatchFailureWhereInput = { resolvedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.matchFailure.findMany({
        where,
        // 많이 실패한 것부터 — 고치면 효과가 큰 순서
        orderBy: [{ occurrences: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.matchFailure.count({ where }),
    ]);

    return { items: rows.map(toRecord), total, page, pageSize };
  }

  async findFailure(id: number): Promise<MatchFailureRecord | null> {
    const row = await this.prisma.matchFailure.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  async markResolved(id: number, complexId: number): Promise<void> {
    await this.prisma.matchFailure.update({
      where: { id },
      data: { resolvedId: complexId, resolvedAt: new Date() },
    });
  }

  countPending(): Promise<number> {
    return this.prisma.matchFailure.count({ where: { resolvedAt: null } });
  }
}
