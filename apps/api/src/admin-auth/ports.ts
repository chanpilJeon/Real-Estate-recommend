import type { AdminSession } from './domain/types';

/**
 * admin-auth 가 의존하는 저장소 추상.
 *
 * `passwordHash` 는 이 파일 안에서만 등장한다 — 모듈 배럴에서 내보내지 않으므로
 * 다른 모듈이나 DTO 로 새어 나갈 수 없다. (ToDo.md 3.5 캡슐화)
 */
export interface AdminUserRecord {
  id: number;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface IAdminUserStore {
  findByUsername(username: string): Promise<AdminUserRecord | null>;
  findById(id: number): Promise<AdminUserRecord | null>;
  updateLockState(id: number, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
  markLoggedIn(id: number, at: Date): Promise<void>;
  updatePassword(id: number, passwordHash: string): Promise<void>;
}
export const ADMIN_USER_STORE = Symbol('IAdminUserStore');

export interface IAdminSessionStore {
  create(input: { tokenHash: string; adminId: number; expiresAt: Date; ip?: string }): Promise<void>;
  /** 세션과 그 주인 정보를 한 번에 (N+1 방지) */
  findWithAdmin(tokenHash: string): Promise<AdminSession | null>;
  delete(tokenHash: string): Promise<void>;
  /** 비밀번호 변경 시 기존 세션 전부 무효화 (ToDo.md 8절) */
  deleteAllForAdmin(adminId: number): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
}
export const ADMIN_SESSION_STORE = Symbol('IAdminSessionStore');

/** bcrypt 를 감싸는 추상 — 테스트에서 느린 해싱을 가짜로 바꿀 수 있다 */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('IPasswordHasher');
