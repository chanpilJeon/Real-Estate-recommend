import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import type { IQuotaStore } from '../ports';

@Injectable()
export class PrismaQuotaStore implements IQuotaStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⚠ Prisma 의 `upsert` 를 쓰면 안 된다.
   *   MySQL/MariaDB 에서는 SELECT 후 INSERT/UPDATE 하는 두 단계라,
   *   같은 행(같은 날짜)에 동시에 쓰면 MariaDB 가 1020
   *   ("Record has changed since last read")로 거절한다.
   *   지오코딩처럼 외부 API 를 동시에 여러 개 호출하면 실제로 터진다 —
   *   호출은 성공했는데 사용량 기록이 실패해서 **호출 결과까지 버려졌다.**
   *
   * 그래서 한 문장으로 원자적으로 올린다. 경합해도 값이 어긋나지 않는다.
   */
  async increment(provider: string, date: Date, count: number, dailyLimit: number): Promise<void> {
    // kstDateOnly 가 만든 값은 '해당 KST 날짜의 00:00 UTC' 라 UTC 날짜 부분이 곧 저장할 날짜다
    const dateOnly = date.toISOString().slice(0, 10);

    await this.prisma.$executeRaw`
      INSERT INTO api_quota_usage (provider, date, used, daily_limit)
      VALUES (${provider}, ${dateOnly}, ${count}, ${dailyLimit})
      ON DUPLICATE KEY UPDATE used = used + ${count}
    `;
  }

  async find(provider: string, date: Date): Promise<{ used: number; dailyLimit: number } | null> {
    const row = await this.prisma.apiQuotaUsage.findUnique({
      where: { provider_date: { provider, date } },
      select: { used: true, dailyLimit: true },
    });
    return row;
  }
}
