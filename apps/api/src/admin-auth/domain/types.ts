/** 로그인 결과 (ToDo.md 3.5) */
export type LoginResult =
  | { status: 'ok'; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { status: 'invalid' }
  | { status: 'locked'; until: Date };

/** 인증된 관리자 — 요청 객체에 붙는다. 비밀번호 해시는 절대 포함하지 않는다. */
export interface AdminSession {
  adminId: number;
  username: string;
  mustChangePassword: boolean;
  expiresAt: Date;
}
