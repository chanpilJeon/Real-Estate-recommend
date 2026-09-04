import { beforeEach, describe, expect, it } from 'vitest';

import type { JobRunSummary } from './domain/types';
import { JobRunRecorder } from './job-run-recorder';
import type { IJobRunStore } from './ports';
import { FakeLogger } from './test-doubles';

interface FinishCall {
  id: number;
  status: 'success' | 'failed';
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage?: string;
}

class FakeJobRunStore implements IJobRunStore {
  readonly starts: { jobName: string; triggeredBy: string }[] = [];
  readonly finishes: FinishCall[] = [];
  startShouldFail = false;
  private nextId = 1;

  start(input: { jobName: string; triggeredBy: string }): Promise<number> {
    if (this.startShouldFail) return Promise.reject(new Error('DB 연결 끊김'));
    this.starts.push({ jobName: input.jobName, triggeredBy: input.triggeredBy });
    return Promise.resolve(this.nextId++);
  }

  finish(id: number, input: Omit<FinishCall, 'id'>): Promise<void> {
    this.finishes.push({ id, ...input });
    return Promise.resolve();
  }

  history(): Promise<JobRunSummary[]> {
    return Promise.resolve([]);
  }
  lastRun(): Promise<JobRunSummary | null> {
    return Promise.resolve(null);
  }
}

describe('JobRunRecorder — 배치 실행 이력', () => {
  let store: FakeJobRunStore;
  let logger: FakeLogger;
  let recorder: JobRunRecorder;

  beforeEach(() => {
    store = new FakeJobRunStore();
    logger = new FakeLogger();
    recorder = new JobRunRecorder(store, logger);
  });

  describe('성공한 배치', () => {
    it('결과값을 그대로 돌려준다', async () => {
      await expect(recorder.run('daily-collect', () => Promise.resolve('결과'))).resolves.toBe('결과');
    });

    it('시작과 종료를 모두 기록한다', async () => {
      await recorder.run('daily-collect', () => Promise.resolve(null));

      expect(store.starts).toHaveLength(1);
      expect(store.starts[0]?.jobName).toBe('daily-collect');
      expect(store.finishes[0]?.status).toBe('success');
    });

    it('작업 중 센 건수를 기록한다', async () => {
      await recorder.run('daily-collect', (ctx) => {
        ctx.addInserted(120);
        ctx.addInserted(30);
        ctx.addUpdated(5);
        return Promise.resolve(null);
      });

      expect(store.finishes[0]?.rowsInserted).toBe(150);
      expect(store.finishes[0]?.rowsUpdated).toBe(5);
    });

    it('기본 실행 주체는 cron 이고, 수동 실행은 표시된다', async () => {
      await recorder.run('a', () => Promise.resolve(null));
      await recorder.run('b', () => Promise.resolve(null), { triggeredBy: 'admin' });

      expect(store.starts[0]?.triggeredBy).toBe('cron');
      expect(store.starts[1]?.triggeredBy).toBe('admin');
    });
  });

  describe('실패한 배치', () => {
    it('예외를 삼키지 않고 그대로 던진다', async () => {
      await expect(
        recorder.run('daily-collect', () => Promise.reject(new Error('국토부 API 타임아웃'))),
      ).rejects.toThrow('국토부 API 타임아웃');
    });

    it('failed 로 기록하고 오류 메시지를 남긴다', async () => {
      await recorder.run('daily-collect', () => Promise.reject(new Error('국토부 API 타임아웃'))).catch(() => {});

      expect(store.finishes[0]?.status).toBe('failed');
      expect(store.finishes[0]?.errorMessage).toContain('국토부 API 타임아웃');
    });

    it('실패해도 그때까지 센 건수는 남긴다 (어디까지 진행됐는지 알아야 한다)', async () => {
      await recorder
        .run('daily-collect', (ctx) => {
          ctx.addInserted(40);
          return Promise.reject(new Error('중간에 끊김'));
        })
        .catch(() => {});

      expect(store.finishes[0]?.rowsInserted).toBe(40);
    });
  });

  describe('기록 자체가 실패할 때', () => {
    beforeEach(() => {
      store.startShouldFail = true;
    });

    it('본 작업은 그대로 수행한다 (로그 때문에 수집이 멈추면 안 된다)', async () => {
      let ran = false;
      await recorder.run('daily-collect', () => {
        ran = true;
        return Promise.resolve('ok');
      });
      expect(ran).toBe(true);
    });

    it('조용히 넘기지 않고 error 로 남긴다', async () => {
      await recorder.run('daily-collect', () => Promise.resolve(null));
      expect(logger.errors.some((e) => e.msg.includes('시작 기록하지 못했습니다'))).toBe(true);
    });

    it('시작 기록이 없으면 종료 기록도 시도하지 않는다', async () => {
      await recorder.run('daily-collect', () => Promise.resolve(null));
      expect(store.finishes).toHaveLength(0);
    });
  });
});
