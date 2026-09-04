import { describe, expect, it } from 'vitest';

import { generateSessionToken, hashSessionToken } from './token';

describe('세션 토큰', () => {
  it('매번 다른 값을 만든다', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });

  it('추측하기 어려운 길이다 (32바이트 = hex 64자)', () => {
    expect(generateSessionToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('해시는 DB 컬럼 길이(CHAR(64))에 맞는다', () => {
    expect(hashSessionToken('아무토큰')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('같은 토큰은 같은 해시를 낸다 (조회에 쓸 수 있어야 한다)', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('해시에서 원본 토큰을 알 수 없다 (DB 유출 시 로그인 불가)', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
