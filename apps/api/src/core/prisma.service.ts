import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppConfig } from './app.config';
import { InjectLogger, type ILogger } from './logger';

const CTX = 'prisma';

/**
 * DB 연결 (ToDo.md 3.2).
 *
 * 기동 시 연결을 시도하되, **개발 환경에서는 실패해도 서버를 죽이지 않는다.**
 * DB 없이도 화면·API 를 띄워볼 수 있어야 하기 때문이다 (Step 2 이전 상황).
 * 운영 환경에서는 조용히 넘어가면 안 되므로 그대로 실패시킨다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  constructor(
    private readonly config: AppConfig,
    @InjectLogger() private readonly logger: ILogger,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.info(CTX, '데이터베이스에 연결했습니다.');
    } catch (err) {
      if (this.config.isProduction) throw err;

      this.logger.warn(
        CTX,
        '데이터베이스에 연결하지 못했습니다. DB가 필요한 기능은 동작하지 않습니다. ' +
          '(Docker 를 켜고 `pnpm prisma migrate dev` 를 실행하세요 — Step 2 전까지는 정상입니다)',
        { reason: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) await this.$disconnect();
  }

  /** 관리자 대시보드 상태 표시용 (ToDo.md 3.14) */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const startedAt = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: Date.now() - startedAt };
    }
  }
}
