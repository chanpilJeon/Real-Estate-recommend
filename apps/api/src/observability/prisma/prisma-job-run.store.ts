import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import type { JobRunSummary, JobStatus } from '../domain/types';
import type { IJobRunStore } from '../ports';

interface JobRunRow {
  id: number;
  jobName: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage: string | null;
  triggeredBy: string;
}

const toSummary = (row: JobRunRow): JobRunSummary => ({
  id: row.id,
  jobName: row.jobName,
  status: row.status as JobStatus,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  durationMs: row.finishedAt === null ? null : row.finishedAt.getTime() - row.startedAt.getTime(),
  rowsInserted: row.rowsInserted,
  rowsUpdated: row.rowsUpdated,
  errorMessage: row.errorMessage,
  triggeredBy: row.triggeredBy,
});

@Injectable()
export class PrismaJobRunStore implements IJobRunStore {
  constructor(private readonly prisma: PrismaService) {}

  async start(input: {
    jobName: string;
    triggeredBy: string;
    params?: Record<string, unknown>;
  }): Promise<number> {
    const row = await this.prisma.jobRun.create({
      data: {
        jobName: input.jobName,
        status: 'running',
        startedAt: new Date(),
        triggeredBy: input.triggeredBy,
        params: input.params === undefined ? undefined : JSON.parse(JSON.stringify(input.params)),
      },
      select: { id: true },
    });
    return row.id;
  }

  async finish(
    id: number,
    input: {
      status: 'success' | 'failed';
      rowsInserted: number;
      rowsUpdated: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.prisma.jobRun.update({
      where: { id },
      data: {
        status: input.status,
        finishedAt: new Date(),
        rowsInserted: input.rowsInserted,
        rowsUpdated: input.rowsUpdated,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  async history(limit: number, jobName?: string): Promise<JobRunSummary[]> {
    const rows = await this.prisma.jobRun.findMany({
      where: jobName === undefined ? {} : { jobName },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSummary);
  }

  async lastRun(jobName: string): Promise<JobRunSummary | null> {
    const row = await this.prisma.jobRun.findFirst({
      where: { jobName },
      orderBy: { startedAt: 'desc' },
    });
    return row === null ? null : toSummary(row);
  }
}
