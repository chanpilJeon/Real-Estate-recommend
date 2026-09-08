import type {
  ComplexDetailDto,
  ComplexSummaryDto,
  PaginatedDto,
  RegionCandidateDto,
} from '@apt/shared';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/** 화면에 뿌릴 실거래 한 줄 (API 응답 그대로) */
export interface TradeRow {
  contractedAt: string;
  exclusiveSqm: number;
  areaLabel: string;
  priceManwon: number;
  priceText: string;
  floor: number;
  isCanceled: boolean;
}

export interface TrendPoint {
  yearMonth: string;
  medianManwon: number;
  count: number;
}

export interface SearchParams {
  [key: string]: unknown;
  regionCode: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  builtAfter?: number;
  minHouseholds?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** 서버가 보낸 한국어 오류 문구를 그대로 화면에 쓰기 위한 오류 타입 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    // 서버가 꺼져 있을 때 "Failed to fetch" 대신 사람이 읽는 문구를 준다
    throw new ApiError(0, 'API 서버에 연결하지 못했습니다. 서버가 실행 중인지 확인해 주세요.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new ApiError(response.status, message ?? `요청이 실패했습니다 (HTTP ${response.status})`);
  }

  return (await response.json()) as T;
}

/** 실제로 데이터가 쌓인 지역 */
export interface CollectedRegion {
  sigunguCode: string;
  name: string;
  complexCount: number;
  tradeCount: number;
  regionCode: string;
}

export const api = {
  collectedRegions: () => request<CollectedRegion[]>('/api/collected-regions'),

  searchRegions: (q: string, limit = 10) =>
    request<{ keyword: string; candidates: RegionCandidateDto[] }>('/api/regions/search', { q, limit }),

  searchComplexes: (params: SearchParams) =>
    request<PaginatedDto<ComplexSummaryDto>>('/api/complexes', params),

  getComplex: (id: number) => request<ComplexDetailDto>(`/api/complexes/${id}`),

  getTrades: (id: number, area?: number, limit = 30) =>
    request<{ items: TradeRow[]; areas: number[] }>(`/api/complexes/${id}/trades`, { area, limit }),
};

/** 만원 → "8억 5,000만" (목록에서 짧게 쓰는 표기) */
export function formatManwon(manwon: number | null): string {
  if (manwon === null) return '거래 없음';
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  if (eok === 0) return `${rest.toLocaleString()}만`;
  if (rest === 0) return `${eok}억`;
  return `${eok}억 ${rest.toLocaleString()}만`;
}

/** 미터 → "도보 5분" (80m/분) */
export function formatWalk(meters: number | null): string | null {
  if (meters === null) return null;
  return `직선 ${meters.toLocaleString()}m`;
}
