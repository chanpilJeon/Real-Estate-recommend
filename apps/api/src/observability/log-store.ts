import type { PaginatedDto } from '@apt/shared';

import type { ILogger } from '../core';

import { buildMessageKey, truncateMessage } from './domain/log-key';
import type { AppLogEntry, AppLogRecord, ErrorGroup, LogFilter, LogLevel } from './domain/types';
import type { IAppLogStore } from './ports';

const CTX = 'log-store';

export interface LogStoreOptions {
  /** 이 간격마다 버퍼를 비운다 */
  flushIntervalMs?: number;
  /** 버퍼가 이 크기에 닿으면 간격을 기다리지 않고 즉시 비운다 */
  maxBufferSize?: number;
  /** 이 등급 미만은 DB 에 남기지 않는다 */
  minLevel?: LogLevel;
}

const DEFAULTS = { flushIntervalMs: 5_000, maxBufferSize: 100, minLevel: 'warn' as LogLevel };
const LEVEL_ORDER: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

/**
 * 애플리케이션 로그 적재·조회 (ToDo.md 3.4).
 *
 * warn 이상만 DB 에 남긴다. 그리고 요청마다 INSERT 하지 않고
 * **메모리에 모았다가 5초 또는 100건마다 한 번에** 넣는다.
 * 로그 쓰기가 사용자 응답을 늦추면 안 되기 때문이다.
 */
export class LogStore {
  private buffer: AppLogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly options: Required<LogStoreOptions>;

  constructor(
    private readonly store: IAppLogStore,
    private readonly logger: ILogger,
    options: LogStoreOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** 주기적 flush 시작 (모듈 기동 시 1회) */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs);
    // 이 타이머 때문에 프로세스가 종료되지 않는 일이 없도록
    this.timer.unref?.();
  }

  /** 종료 시 남은 버퍼를 마저 비운다 */
  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /** 로그 한 건 적재 예약. 등급이 낮으면 조용히 버린다. */
  add(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.options.minLevel]) return;

    const trimmed = truncateMessage(message);
    this.buffer.push({
      level,
      context,
      message: trimmed,
      messageKey: buildMessageKey(context, trimmed),
      meta,
      createdAt: new Date(),
    });

    if (this.buffer.length >= this.options.maxBufferSize) void this.flush();
  }

  /** 버퍼를 DB 에 밀어넣는다. 실패하면 버린다 — 로그 때문에 메모리가 새면 안 된다. */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;

    const batch = this.buffer;
    this.buffer = [];

    try {
      return await this.store.insertMany(batch);
    } catch (err) {
      this.logger.error(
        CTX,
        `로그 ${batch.length}건을 저장하지 못했습니다 (버립니다)`,
        err instanceof Error ? err : new Error(String(err)),
      );
      return 0;
    }
  }

  /** 대시보드 로그 조회 */
  query(filter: LogFilter): Promise<PaginatedDto<AppLogRecord>> {
    return this.store.query(filter);
  }

  /** 같은 메시지끼리 묶은 오류 순위 (대시보드 "에러 Top") */
  groupedErrors(since: Date, limit = 10): Promise<ErrorGroup[]> {
    return this.store.groupedErrors(since, limit);
  }

  /** 오래된 로그 정리 — app_logs 테이블 비대화를 막는다 (ToDo.md 9절) */
  purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.store.deleteOlderThan(cutoff);
  }

  /** 테스트·진단용 */
  pendingCount(): number {
    return this.buffer.length;
  }
}
