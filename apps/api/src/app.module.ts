import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * 루트 모듈.
 * Step 1 이후로 core / region / observability … 모듈이 여기에 등록된다.
 * (ToDo.md 2.3 계층 순서대로 추가할 것)
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
