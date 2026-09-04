import { Controller, Get } from '@nestjs/common';

import { AppConfig, PrismaService } from './core';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  demoMode: boolean;
  database: { ok: boolean; latencyMs: number };
}

/**
 * 서버 상태 확인 엔드포인트.
 * Step 9 관리자 대시보드의 `GET /admin/health` 로 확장된다.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.prisma.healthCheck();
    return {
      // DB 가 아직 없어도 API 자체는 응답 가능하므로 'degraded' 로 구분한다.
      status: database.ok ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      demoMode: this.config.demoMode,
      database,
    };
  }
}
