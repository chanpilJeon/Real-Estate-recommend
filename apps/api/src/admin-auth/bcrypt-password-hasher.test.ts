import { describe, expect, it } from 'vitest';

import { BCRYPT_COST, BcryptPasswordHasher } from './bcrypt-password-hasher';

/** 실제 bcrypt 를 쓰므로 느리다 (cost 12 ≈ 250ms/건). 꼭 필요한 것만 확인한다. */
describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('해시에 평문이 남지 않는다', async () => {
    const hash = await hasher.hash('apartment1');
    expect(hash).not.toContain('apartment1');
    expect(hash.startsWith(`$2`)).toBe(true);
  }, 15_000);

  it('같은 비밀번호도 매번 다른 해시가 된다 (솔트)', async () => {
    const [a, b] = await Promise.all([hasher.hash('apartment1'), hasher.hash('apartment1')]);
    expect(a).not.toBe(b);
    expect(await hasher.compare('apartment1', a)).toBe(true);
    expect(await hasher.compare('apartment1', b)).toBe(true);
  }, 15_000);

  it('틀린 비밀번호는 false', async () => {
    expect(await hasher.compare('틀림', await hasher.hash('apartment1'))).toBe(false);
  }, 15_000);

  it('해시 형식이 깨져 있어도 예외 대신 false (로그인 화면이 500 나면 안 된다)', async () => {
    expect(await hasher.compare('apartment1', '깨진해시')).toBe(false);
  });

  it('ToDo.md 8절이 정한 cost 12 를 쓴다', async () => {
    expect(BCRYPT_COST).toBe(12);
    expect(await hasher.hash('apartment1')).toContain('$12$');
  }, 15_000);
});
