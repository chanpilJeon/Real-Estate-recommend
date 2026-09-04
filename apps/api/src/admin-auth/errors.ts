/**
 * admin-auth 모듈 오류.
 *
 * 서비스는 HTTP 를 모른다 — 컨트롤러가 이 오류를 상태코드로 옮긴다.
 * (ToDo.md 2.1-1 계층 분리)
 */
export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super('현재 비밀번호가 일치하지 않습니다.');
    this.name = 'InvalidCurrentPasswordError';
  }
}

export class PasswordPolicyError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(' '));
    this.name = 'PasswordPolicyError';
  }
}

export class AdminNotFoundError extends Error {
  constructor() {
    super('관리자 계정을 찾을 수 없습니다.');
    this.name = 'AdminNotFoundError';
  }
}
