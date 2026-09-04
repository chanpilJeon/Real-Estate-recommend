import { describe, expect, it, vi } from 'vitest';

import {
  backoffDelayMs,
  HttpRequestError,
  isRetryableStatus,
  RetryingFetch,
  type FetchLike,
} from './retrying-fetch';

const ok = (body: string): Response => new Response(body, { status: 200 });
const fail = (status: number, body = ''): Response => new Response(body, { status });

/** 대기 없이 즉시 진행하는 가짜 sleep */
const noSleep = vi.fn(() => Promise.resolve());

describe('RetryingFetch — 재시도가 붙은 HTTP 호출', () => {
  describe('재시도 판단', () => {
    it.each([500, 502, 503, 429, 408])('%i 은 다시 시도한다', (status) => {
      expect(isRetryableStatus(status)).toBe(true);
    });

    it.each([400, 401, 403, 404])('%i 은 다시 시도하지 않는다 (같은 결과에 한도만 축낸다)', (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    });
  });

  describe('지수 백오프', () => {
    it('300ms → 900ms → 2700ms 로 늘어난다', () => {
      expect(backoffDelayMs(1, 300)).toBe(300);
      expect(backoffDelayMs(2, 300)).toBe(900);
      expect(backoffDelayMs(3, 300)).toBe(2700);
    });
  });

  describe('성공', () => {
    it('첫 시도에 성공하면 그대로 돌려준다', async () => {
      const fetchFn = vi.fn(() => Promise.resolve(ok('<xml/>'))) as unknown as FetchLike;
      const client = new RetryingFetch(fetchFn, noSleep);

      expect(await client.getText('http://x')).toBe('<xml/>');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('일시 장애 뒤 성공하면 결과를 돌려준다', async () => {
      let call = 0;
      const fetchFn = vi.fn(() => {
        call += 1;
        return Promise.resolve(call < 3 ? fail(503) : ok('ok'));
      }) as unknown as FetchLike;

      const client = new RetryingFetch(fetchFn, noSleep);
      expect(await client.getText('http://x')).toBe('ok');
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('실패', () => {
    it('3회 모두 실패하면 오류를 던진다', async () => {
      const fetchFn = vi.fn(() => Promise.resolve(fail(503))) as unknown as FetchLike;
      const client = new RetryingFetch(fetchFn, noSleep);

      await expect(client.getText('http://x')).rejects.toBeInstanceOf(HttpRequestError);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('401 은 한 번만 시도하고 바로 포기한다', async () => {
      const fetchFn = vi.fn(() => Promise.resolve(fail(401, 'unauthorized'))) as unknown as FetchLike;
      const client = new RetryingFetch(fetchFn, noSleep);

      await expect(client.getText('http://x')).rejects.toThrow(/401/);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('네트워크 오류도 재시도한다', async () => {
      let call = 0;
      const fetchFn = vi.fn(() => {
        call += 1;
        return call < 2 ? Promise.reject(new Error('ECONNRESET')) : Promise.resolve(ok('ok'));
      }) as unknown as FetchLike;

      const client = new RetryingFetch(fetchFn, noSleep);
      expect(await client.getText('http://x')).toBe('ok');
    });

    it('오류에 상태코드와 시도 횟수를 담는다', async () => {
      const fetchFn = vi.fn(() => Promise.resolve(fail(503))) as unknown as FetchLike;
      try {
        await new RetryingFetch(fetchFn, noSleep).getText('http://x');
        expect.unreachable('예외가 발생해야 한다');
      } catch (err) {
        expect((err as HttpRequestError).status).toBe(503);
        expect((err as HttpRequestError).attempts).toBe(3);
      }
    });
  });

  describe('타임아웃', () => {
    it('오래 걸리면 중단하고 재시도한다', async () => {
      let call = 0;
      const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
        call += 1;
        if (call === 1) {
          // 취소 신호가 오면 거부하는 요청 흉내
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
          });
        }
        return Promise.resolve(ok('ok'));
      }) as unknown as FetchLike;

      const client = new RetryingFetch(fetchFn, noSleep);
      expect(await client.getText('http://x', {}, { timeoutMs: 10 })).toBe('ok');
    });
  });
});
