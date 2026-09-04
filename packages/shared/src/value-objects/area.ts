import { assertFiniteNumber, InvalidValueError } from '../errors';

/** 1평 = 3.305785 m² (3.3058㎡, 한국 부동산 관례) */
const SQM_PER_PYEONG = 3.305785;

/**
 * 면적 값 객체 (ToDo.md 3.1).
 *
 * 내부 표현은 **m²**. 공공 API 가 m² 로 내려주기 때문에 이것을 기준으로 삼고,
 * 평은 표시용 변환으로만 제공한다. m²↔평 혼동을 타입으로 차단하는 것이 목적이다.
 */
export class Area {
  private constructor(private readonly sqm: number) {}

  static fromSqm(value: number): Area {
    assertFiniteNumber(value, '면적(m²)');
    if (value <= 0) {
      throw new InvalidValueError('면적(m²)', `0보다 커야 합니다 (받은 값: ${value})`);
    }
    return new Area(value);
  }

  static fromPyeong(value: number): Area {
    assertFiniteNumber(value, '면적(평)');
    if (value <= 0) {
      throw new InvalidValueError('면적(평)', `0보다 커야 합니다 (받은 값: ${value})`);
    }
    return new Area(value * SQM_PER_PYEONG);
  }

  toSqm(): number {
    return this.sqm;
  }

  /** 평으로 환산 (소수점 1자리). 84.97 → 25.7 */
  toPyeong(): number {
    return Math.round((this.sqm / SQM_PER_PYEONG) * 10) / 10;
  }

  /**
   * 단지 면적타입 라벨. 84.97 → "84㎡ (25평)"
   *
   * 올림이 아니라 **내림**을 쓴다. 한국에서 전용 84.97㎡ 를 "84타입",
   * 59.94㎡ 를 "59타입"이라 부르는 관례와 맞추기 위함이다.
   */
  toTypeLabel(): string {
    return `${Math.floor(this.sqm)}㎡ (${Math.floor(this.sqm / SQM_PER_PYEONG)}평)`;
  }

  isWithin(min: Area, max: Area): boolean {
    return this.sqm >= min.sqm && this.sqm <= max.sqm;
  }

  compare(other: Area): -1 | 0 | 1 {
    if (this.sqm < other.sqm) return -1;
    if (this.sqm > other.sqm) return 1;
    return 0;
  }

  toString(): string {
    return this.toTypeLabel();
  }
}
