/** 비밀번호 정책 (ToDo.md 8절) — DB·프레임워크를 모르는 순수 함수 */

export const MIN_LENGTH = 10;
export const MIN_CHARACTER_TYPES = 2;

/**
 * 로컬 개발 편의용 초기 비밀번호.
 * 인터넷에 노출되는 서버에 이 상태로 두면 대시보드가 그대로 열리므로,
 * 최초 로그인 시 변경을 강제하고 대시보드에 경고 배너를 띄운다.
 */
export const DEFAULT_PASSWORDS = ['12345'];

export interface PolicyResult {
  ok: boolean;
  errors: string[];
}

/** 문자 종류: 소문자 / 대문자 / 숫자 / 기호 */
export function countCharacterTypes(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
}

export class PasswordPolicy {
  /** 통과하지 못한 이유를 **모두** 모아 돌려준다 (하나씩 고치게 하지 않는다) */
  static validate(password: string): PolicyResult {
    const errors: string[] = [];

    if (typeof password !== 'string' || password.length < MIN_LENGTH) {
      errors.push(`비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
    }
    if (countCharacterTypes(password ?? '') < MIN_CHARACTER_TYPES) {
      errors.push('영문 대문자·소문자·숫자·기호 중 2종류 이상을 섞어 주세요.');
    }
    if (PasswordPolicy.isDefaultPassword(password)) {
      errors.push('초기 비밀번호는 사용할 수 없습니다.');
    }

    return { ok: errors.length === 0, errors };
  }

  /** 대시보드 경고 배너용 — 아직 초기 비밀번호를 쓰고 있는가 */
  static isDefaultPassword(password: string): boolean {
    return DEFAULT_PASSWORDS.includes(password);
  }
}
