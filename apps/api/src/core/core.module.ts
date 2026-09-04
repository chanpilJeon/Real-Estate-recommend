import { Global, Module } from '@nestjs/common';

import { AppConfig } from './app.config';
import { LOGGER, PinoLogger } from './logger';
import { PrismaService } from './prisma.service';

/**
 * 기반 인프라 모듈 (계층 L0).
 *
 * `@Global()` 이므로 다른 모듈이 따로 import 하지 않아도 AppConfig·ILogger·PrismaService 를
 * 주입받을 수 있다. 횡단 관심사라 모든 모듈이 쓰기 때문이다.
 */
@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      // 기동 시 1회 검증. 실패하면 여기서 예외가 나 서버가 시작되지 않는다.
      useFactory: () => AppConfig.load(process.env),
    },
    {
      provide: LOGGER,
      useFactory: (config: AppConfig) => new PinoLogger(config),
      inject: [AppConfig],
    },
    PrismaService,
  ],
  exports: [AppConfig, LOGGER, PrismaService],
})
export class CoreModule {}
