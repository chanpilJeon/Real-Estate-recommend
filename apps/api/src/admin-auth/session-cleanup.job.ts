import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { InjectLogger, type ILogger } from '../core';

import { AdminAuthService } from './admin-auth.service';

/**
 * 만료된 관리자 세션 정리.
 *
 * observability 의 JobRunRecorder 를 쓰지 않는다 — 둘 다 계층 L1 이라
 * 서로 참조하면 의존성 규칙 위반이다 (ToDo.md 2.3). 로그만 남긴다.
 */
@Injectable()
export class AdminSessionCleanupJob {
  constructor(
    private readonly authService: AdminAuthService,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  /** 매일 새벽 4시 30분 (로그 정리 04:00, 수집 06:00 과 겹치지 않게) */
  @Cron('30 4 * * *', { name: 'admin-session-cleanup' })
  async handleCron(): Promise<void> {
    try {
      const removed = await this.authService.cleanupExpiredSessions();
      if (removed > 0) {
        this.logger.info('admin-auth', `만료된 관리자 세션 ${removed}건을 정리했습니다`);
      }
    } catch (err) {
      this.logger.error(
        'admin-auth',
        '만료 세션 정리에 실패했습니다',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
}
