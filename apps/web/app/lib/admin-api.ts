/**
 * 관리자 API 호출.
 *
 * 세션은 httpOnly 쿠키라 자바스크립트가 읽을 수 없다 — 그래서 `credentials: 'include'` 로
 * 브라우저가 알아서 붙이게 한다. 로그인·비밀번호 변경이 필요한 상태를 **호출한 쪽이
 * 매번 판단하지 않도록** 여기서 오류 종류로 구분해 던진다.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class NeedsLoginError extends Error {
  constructor() {
    super('로그인이 필요합니다.');
    this.name = 'NeedsLoginError';
  }
}
export class NeedsPasswordChangeError extends Error {
  constructor() {
    super('비밀번호를 먼저 변경해 주세요.');
    this.name = 'NeedsPasswordChangeError';
  }
}
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    // 서버가 꺼져 있을 때 "Failed to fetch" 를 그대로 보여주지 않는다
    throw new AdminApiError(0, 'API 서버에 연결할 수 없습니다. `pnpm dev` 가 켜져 있는지 확인해 주세요.');
  }

  if (response.status === 401) throw new NeedsLoginError();
  if (response.status === 403) throw new NeedsPasswordChangeError();

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `요청에 실패했습니다 (${response.status})`;
    throw new AdminApiError(response.status, message);
  }
  return body as T;
}

export type StatusLevel = 'ok' | 'warn' | 'error';

export interface StatusCheck {
  label: string;
  level: StatusLevel;
  detail: string;
}
export interface AdminHealth {
  level: StatusLevel;
  headline: string;
  actions: string[];
  checks: StatusCheck[];
  databaseLatencyMs: number;
  checkedAt: string;
}
export interface AdminMetrics {
  data: {
    regionCount: number;
    complexCount: number;
    tradeCount: number;
    rentCount: number;
    latestContractDate: string | null;
    freshnessDays: number | null;
    unresolvedMatchFailures: number;
  };
  service: { days: number; searchCount: number; popularRegions: { regionCode: string; count: number }[] };
  quotas: { provider: string; used: number; limit: number; ratio: number }[];
  computedAt: string;
}
export interface JobRun {
  id: number;
  jobName: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage: string | null;
  triggeredBy: string;
}
export interface LogRow {
  id: string;
  level: 'info' | 'warn' | 'error';
  context: string;
  message: string;
  createdAt: string;
}
export interface MatchFailureRow {
  id: number;
  regionCode: string;
  rawName: string;
  builtYear: number | null;
  occurrences: number;
  candidates: { complexId: number; name: string; score: number }[];
  createdAt: string;
}
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminApi = {
  me: () => request<{ username: string; mustChangePassword: boolean }>('/admin/auth/me'),
  login: (username: string, password: string) =>
    request<{ mustChangePassword: boolean; usingDefaultPassword: boolean }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/admin/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true; message: string }>('/admin/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  health: () => request<AdminHealth>('/admin/health'),
  metrics: () => request<AdminMetrics>('/admin/metrics'),
  jobs: (limit = 20) => request<JobRun[]>(`/admin/jobs?limit=${limit}`),
  runJob: (name: string) =>
    request<{ started: true; message: string }>(`/admin/jobs/${encodeURIComponent(name)}/run`, {
      method: 'POST',
    }),
  logs: (params: { level?: string; q?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params.level) query.set('level', params.level);
    if (params.q) query.set('q', params.q);
    query.set('page', String(params.page ?? 1));
    return request<Paginated<LogRow>>(`/admin/logs?${query.toString()}`);
  },
  matches: (page = 1) => request<Paginated<MatchFailureRow>>(`/admin/matches?page=${page}`),
  resolveMatch: (id: number, complexId: number) =>
    request<{ relinkedTrades: number; relinkedRents: number }>(`/admin/matches/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ complexId }),
    }),
};
