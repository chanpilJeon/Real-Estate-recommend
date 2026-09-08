import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth';
import { CollectorModule } from '../collector';
import { CoreModule } from '../core';
import { MatchingModule } from '../matching';
import { ObservabilityModule } from '../observability';

import { AdminJobRunner } from './admin-job-runner';
import { AdminStatusService } from './admin-status.service';
import { AdminController } from './admin.controller';

/**
 * 관리자 대시보드 (ToDo.md 3.13, 계층 L6).
 * 가장 바깥 계층이라 아래 모든 모듈을 읽을 수 있다. 반대로 여기를 참조하는 곳은 없다.
 */
@Module({
  imports: [CoreModule, ObservabilityModule, MatchingModule, CollectorModule, AdminAuthModule],
  controllers: [AdminController],
  providers: [AdminStatusService, AdminJobRunner],
})
export class AdminModule {}
