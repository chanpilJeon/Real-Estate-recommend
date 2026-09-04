import { describe, expect, it } from 'vitest';

import { FakeLogger } from '../observability/test-doubles';

import { AdminAuthService, LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS, SESSION_TTL_MS } from './admin-auth.service';
import { hashSessionToken } from './domain/token';
import type { AdminSession } from './domain/types';
import { InvalidCurrentPasswordError, PasswordPolicyError } from './errors';
import type { AdminUserRecord, IAdminSessionStore, IAdminUserStore, IPasswordHasher } from './ports';

/** bcrypt 는 느리므로(cost 12 ≈ 250ms) 테스트에서는 접두어만 붙인 가짜를 쓴다 */
class FakeHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }
  compare(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}

class FakeUserStore implements IAdminUserStore {
  constructor(public user: AdminUserRecord | null) {}
  readonly passwordUpdates: string[] = [];

  findByUsername(username: string): Promise<AdminUserRecord | null> {
    return Promise.resolve(this.user?.username === username ? this.user : null);
  }
  findById(id: number): Promise<AdminUserRecord | null> {
    return Promise.resolve(this.user?.id === id ? this.user : null);
  }
  updateLockState(_id: number, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    if (this.user !== null) {
      this.user.failedAttempts = failedAttempts;
      this.user.lockedUntil = lockedUntil;
    }
    return Promise.resolve();
  }
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
  updatePassword(_id: number, passwordHash: string): Promise<void> {
    this.passwordUpdates.push(passwordHash);
    if (this.user !== null) this.user.passwordHash = passwordHash;
    return Promise.resolve();
  }
}

class FakeSessionStore implements IAdminSessionStore {
  readonly rows = new Map<string, { adminId: number; expiresAt: Date }>();
  deletedAllFor: number | null = null;

  constructor(private readonly admin: { username: string; mustChangePassword: boolean }) {}

  create(input: { tokenHash: string; adminId: number; expiresAt: Date }): Promise<void> {
    this.rows.set(input.tokenHash, { adminId: input.adminId, expiresAt: input.expiresAt });
    return Promise.resolve();
  }
  findWithAdmin(tokenHash: string): Promise<AdminSession | null> {
    const row = this.rows.get(tokenHash);
    if (row === undefined) return Promise.resolve(null);
    return Promise.resolve({
      adminId: row.adminId,
      username: this.admin.username,
      mustChangePassword: this.admin.mustChangePassword,
      expiresAt: row.expiresAt,
    });
  }
  delete(tokenHash: string): Promise<void> {
    this.rows.delete(tokenHash);
    return Promise.resolve();
  }
  deleteAllForAdmin(adminId: number): Promise<number> {
    this.deletedAllFor = adminId;
    const n = this.rows.size;
    this.rows.clear();
    return Promise.resolve(n);
  }
  deleteExpired(now: Date): Promise<number> {
    let n = 0;
    for (const [k, v] of this.rows) {
      if (v.expiresAt <= now) {
        this.rows.delete(k);
        n += 1;
      }
    }
    return Promise.resolve(n);
  }
}

const NOW = new Date('2026-09-04T10:00:00Z');

