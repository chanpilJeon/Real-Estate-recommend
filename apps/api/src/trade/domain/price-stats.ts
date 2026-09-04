/**
 * 가격 통계 (순수 함수 — DB·네트워크를 모른다).
 *
 * **이 프로젝트에서 가격을 집계하는 규칙은 여기에만 있다** (ToDo.md 3.8 캡슐화).
 * 이상치 기준이 바뀌면 이 파일 한 곳만 고치면 된다.
 */

/**
 * 이상치 판정 기준: 중위가 대비 ±40% (ToDo.md 3.8).
 *
 * 직거래·특수관계인 거래·증여성 거래가 실거래가에 섞여 들어오는데,
 * 이런 값이 평균을 끌어내려 "싸게 나온 단지"로 잘못 보이게 만든다.
 * 중위값은 그 자체로 이상치에 강하므로, **중위값을 먼저 구한 뒤**
 * 그 기준으로 걸러 다시 계산하는 2단계를 쓴다.
 */
export const OUTLIER_THRESHOLD = 0.4;

/** 중위값. 짝수 개면 가운데 두 값의 평균 (만원 단위 정수로 반올림) */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const value =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

  return Math.round(value);
}

/** 중위값 기준 ±threshold 를 벗어나는가 */
export function isOutlier(value: number, medianValue: number, threshold = OUTLIER_THRESHOLD): boolean {
  if (medianValue <= 0) return false;
  return Math.abs(value - medianValue) / medianValue > threshold;
}

export interface MedianResult {
  /** 이상치를 제외하고 다시 구한 중위가 */
  median: number;
  /** 계산에 쓴 건수 */
  usedCount: number;
  /** 제외한 건수 */
  excludedCount: number;
}

/**
 * 이상치를 뺀 중위값.
 *
 * 1단계: 전체로 중위값을 구한다 (중위값은 극단값에 잘 흔들리지 않는다)
 * 2단계: 그 값에서 ±40% 밖인 건을 빼고 다시 구한다
 */
export function medianExcludingOutliers(
  values: number[],
  threshold = OUTLIER_THRESHOLD,
): MedianResult | null {
  const rough = median(values);
  if (rough === null) return null;

  const kept = values.filter((v) => !isOutlier(v, rough, threshold));
  // 전부 걸러진 경우(있을 수 없지만 방어)에는 1단계 값을 그대로 쓴다
  const refined = median(kept) ?? rough;

  return {
    median: refined,
    usedCount: kept.length,
    excludedCount: values.length - kept.length,
  };
}

export interface MonthlyPoint {
  /** 'YYYY-MM' */
  yearMonth: string;
  medianManwon: number;
  /** 그 달의 (이상치 제외 후) 거래 건수 */
  count: number;
}

export interface DatedPrice {
  contractedAt: Date;
  priceManwon: number;
}

/**
 * 월별 중위가 시계열.
 *
 * 이상치는 **전체 기간 중위가를 기준으로** 먼저 걸러낸다.
 * 달마다 따로 걸러내면 거래가 1~2건인 달에서 기준 자체가 이상해진다.
 *
 * 거래가 없는 달은 빈 점을 만들지 않는다 — 없는 값을 0으로 그리면
 * 차트에서 폭락한 것처럼 보인다.
 */
export function monthlyMedians(prices: DatedPrice[], threshold = OUTLIER_THRESHOLD): MonthlyPoint[] {
  if (prices.length === 0) return [];

  const overall = median(prices.map((p) => p.priceManwon));
  if (overall === null) return [];

  const buckets = new Map<string, number[]>();
  for (const price of prices) {
    if (isOutlier(price.priceManwon, overall, threshold)) continue;
    const key = yearMonthOf(price.contractedAt);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [price.priceManwon]);
    else bucket.push(price.priceManwon);
  }

  return [...buckets.entries()]
    .map(([yearMonth, values]) => ({
      yearMonth,
      medianManwon: median(values) ?? 0,
      count: values.length,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export function yearMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
