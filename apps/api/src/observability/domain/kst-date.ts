const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 한국 시간 기준 '오늘 날짜'를 돌려준다 (시각은 00:00 UTC).
 *
 * 공공 API 의 일일 호출 한도는 한국 시간 자정에 초기화된다.
 * 서버 타임존이 UTC 여도 같은 날짜로 집계되어야 하므로 직접 계산한다.
 */
export function kstDateOnly(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** 두 날짜 사이의 일수 (KST 날짜 기준) */
export function daysBetweenKst(from: Date, to: Date): number {
  const a = kstDateOnly(from).getTime();
  const b = kstDateOnly(to).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
