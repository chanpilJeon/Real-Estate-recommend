import { Controller, Get } from '@nestjs/common';

/**
 * 서버가 살아있는지 확인하는 최소 엔드포인트.
 * Step 9 관리자 대시보드의 `GET /admin/health` 로 확장된다.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; startedAt: string; uptimeSec: number } {
    return {
      status: 'ok',
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
