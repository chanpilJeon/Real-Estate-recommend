import { InvalidValueError } from '../errors';

/** 범위를 이루는 값이 갖춰야 할 능력 */
export interface Comparable<T> {
  compare(other: T): -1 | 0 | 1;
}

/**
 * 양끝을 포함하는 범위 (ToDo.md 3.12).
 *
 * 예산 5억~7억, 전용 59~85㎡ 처럼 "하한과 상한" 쌍을 다룬다.
 * 한쪽만 지정하는 경우(상한만, 하한만)가 흔해서 둘 다 선택적이다.
 */
export class Range<T extends Comparable<T>> {
  private constructor(
    readonly min: T | null,
    readonly max: T | null,
  ) {}

  /** 하한이 상한보다 크면 만들 수 없다 — 조용히 뒤집으면 실수를 못 알아챈다 */
  static of<T extends Comparable<T>>(min: T | null, max: T | null, label = '범위'): Range<T> {
    if (min !== null && max !== null && min.compare(max) > 0) {
      throw new InvalidValueError(label, '최솟값이 최댓값보다 큽니다');
    }
    return new Range(min, max);
  }

  static unbounded<T extends Comparable<T>>(): Range<T> {
    return new Range<T>(null, null);
  }

  /** 아무 제한도 없는 범위인가 */
  isUnbounded(): boolean {
    return this.min === null && this.max === null;
  }

  contains(value: T): boolean {
    if (this.min !== null && value.compare(this.min) < 0) return false;
    if (this.max !== null && value.compare(this.max) > 0) return false;
    return true;
  }
}
