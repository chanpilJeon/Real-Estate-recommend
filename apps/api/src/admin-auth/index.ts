/**
 * admin-auth 모듈 공개 API (ToDo.md 2.1-5).
 *
 * 저장소 구현·포트 토큰·`AdminUserRecord`(passwordHash 포함)는 내보내지 않는다.
 * 비밀번호 해시가 모듈 밖으로 나갈 수 없게 하는 것이 이 배럴의 목적이다.
 */
export { AdminAuthModule } from './admin-auth.module';
export { AdminAuthService } from './admin-auth.service';
export {
  AdminGuard,
  AllowPendingPasswordChange,
  ADMIN_SESSION_COOKIE,
  type AdminRequest,
} from './admin.guard';
export { PasswordPolicy } from './domain/password-policy';
export type { AdminSession, LoginResult } from './domain/types';
