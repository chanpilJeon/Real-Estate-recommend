import type { PaginatedDto } from '@apt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppLogEntry, AppLogRecord, ErrorGroup } from './domain/types';
import { LogStore } from './log-store';
import type { IAppLogStore } from './ports';
import { FakeLogger } from './test-doubles';

class FakeAppLogStore implements IAppLogStore {
  readonly inserted: AppLogEntry[] = [];
  insertShouldFail = false;
  deletedCutoff: Date | null = null;

  insertMany(entries: AppLogEntry[]): Promise<number> {
    if (this.insertShouldFail) return Promise.reject(new Error('DB 연결 끊김'));
    this.inserted.push(...entries);
    return Promise.resolve(entries.length);
  }
  query(): Promise<PaginatedDto<AppLogRecord>> {
    return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
  }
  groupedErrors(): Promise<ErrorGroup[]> {
    return Promise.resolve([]);
  }
  deleteOlderThan(cutoff: Date): Promise<number> {
    this.deletedCutoff = cutoff;
    return Promise.resolve(7);
  }
}

describe('LogStore — 로그 버퍼링 적재', () => {
  let store: FakeAppLogStore;
  let logger: FakeLogger;
  let logStore: LogStore;

  beforeEach(() => {
    store = new FakeAppLogStore();
    logger = new FakeLogger();
    logStore = new LogStore(store, logger, { flushIntervalMs: 5000, maxBufferSize: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('등급 필터 — warn 이상만 남긴다', () => {
    it('info 는 버린다 (app_logs 비대화 방지)', async () => {
      logStore.add('info', 'collector', '수집 시작');
      await logStore.flush();
      expect(store.inserted).toHaveLength(0);
    });

    it('warn 과 error 는 남긴다', async () => {
      logStore.add('warn', 'matcher', '단지명 매칭 실패');
      logStore.add('error', 'collector', 'API 타임아웃');
      await logStore.flush();
      expect(store.inserted.map((e) => e.level)).toEqual(['warn', 'error']);
    });
  });

  describe('버퍼링', () => {
    it('추가 즉시 DB 에 쓰지 않는다 (요청 응답을 늦추면 안 된다)', () => {
      logStore.add('warn', 'a', '메시지');
      expect(store.inserted).toHaveLength(0);
      expect(logStore.pendingCount()).toBe(1);
    });

    it('버퍼가 가득 차면 기다리지 않고 바로 비운다', async () => {
      logStore.add('warn', 'a', '1');
      logStore.add('warn', 'a', '2');
      logStore.add('warn', 'a', '3'); // maxBufferSize=3
      await vi.waitFor(() => expect(store.inserted).toHaveLength(3));
      expect(logStore.pendingCount()).toBe(0);
    });

    it('일정 시간이 지나면 자동으로 비운다', async () => {
      vi.useFakeTimers();
      logStore.start();
      logStore.add('warn', 'a', '메시지');
      expect(store.inserted).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(5000);
      expect(store.inserted).toHaveLength(1);
    });

    it('종료할 때 남은 것을 마저 비운다', async () => {
      logStore.start();
      logStore.add('warn', 'a', '마지막 메시지');
      await logStore.stop();
      expect(store.inserted).toHaveLength(1);
    });
  });

  describe('적재에 실패했을 때', () => {
    beforeEach(() => {
      store.insertShouldFail = true;
    });

    it('예외를 밖으로 던지지 않는다', async () => {
      logStore.add('warn', 'a', '메시지');
      await expect(logStore.flush()).resolves.toBe(0);
    });

    it('버퍼를 비워 메모리가 새지 않게 한다', async () => {
      logStore.add('warn', 'a', '메시지');
      await logStore.flush();
      expect(logStore.pendingCount()).toBe(0);
    });

    it('조용히 넘기지 않고 error 로 남긴다', async () => {
      logStore.add('warn', 'a', '메시지');
      await logStore.flush();
      expect(logger.errors.some((e) => e.msg.includes('저장하지 못했습니다'))).toBe(true);
    });
  });

  describe('그룹핑 키', () => {
    it('적재 시 messageKey 를 함께 계산해 넣는다', async () => {
      logStore.add('error', 'collector', 'API 타임아웃 (3회)');
      logStore.add('error', 'collector', 'API 타임아웃 (7회)');
      await logStore.flush();

      const [a, b] = store.inserted;
      expect(a?.messageKey).toBe(b?.messageKey); // 숫자만 다르면 같은 그룹
    });
  });

  describe('오래된 로그 정리', () => {
    it('지정한 일수 이전 시각을 기준으로 지운다', async () => {
      const before = Date.now();
      await logStore.purgeOlderThan(30);
      const cutoff = store.deletedCutoff?.getTime() ?? 0;
      const expected = before - 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff - expected)).toBeLessThan(2000);
    });
  });
});
