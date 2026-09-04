import { assertFiniteNumber, InvalidValueError } from '../errors';

const WON_PER_MANWON = 10_000;
const MANWON_PER_EOK = 10_000;

/** 천 단위 콤마. Node 로케일 설정에 영향받지 않도록 직접 구현한다. */
function withComma(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 금액 값 객체 (ToDo.md 3.1).
 *
 * 내부 표현은 **만원 단위 정수**다. 부동산 실거래가가 만원 단위로 공시되고,
 * 정수로 다루면 부동소수점 오차가 생기지 않기 때문이다. (ToDo.md 4.3)
 *
 * 생성자가 private 이므로 반드시 `fromManwon()` / `fromWon()` 을 거쳐야 한다 —
 * 검증을 우회할 수 없게 만드는 것이 목적이다.
 */
export class Money {
  private constructor(private readonly manwon: number) {}

  /** 만원 단위로 생성. 소수점이 들어오면 반올림한다. */
  static fromManwon(value: number): Money {
    assertFiniteNumber(value, '금액(만원)');
    if (value < 0) {
      throw new InvalidValueError('금액(만원)', `0 이상이어야 합니다 (받은 값: ${value})`);
    }
    return new Money(Math.round(value));
  }

  /** 원 단위로 생성. 850,000,000원 → 85,000만원 */
  static fromWon(value: number): Money {
    assertFiniteNumber(value, '금액(원)');
    if (value < 0) {
      throw new InvalidValueError('금액(원)', `0 이상이어야 합니다 (받은 값: ${value})`);
    }
    return new Money(Math.round(value / WON_PER_MANWON));
  }

  static zero(): Money {
    return new Money(0);
  }

  toManwon(): number {
    return this.manwon;
  }

  toWon(): number {
    return this.manwon * WON_PER_MANWON;
  }

  /** 사람이 읽는 한국어 표기. 85000 → "8억 5,000만원" */
  toKoreanText(): string {
    if (this.manwon === 0) return '0원';

    const eok = Math.floor(this.manwon / MANWON_PER_EOK);
    const rest = this.manwon % MANWON_PER_EOK;

    if (eok === 0) return `${withComma(rest)}만원`;
    if (rest === 0) return `${withComma(eok)}억`;
    return `${withComma(eok)}억 ${withComma(rest)}만원`;
  }

  /** min ~ max 범위 안인지 (양끝 포함) */
  isWithin(min: Money, max: Money): boolean {
    return this.manwon >= min.manwon && this.manwon <= max.manwon;
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.manwon < other.manwon) return -1;
    if (this.manwon > other.manwon) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.manwon === other.manwon;
  }

  toString(): string {
    return this.toKoreanText();
  }
}
