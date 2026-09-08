import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { AppConfig, LOGGER, type ILogger } from './core';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(AppConfig);
  const logger = app.get<ILogger>(LOGGER);

  // 관리자 세션 쿠키를 읽기 위해
  app.use(cookieParser());
  // 프론트(Next.js, 3000번)에서 API(4000번)를 부를 수 있게 허용
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(config.apiPort);
  logger.info('bootstrap', `API 서버 기동 완료 → http://localhost:${config.apiPort}/api`, config.describe());
}

bootstrap().catch((err: unknown) => {
  // 설정 오류는 스택트레이스보다 "무엇을 고쳐야 하는지"가 중요하다.
  console.error('\n서버를 시작하지 못했습니다.\n');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