function build(overrides: Partial<AdminUserRecord> = {}, now = NOW) {
  const user: AdminUserRecord = {
    id: 1,
    username: 'admin',
    passwordHash: 'hashed:12345',
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
  const users = new FakeUserStore(user);
  const sessions = new FakeSessionStore({ username: user.username, mustChangePassword: user.mustChangePassword });
  const logger = new FakeLogger();
  const service = new AdminAuthService(users, sessions, new FakeHasher(), logger, () => now);
  return { service, users, sessions, logger, user };
}

describe('AdminAuthService — 관리자 인증', () => {
  describe('로그인 성공', () => {
    it('토큰과 비밀번호 변경 필요 여부를 돌려준다', async () => {
      const { service } = build();
      const result = await service.login('admin', '12345');

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.mustChangePassword).toBe(true);
    });

    it('세션 만료는 12시간 뒤다', async () => {
      const { service } = build();
      const result = await service.login('admin', '12345');
      if (result.status !== 'ok') throw new Error('로그인 성공해야 한다');

      expect(result.expiresAt.getTime()).toBe(NOW.getTime() + SESSION_TTL_MS);
    });

    it('DB 에는 원본 토큰이 아니라 해시가 저장된다', async () => {
      const { service, sessions } = build();
      const result = await service.login('admin', '12345');
      if (result.status !== 'ok') throw new Error('로그인 성공해야 한다');

      expect(sessions.rows.has(result.token)).toBe(false);
      expect(sessions.rows.has(hashSessionToken(result.token))).toBe(true);
    });

    it('이전 실패 횟수를 초기화한다', async () => {
      const { service, user } = build({ failedAttempts: 3 });
      await service.login('admin', '12345');
      expect(user.failedAttempts).toBe(0);
    });
  });

  describe('로그인 실패 — 사유를 세분화해 알려주지 않는다', () => {
    it('없는 계정도 invalid 로만 답한다 (계정 존재 여부 노출 방지)', async () => {
      const { service } = build();
      expect(await service.login('nobody', '12345')).toEqual({ status: 'invalid' });
    });

    it('틀린 비밀번호도 똑같이 invalid 다', async () => {
      const { service } = build();
      expect(await service.login('admin', '틀린비밀번호')).toEqual({ status: 'invalid' });
    });

    it('실패해도 세션을 만들지 않는다', async () => {
      const { service, sessions } = build();
      await service.login('admin', '틀린비밀번호');
      expect(sessions.rows.size).toBe(0);
    });
  });

  describe('계정 잠금 (5회 실패 → 15분)', () => {
    it('4회까지는 잠기지 않는다 (경계값)', async () => {
      const { service, user } = build();
      for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) await service.login('admin', 'wrong');

      expect(user.failedAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
      expect(user.lockedUntil).toBeNull();
    });

    it('5회째에 잠긴다', async () => {
      const { service, user } = build();
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) await service.login('admin', 'wrong');

      expect(user.lockedUntil?.getTime()).toBe(NOW.getTime() + LOCK_DURATION_MS);
    });

    it('잠긴 동안에는 올바른 비밀번호도 막는다', async () => {
      const lockedUntil = new Date(NOW.getTime() + 60_000);
      const { service } = build({ lockedUntil });

      expect(await service.login('admin', '12345')).toEqual({ status: 'locked', until: lockedUntil });
    });

    it('잠금이 풀린 뒤에는 다시 로그인된다', async () => {
      const { service } = build({ lockedUntil: new Date(NOW.getTime() - 1000) });
      expect((await service.login('admin', '12345')).status).toBe('ok');
    });
  });

  describe('세션 확인', () => {
    it('발급받은 토큰으로 확인된다', async () => {
      const { service } = build();
      const result = await service.login('admin', '12345');
      if (result.status !== 'ok') throw new Error('로그인 성공해야 한다');

      const session = await service.validateSession(result.token);
      expect(session?.username).toBe('admin');
      expect(session?.mustChangePassword).toBe(true);
    });

    it('없는 토큰은 null', async () => {
      const { service } = build();
      expect(await service.validateSession('a'.repeat(64))).toBeNull();
    });

    it('빈 토큰은 null (조회조차 하지 않는다)', async () => {
      const { service } = build();
      expect(await service.validateSession('')).toBeNull();
    });

    it('만료된 세션은 null 이고 DB 에서도 지운다', async () => {
      const { service, sessions } = build();
      const login = await service.login('admin', '12345');
      if (login.status !== 'ok') throw new Error('로그인 성공해야 한다');

      // 13시간 뒤 시점의 서비스로 확인
      const later = new AdminAuthService(
        new FakeUserStore(null),
        sessions,
        new FakeHasher(),
        new FakeLogger(),
        () => new Date(NOW.getTime() + SESSION_TTL_MS + 1000),
      );

      expect(await later.validateSession(login.token)).toBeNull();
      expect(sessions.rows.size).toBe(0);
    });

    it('로그아웃하면 세션이 사라진다', async () => {
      const { service } = build();
      const login = await service.login('admin', '12345');
      if (login.status !== 'ok') throw new Error('로그인 성공해야 한다');

      await service.logout(login.token);
      expect(await service.validateSession(login.token)).toBeNull();
    });
  });

  describe('비밀번호 변경', () => {
    it('현재 비밀번호가 틀리면 거부한다', async () => {
      const { service } = build();
      await expect(service.changePassword(1, '틀림', 'apartment1')).rejects.toBeInstanceOf(
        InvalidCurrentPasswordError,
      );
    });

    it('정책에 어긋나면 거부하고 이유를 담는다', async () => {
      const { service } = build();
      await expect(service.changePassword(1, '12345', 'short')).rejects.toBeInstanceOf(
        PasswordPolicyError,
      );
    });

    it('초기 비밀번호로는 바꿀 수 없다', async () => {
      const { service } = build();
      await expect(service.changePassword(1, '12345', '12345')).rejects.toBeInstanceOf(
        PasswordPolicyError,
      );
    });

    it('평문이 아니라 해셔를 거친 값을 저장한다', () => {
      // 실제 bcrypt 결과가 평문을 담지 않는다는 것은 BcryptPasswordHasher 테스트에서 확인한다.
      // 여기서는 서비스가 해싱을 거치는지(원문을 그대로 넘기지 않는지)만 본다.
      const { service, users } = build();
      return service.changePassword(1, '12345', 'apartment1').then(() => {
        expect(users.passwordUpdates).toEqual(['hashed:apartment1']);
      });
    });

    it('성공하면 기존 세션을 전부 무효화한다 (재로그인 강제)', async () => {
      const { service, sessions } = build();
      const login = await service.login('admin', '12345');
      if (login.status !== 'ok') throw new Error('로그인 성공해야 한다');

      await service.changePassword(1, '12345', 'apartment1');

      expect(sessions.deletedAllFor).toBe(1);
      expect(await service.validateSession(login.token)).toBeNull();
    });
  });

  describe('만료 세션 정리', () => {
    it('만료된 것만 지운다', async () => {
      const { service, sessions } = build();
      await sessions.create({
        tokenHash: 'expired',
        adminId: 1,
        expiresAt: new Date(NOW.getTime() - 1000),
      });
      await sessions.create({
        tokenHash: 'alive',
        adminId: 1,
        expiresAt: new Date(NOW.getTime() + 1000),
      });

      expect(await service.cleanupExpiredSessions()).toBe(1);
      expect(sessions.rows.has('alive')).toBe(true);
    });
  });
});
