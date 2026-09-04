import { Inject } from '@nestjs/common';
import { pino, transport as pinoTransport, type Logger as PinoInstance } from 'pino';

import type { AppConfig } from './app.config';

/**
 * 로거 추상 (ToDo.md 3.2).
 * 상위 모듈은 Pino 를 직접 알지 못한다 — 나중에 구현을 갈아끼울 수 있고,
 * 테스트에서는 가짜 로거를 주입할 수 있다.
 */
export interface ILogger {
  info(ctx: string, msg: string, meta?: object): void;
  warn(ctx: string, msg: string, meta?: object): void;
  error(ctx: string, msg: string, err?: Error, meta?: object): void;
}

/** DI 토큰 — 인터페이스는 런타임에 존재하지 않으므로 심볼로 주입한다. */
export const LOGGER = Symbol('ILogger');

/** `@InjectLogger() private readonly logger: ILogger` 형태로 쓴다. */
export const InjectLogger = (): ParameterDecorator => Inject(LOGGER);

export class PinoLogger implements ILogger {
  private readonly logger: PinoInstance;

  constructor(config: AppConfig) {
    this.logger = pino(
      { level: config.isProduction ? 'info' : 'debug' },
      // 개발 중에는 사람이 읽기 좋은 형태로, 운영에서는 JSON 그대로 남긴다.
      config.isProduction
        ? undefined
        : pinoTransport({
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          }),
    );
  }

  info(ctx: string, msg: string, meta?: object): void {
    this.logger.info({ ctx, ...meta }, msg);
  }

  warn(ctx: string, msg: string, meta?: object): void {
    this.logger.warn({ ctx, ...meta }, msg);
  }

  error(ctx: string, msg: string, err?: Error, meta?: object): void {
    this.logger.error({ ctx, err, ...meta }, msg);
  }
}
