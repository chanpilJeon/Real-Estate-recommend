import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AdminAuthService } from './admin-auth.service';
import type { AdminSession } from './domain/types';

export const ADMIN_SESSION_COOKIE = 'admin_session';

const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

/**
 * 비밀번호를 아직 바꾸지 않은 관리자도 접근할 수 있는 경로에 붙인다.
 * (비밀번호 변경·로그아웃·내 정보 — 이것까지 막으면 바꿀 방법이 없다)
 */
export const AllowPendingPasswordChange = (): MethodDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

/** 인증된 관리자 정보가 붙은 요청 */
export interface AdminRequest extends Request {
  admin?: AdminSession;
}

/**
 * 관리자 가드 (ToDo.md 3.5).
 *
 * 두 가지를 본다:
 *  1. 유효한 세션인가
 *  2. 비밀번호를 바꿔야 하는 상태인가 — 그렇다면 변경 전까지 대시보드 접근을 막는다 (8절)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = await this.authService.validateSession(extractToken(request));

    if (session === null) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    request.admin = session;

    const allowPending =
      this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (session.mustChangePassword && !allowPending) {
      throw new ForbiddenException('비밀번호를 먼저 변경해 주세요.');
    }

    return true;
  }
}

/** 쿠키 우선, 없으면 Authorization 헤더 (API 도구로 테스트할 때 편하도록) */
function extractToken(request: AdminRequest): string {
  const fromCookie = (request.cookies as Record<string, string> | undefined)?.[ADMIN_SESSION_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie !== '') return fromCookie;

  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  return '';
}
