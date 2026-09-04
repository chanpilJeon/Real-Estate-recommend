import { createHash, randomBytes } from 'node:crypto';

/** admin_sessions.token_hash 는 CHAR(64) — sha256 hex 길이와 같다 */
const TOKEN_BYTES = 32;

/**
 * 세션 토큰을 만든다.
 *
 * 원본 토큰은 사용자 쿠키에만 있고, **DB 에는 해시만 저장한다.**
 * DB 가 유출돼도 그 값으로 로그인할 수 없게 하기 위함이다.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
