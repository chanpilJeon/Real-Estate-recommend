import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { AdminAuthService } from './admin-auth.service';
import { AdminGuard, ADMIN_SESSION_COOKIE, type AdminRequest } from './admin.guard';
import type { AdminSession } from './domain/types';

const session = (mustChangePassword: boolean): AdminSession => ({
  adminId: 1,
  username: 'admin',
  mustChangePassword,
  expiresAt: new Date(Date.now() + 3600_000),
});

/** validateSession 만 흉내내는 최소 가짜 */
function fakeAuth(result: AdminSession | null): AdminAuthService {
  return {
    validateSession: (token: string) => Promise.resolve(token === 'good-token' ? result : null),
  } as unknown as AdminAuthService;
}

function fakeReflector(allowPending: boolean): Reflector {
  return { getAllAndOverride: () => allowPending } as unknown as Reflector;
}

function contextWith(request: Partial<AdminRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('AdminGuard — 관리자 접근 통제', () => {
  describe('세션 확인', () => {
    it('쿠키의 토큰으로 통과시킨다', async () => {
      const guard = new AdminGuard(fakeAuth(session(false)), fakeReflector(false));
      const request: Partial<AdminRequest> = { cookies: { [ADMIN_SESSION_COOKIE]: 'good-token' }, headers: {} };

      await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    });

    it('통과한 요청에 관리자 정보를 붙인다', async () => {
      const guard = new AdminGuard(fakeAuth(session(false)), fakeReflector(false));
      const request: Partial<AdminRequest> = { cookies: { [ADMIN_SESSION_COOKIE]: 'good-token' }, headers: {} };

      await guard.canActivate(contextWith(request));
      expect(request.admin?.username).toBe('admin');
    });

    it('Authorization 헤더로도 받는다 (API 도구 테스트용)', async () => {
      const guard = new AdminGuard(fakeAuth(session(false)), fakeReflector(false));
      const request: Partial<AdminRequest> = { cookies: {}, headers: { authorization: 'Bearer good-token' } };

      await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    });

    it.each([
      ['쿠키 없음', { cookies: {}, headers: {} }],
      ['모르는 토큰', { cookies: { [ADMIN_SESSION_COOKIE]: 'bad-token' }, headers: {} }],
      ['빈 토큰', { cookies: { [ADMIN_SESSION_COOKIE]: '' }, headers: {} }],
      ['Bearer 아닌 헤더', { cookies: {}, headers: { authorization: 'good-token' } }],
    ])('%s → 401', async (_label, request) => {
      const guard = new AdminGuard(fakeAuth(session(false)), fakeReflector(false));
      await expect(guard.canActivate(contextWith(request as Partial<AdminRequest>))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('비밀번호 변경 강제 (ToDo.md 8절)', () => {
    const loggedIn: Partial<AdminRequest> = {
      cookies: { [ADMIN_SESSION_COOKIE]: 'good-token' },
      headers: {},
    };

    it('변경 전에는 일반 관리자 화면 접근을 막는다', async () => {
      const guard = new AdminGuard(fakeAuth(session(true)), fakeReflector(false));
      await expect(guard.canActivate(contextWith({ ...loggedIn }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('비밀번호 변경·로그아웃 경로는 열어둔다 (막으면 바꿀 방법이 없다)', async () => {
      const guard = new AdminGuard(fakeAuth(session(true)), fakeReflector(true));
      await expect(guard.canActivate(contextWith({ ...loggedIn }))).resolves.toBe(true);
    });

    it('변경을 마친 뒤에는 모든 경로가 열린다', async () => {
      const guard = new AdminGuard(fakeAuth(session(false)), fakeReflector(false));
      await expect(guard.canActivate(contextWith({ ...loggedIn }))).resolves.toBe(true);
    });
  });
});
