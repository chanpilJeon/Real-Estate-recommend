/**
 * 재시도가 붙은 HTTP 호출 (ToDo.md 3.6: 지수 백오프 3회).
 *
 * 공공 API 는 일시적으로 느려지거나 502 를 뱉는 일이 잦다.
 * 한 번 실패했다고 그날 수집을 통째로 버리지 않도록 몇 번 다시 시도한다.
 *
 * **다시 시도하지 않는 경우**: 400·401·404 같은 요청 자체의 문제.
 * 같은 요청을 반복해봐야 결과가 같고, 호출 한도만 축낸다.
 */

export interface RetryOptions {
  attempts?: number;
  /** 첫 대기 시간. 이후 3배씩 늘어난다 (300ms → 900ms → 2700ms) */
  baseDelayMs?: number;
  timeoutMs?: number;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

const DEFAULTS = { attempts: 3, baseDelayMs: 300, timeoutMs: 15_000 };
const BACKOFF_FACTOR = 3;

export class HttpRequestError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

/** 다시 시도할 가치가 있는 상태코드인가 */
export function isRetryableStatus(status: number): boolean {
  // 429(한도 초과)는 잠시 뒤 풀릴 수 있고, 5xx 는 서버 쪽 일시 장애다
  return status === 408 || status === 429 || status >= 500;
}

export function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * BACKOFF_FACTOR ** (attempt - 1);
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RetryingFetch {
  constructor(
    private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly sleep: SleepFn = defaultSleep,
  ) {}

  /** 본문을 문자열로 돌려준다 (XML/JSON 은 호출부가 파싱) */
  async getText(url: string, init: RequestInit = {}, options: RetryOptions = {}): Promise<string> {
    const { attempts, baseDelayMs, timeoutMs } = { ...DEFAULTS, ...options };
    let lastError: HttpRequestError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init, timeoutMs);

        if (response.ok) return await response.text();

        const body = await response.text().catch(() => '');
        lastError = new HttpRequestError(
          response.status,
          `HTTP ${response.status}: ${body.slice(0, 200)}`,
          attempt,
        );

        // 요청 자체가 잘못된 것은 다시 보내도 같다
        if (!isRetryableStatus(response.status)) throw lastError;
      } catch (err) {
        if (err instanceof HttpRequestError && err.status !== null && !isRetryableStatus(err.status)) {
          throw err;
        }
        lastError =
          err instanceof HttpRequestError
            ? err
            : new HttpRequestError(null, err instanceof Error ? err.message : String(err), attempt);
      }

      if (attempt < attempts) await this.sleep(backoffDelayMs(attempt, baseDelayMs));
    }

    throw lastError ?? new HttpRequestError(null, '알 수 없는 오류', attempts);
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
