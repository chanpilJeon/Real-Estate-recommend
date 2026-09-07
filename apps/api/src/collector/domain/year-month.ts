import { InvalidValueError } from '@apt/shared';

/** 국토부 API 가 받는 형식 */
const PATTERN = /^\d{6}$/;
/** 실거래가 공개가 시작된 해 — 그 이전은 조회해도 빈 응답이다 */
const MIN_YEAR = 2006;

/**
 * 수집 대상 연월 (ToDo.md 3.11).
 *
 * 국토부 실거래가 API 는 `DEAL_YMD=YYYYMM` 단위로만 조회된다.
 * 문자열로 굴리면 "202613" 같은 값이 조용히 빈 결과를 만들기 때문에 값 객체로 감싼다.
 */
export class YearMonth {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {}

  static of(year: number, month: number): YearMonth {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > 9999) {
      throw new InvalidValueError('연월', `연도가 올바르지 않습니다 (받은 값: ${year})`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidValueError('연월', `월은 1~12 여야 합니다 (받은 값: ${month})`);
    }
    return new YearMonth(year, month);
  }

  /** 'YYYYMM' 문자열에서 만든다 */
  static parse(value: string): YearMonth {
    if (typeof value !== 'string' || !PATTERN.test(value.trim())) {
      throw new InvalidValueError('연월', `YYYYMM 형식이어야 합니다 (받은 값: "${value}")`);
    }
    const trimmed = value.trim();
    return YearMonth.of(Number(trimmed.slice(0, 4)), Number(trimmed.slice(4, 6)));
  }

  static fromDate(date: Date): YearMonth {
    return YearMonth.of(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  /** 국토부 API 파라미터 형식 */
  toString(): string {
    return `${this.year}${String(this.month).padStart(2, '0')}`;
  }

  /** 개월 수만큼 이동. 음수면 과거로 */
  shift(months: number): YearMonth {
    const total = this.year * 12 + (this.month - 1) + months;
    return YearMonth.of(Math.floor(total / 12), (total % 12) + 1);
  }

  compare(other: YearMonth): -1 | 0 | 1 {
    const a = this.year * 12 + this.month;
    const b = other.year * 12 + other.month;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  equals(other: YearMonth): boolean {
    return this.compare(other) === 0;
  }

  /**
   * this 부터 end 까지의 연월 목록 (양끝 포함).
   * 순서가 뒤집혀 있으면 빈 배열 — 조용히 뒤집어 주면 실수를 못 알아챈다.
   */
  rangeTo(end: YearMonth): YearMonth[] {
    if (this.compare(end) > 0) return [];

    const months: YearMonth[] = [];
    for (let cursor = this.shift(0); cursor.compare(end) <= 0; cursor = cursor.shift(1)) {
      months.push(cursor);
    }
    return months;
  }
}
