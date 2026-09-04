/**
 * 값 객체 생성 실패를 나타내는 오류.
 * 원시값이 도메인 규칙을 어겼을 때 던진다 — 잘못된 값이 시스템 안으로 들어오는 것을 입구에서 막는다.
 */
export class InvalidValueError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = 'InvalidValueError';
  }
}

/** 유한한 숫자인지 확인. NaN·Infinity·null·undefined 를 한 번에 걸러낸다. */
export function assertFiniteNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidValueError(field, `숫자여야 합니다 (받은 값: ${String(value)})`);
  }
}
