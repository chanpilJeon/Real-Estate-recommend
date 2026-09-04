import { InvalidValueError } from '../errors';

const CODE_PATTERN = /^\d{10}$/;
const SIGUNGU_LENGTH = 5;

/**
 * 법정동 코드 값 객체 (ToDo.md 3.1).
 *
 * 10자리 숫자 문자열. 앞 5자리가 시군구 코드이고, 이것이 국토부 실거래가 API 의
 * 조회 키(`LAWD_CD`)다. 문자열로 굴리다가 앞자리 0 이 날아가는 사고를 막기 위해
 * 값 객체로 감싼다. (예: "1168010100" 을 number 로 다루면 안 된다)
 */
export class RegionCode {
  private constructor(private readonly value: string) {}

  static parse(input: string): RegionCode {
    if (typeof input !== 'string') {
      throw new InvalidValueError('법정동코드', `문자열이어야 합니다 (받은 값: ${String(input)})`);
    }
    const trimmed = input.trim();
    if (!CODE_PATTERN.test(trimmed)) {
      throw new InvalidValueError('법정동코드', `숫자 10자리여야 합니다 (받은 값: "${input}")`);
    }
    return new RegionCode(trimmed);
  }

  /** 검증 없이 후보를 걸러낼 때 사용 (throw 하지 않는다) */
  static isValid(input: string): boolean {
    return typeof input === 'string' && CODE_PATTERN.test(input.trim());
  }

  toString(): string {
    return this.value;
  }

  /** 앞 5자리 — 국토부 API 조회 키 */
  toSigunguCode(): string {
    return this.value.slice(0, SIGUNGU_LENGTH);
  }

  /** 읍면동 단위 코드인지 (뒤 5자리가 00000 이면 시군구 단위) */
  isDongLevel(): boolean {
    return this.value.slice(SIGUNGU_LENGTH) !== '00000';
  }

  equals(other: RegionCode): boolean {
    return this.value === other.value;
  }
}
