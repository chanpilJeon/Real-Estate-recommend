import { Module } from '@nestjs/common';

import { CoreModule } from './core';
import { HealthController } from './health.controller';

/**
 * 루트 모듈.
 * Step 3 이후로 region / observability / admin-auth … 모듈이
 * ToDo.md 2.3 계층 순서대로 여기에 등록된다.
 */
@Module({
  imports: [CoreModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
