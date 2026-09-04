import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 프론트(Next.js, 3000번)에서 API(4000번)를 부를 수 있게 허용
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);

  Logger.log(`API 서버 기동 완료 → http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
