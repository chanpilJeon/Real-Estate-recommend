import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import type { IQuotaStore } from '../ports';

@Injectable()
export class PrismaQuotaStore implements IQuotaStore {
  constructor(private readonly prisma: PrismaService) {}

  async increment(provider: string, date: Date, count: number, dailyLimit: number): Promise<void> {
    await this.prisma.apiQuotaUsage.upsert({
      where: { provider_date: { provider, date } },
      create: { provider, date, used: count, dailyLimit },
      update: { used: { increment: count } },
    });
  }

  async find(provider: string, date: Date): Promise<{ used: number; dailyLimit: number } | null> {
    const row = await this.prisma.apiQuotaUsage.findUnique({
      where: { provider_date: { provider, date } },
      select: { used: true, dailyLimit: true },
    });
    return row;
  }
}
