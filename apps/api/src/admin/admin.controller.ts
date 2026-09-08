import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard, type AdminRequest } from '../admin-auth';
import { MatchFailureNotFoundError, MatchFailureService } from '../matching';
import { LogStore, type LogFilter, type LogLevel } from '../observability';

import { AdminJobRunner, type RunnableJobName } from './admin-job-runner';
import { AdminStatusService } from './admin-status.service';

const LOG_LEVELS: LogLevel[] = ['info', 'warn', 'error'];

const positiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException('페이지는 1 이상의 정수여야 합니다.');
  }
  return value;
};

/**
 * 관리자 대시보드 API (ToDo.md 3.13, 8절).
 *
 * 모든 경로가 `AdminGuard` 뒤에 있다. 가드는 세션뿐 아니라
 * "비밀번호를 아직 안 바꿨는가"도 보고, 그 상태면 여기까지 오지 못한다.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly status: AdminStatusService,
    private readonly logs: LogStore,
    private readonly jobs: AdminJobRunner,
    private readonly matchFailures: MatchFailureService,
  ) {}

  /** GET /api/admin/health — 지금 서비스가 정상인가 (사람이 읽는 문장 포함) */
  @Get('health')
  health(@Req() request: AdminRequest) {
    const admin = request.admin;
    if (admin === undefined) throw new UnauthorizedException('로그인이 필요합니다.');
    return this.status.health(admin.adminId);
  }

  /** GET /api/admin/metrics — 핵심 지표 (5분 캐시) */
  @Get('metrics')
  metrics() {
    return this.status.metricsSummary();
  }

  /** GET /api/admin/logs?level=&context=&q=&page= */
  @Get('logs')
  logsQuery(@Query() query: Record<string, string | undefined>) {
    const level = query.level;
    if (level !== undefined && level !== '' && !LOG_LEVELS.includes(level as LogLevel)) {
      throw new BadRequestException('level 은 info, warn, error 중 하나여야 합니다.');
    }

    const filter: LogFilter = {
      level: level === undefined || level === '' ? undefined : (level as LogLevel),
      context: query.context === '' ? undefined : query.context,
      q: query.q === '' ? undefined : query.q,
      page: positiveInt(query.page, 1),
      pageSize: Math.min(positiveInt(query.pageSize, 30), 100),
    };
    return this.logs.query(filter);
  }

  /** GET /api/admin/logs/errors — 같은 오류끼리 묶어서 (무엇이 반복되는지) */
  @Get('logs/errors')
  errorGroups(@Query('days') days?: string) {
    const window = Math.min(positiveInt(days, 7), 30);
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);
    return this.logs.groupedErrors(since);
  }

  /** GET /api/admin/jobs — 최근 배치 실행 기록 */
  @Get('jobs')
  jobHistory(@Query('limit') limit?: string, @Query('name') name?: string) {
    return this.jobs.history(Math.min(positiveInt(limit, 20), 100), name);
  }

  /**
   * POST /api/admin/jobs/:name/run — 배치 수동 실행.
   *
   * 오래 걸리므로 **기다리지 않고 바로 응답한다.** 진행 상황은 배치 기록에서 본다.
   */
  @Post('jobs/:name/run')
  @HttpCode(202)
  runJob(@Param('name') name: string) {
    return this.jobs.trigger(name as RunnableJobName);
  }

  /** GET /api/admin/matches — 단지에 연결되지 않은 실거래 (사람이 골라줘야 하는 것) */
  @Get('matches')
  pendingMatches(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.matchFailures.listPending(
      positiveInt(page, 1),
      Math.min(positiveInt(pageSize, 20), 100),
    );
  }

  /**
   * POST /api/admin/matches/:id/resolve — 어떤 단지인지 지정한다.
   * 지정하면 그 이름의 **과거 거래까지 함께 되살아난다** (ToDo.md 4.3).
   */
  @Post('matches/:id/resolve')
  @HttpCode(200)
  async resolveMatch(@Param('id') id: string, @Body() body: { complexId?: unknown }) {
    const failureId = Number(id);
    const complexId = Number(body.complexId);
    if (!Number.isSafeInteger(failureId) || failureId < 1) {
      throw new BadRequestException('보정할 항목을 찾을 수 없습니다.');
    }
    if (!Number.isSafeInteger(complexId) || complexId < 1) {
      throw new BadRequestException('연결할 단지를 선택해 주세요.');
    }

    try {
      const result = await this.matchFailures.resolve(failureId, complexId);
      // 되살아난 거래만큼 지표가 달라진다
      this.status.invalidateMetricsCache();
      return result;
    } catch (err) {
      if (err instanceof MatchFailureNotFoundError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
