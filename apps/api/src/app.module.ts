import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdminAuthModule } from './admin-auth';
import { ComplexModule } from './complex';
import { CoreModule } from './core';
import { ExternalModule } from './external';
import { HealthController } from './health.controller';
import { ObservabilityModule } from './observability';
import { RegionModule } from './region';

/**
 * 루트 모듈.
 * Step 3 이후로 region / observability / admin-auth … 모듈이
 * ToDo.md 2.3 계층 순서대로 여기에 등록된다.
 */
@Module({
  imports: [
    CoreModule,
    ScheduleModule.forRoot(),
    // 무차별 대입 방지 기본값. 실제 적용은 라우트마다 @UseGuards(ThrottlerGuard) 로 지정한다.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ObservabilityModule,
    ExternalModule,
    RegionModule,
    ComplexModule,
    AdminAuthModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
