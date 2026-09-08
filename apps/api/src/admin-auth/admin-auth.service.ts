import type { ILogger } from '../core';

import { DEFAULT_PASSWORDS, PasswordPolicy } from './domain/password-policy';
import { generateSessionToken, hashSessionToken } from './domain/token';
import type { AdminSession, LoginResult } from './domain/types';
import { AdminNotFoundError, InvalidCurrentPasswordError, PasswordPolicyError } from './errors';
import type { IAdminSessionStore, IAdminUserStore, IPasswordHasher } from './ports';

const CTX = 'admin-auth';

/** ToDo.md 8절 정책값 */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 존재하지 않는 계정으로 로그인을 시도해도 비밀번호 비교와 같은 시간이 걸리도록
 * 대조할 더미 해시. 응답 시간 차이로 계정 존재 여부가 새는 것을 막는다.
 */
const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123';

/**
 * 관리자 인증 (ToDo.md 3.5).
 *
 * 서비스 사용자 인증(Phase 4 `user`)과 **완전히 분리**한다.
 * 데코레이터 없는 평범한 클래스라 테스트에서 가짜를 넣어 바로 만들 수 있다.
 */
export class AdminAuthService {
  constructor(
    private readonly users: IAdminUserStore,
    private readonly sessions: IAdminSessionStore,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * 로그인.
   *
   * 실패 사유를 세분화해 알려주지 않는다 — "그런 아이디 없음"과 "비밀번호 틀림"을
   * 구분해주면 계정 존재 여부가 노출된다. (ToDo.md 3.5)
   */
  async login(username: string, password: string, ip?: string): Promise<LoginResult> {
    const user = await this.users.findByUsername(username);
    const at = this.now();

    if (user === null) {
      // 계정이 없어도 비교 시간을 맞춘다 (타이밍으로 존재 여부를 추측하지 못하게)
      await this.hasher.compare(password, DUMMY_HASH);
      this.logger.warn(CTX, '로그인 실패: 없는 계정', { username, ip });
      return { status: 'invalid' };
    }

    if (user.lockedUntil !== null && user.lockedUntil > at) {
      this.logger.warn(CTX, '로그인 실패: 잠긴 계정', { username, ip });
      return { status: 'locked', until: user.lockedUntil };
    }

    if (!(await this.hasher.compare(password, user.passwordHash))) {
      await this.registerFailure(user.id, user.failedAttempts, at, username, ip);
      return { status: 'invalid' };
    }

    await this.users.updateLockState(user.id, 0, null);
    await this.users.markLoggedIn(user.id, at);

    const token = generateSessionToken();
    const expiresAt = new Date(at.getTime() + SESSION_TTL_MS);
    await this.sessions.create({ tokenHash: hashSessionToken(token), adminId: user.id, expiresAt, ip });

    this.logger.info(CTX, '로그인 성공', { username, ip });
    return { status: 'ok', token, expiresAt, mustChangePassword: user.mustChangePassword };
  }

  /** 쿠키의 원본 토큰으로 세션을 확인한다. 만료됐으면 지우고 null. */
  async validateSession(token: string): Promise<AdminSession | null> {
    if (token === '') return null;

    const tokenHash = hashSessionToken(token);
    const session = await this.sessions.findWithAdmin(tokenHash);
    if (session === null) return null;

    if (session.expiresAt <= this.now()) {
      await this.sessions.delete(tokenHash);
      return null;
    }
    return session;
  }

  async logout(token: string): Promise<void> {
    if (token === '') return;
    await this.sessions.delete(hashSessionToken(token));
  }

  /**
   * 비밀번호 변경.
   * 성공하면 **기존 세션을 전부 무효화**한다 — 변경 후 재로그인이 원칙이다.
   */
  async changePassword(adminId: number, current: string, next: string): Promise<void> {
    const user = await this.users.findById(adminId);
    if (user === null) throw new AdminNotFoundError();

    if (!(await this.hasher.compare(current, user.passwordHash))) {
      this.logger.warn(CTX, '비밀번호 변경 실패: 현재 비밀번호 불일치', { username: user.username });
      throw new InvalidCurrentPasswordError();
    }

    const policy = PasswordPolicy.validate(next);
    if (!policy.ok) throw new PasswordPolicyError(policy.errors);

    if (await this.hasher.compare(next, user.passwordHash)) {
      throw new PasswordPolicyError(['새 비밀번호가 기존 비밀번호와 같습니다.']);
    }

    await this.users.updatePassword(adminId, await this.hasher.hash(next));
    const removed = await this.sessions.deleteAllForAdmin(adminId);
    this.logger.info(CTX, `비밀번호 변경 완료 — 기존 세션 ${removed}건 무효화`, {
      username: user.username,
    });
  }

  /** 만료된 세션 정리 (일 1회 cron) */
  /**
   * 저장된 비밀번호가 아직 기본값인가 — 대시보드 경고 배너용 (ToDo.md 8절).
   *
   * `mustChangePassword` 만으로는 알 수 없다. 강제 변경을 끝낸 뒤에 다시 기본값으로
   * 되돌려 놓은 경우를 잡지 못하기 때문이다. 그래서 해시를 직접 대조한다.
   * 결과에 비밀번호 자체는 들어가지 않는다.
   */
  async isUsingDefaultPassword(adminId: number): Promise<boolean> {
    const user = await this.users.findById(adminId);
    if (user === null) return false;

    for (const candidate of DEFAULT_PASSWORDS) {
      if (await this.hasher.compare(candidate, user.passwordHash)) return true;
    }
    return false;
  }

  cleanupExpiredSessions(): Promise<number> {
    return this.sessions.deleteExpired(this.now());
  }

  private async registerFailure(
    id: number,
    previousAttempts: number,
    at: Date,
    username: string,
    ip?: string,
  ): Promise<void> {
    const attempts = previousAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(at.getTime() + LOCK_DURATION_MS) : null;

    await this.users.updateLockState(id, shouldLock ? 0 : attempts, lockedUntil);
    this.logger.warn(
      CTX,
      shouldLock
        ? `로그인 ${MAX_FAILED_ATTEMPTS}회 실패로 계정을 잠갔습니다`
        : `로그인 실패 (${attempts}/${MAX_FAILED_ATTEMPTS})`,
      { username, ip },
    );
  }
}
