import { kstDateOnly } from './domain/kst-date';
import type { IQuotaStore } from './ports';

export type QuotaProvider = 'molit' | 'kakao';

/**
 * 공공 API 일일 호출 한도.
 * 국토부는 개발계정 기준 1만 건(ToDo.md 3.1), 카카오 로컬은 10만 건이다.
 * 운영계정으로 전환하면 이 값을 올린다.
 */
export const DAILY_LIMITS: Record<QuotaProvider, number> = {
  molit: 10_000,
  kakao: 100_000,
};

export interface QuotaUsage {
  provider: string;
  used: number;
  limit: number;
  /** 0~1. 0.8 을 넘으면 대시보드에서 경고 (ToDo.md 8절) */
  ratio: number;
  remaining: number;
}

/** 사용률 계산 — 순수 함수라 따로 테스트한다 */
export function computeUsage(provider: string, used: number, limit: number): QuotaUsage {
  const safeLimit = limit > 0 ? limit : 1;
  return {
    provider,
    used,
    limit,
    ratio: Math.min(used / safeLimit, 1),
    remaining: Math.max(limit - used, 0),
  };
}

/**
 * 공공 API 호출량 추적 (ToDo.md 3.4).
 * 한도를 넘겨 수집이 통째로 막히는 상황을 미리 보기 위한 계기판이다.
 */
export class ApiQuotaTracker {
  constructor(
    private readonly store: IQuotaStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async increment(provider: QuotaProvider, count = 1): Promise<void> {
    if (count <= 0) return;
    await this.store.increment(provider, kstDateOnly(this.now()), count, DAILY_LIMITS[provider]);
  }

  /** 한국 시간 기준 오늘 사용량 */
  async todayUsage(provider: QuotaProvider): Promise<QuotaUsage> {
    const row = await this.store.find(provider, kstDateOnly(this.now()));
    return computeUsage(provider, row?.used ?? 0, row?.dailyLimit ?? DAILY_LIMITS[provider]);
  }

  async allUsage(): Promise<QuotaUsage[]> {
    return Promise.all((Object.keys(DAILY_LIMITS) as QuotaProvider[]).map((p) => this.todayUsage(p)));
  }
}
