import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { AppConfig } from '../core';

import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, AllowPendingPasswordChange, ADMIN_SESSION_COOKIE, type AdminRequest } from './admin.guard';
import { PasswordPolicy } from './domain/password-policy';
import { InvalidCurrentPasswordError, PasswordPolicyError } from './errors';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}
interface ChangePasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly config: AppConfig,
  ) {}

  /** POST /api/admin/auth/login */
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  // IP 단위 무차별 대입 방지 (계정 잠금과 별개의 방어선)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: LoginBody,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ mustChangePassword: boolean; usingDefaultPassword: boolean }> {
    const username = asString(body.username).trim();
    const password = asString(body.password);

    if (username === '' || password === '') {
      throw new BadRequestException('아이디와 비밀번호를 모두 입력해 주세요.');
    }

    const result = await this.authService.login(username, password, request.ip);

    if (result.status === 'locked') {
      const minutes = Math.ceil((result.until.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `로그인 시도가 많아 계정이 잠겼습니다. ${Math.max(minutes, 1)}분 뒤에 다시 시도해 주세요.`,
      );
    }
    if (result.status === 'invalid') {
      // 아이디가 없는 경우와 비밀번호가 틀린 경우를 구분해 알려주지 않는다
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    response.cookie(ADMIN_SESSION_COOKIE, result.token, {
      httpOnly: true, // 자바스크립트가 토큰을 읽지 못하게
      sameSite: 'lax',
      secure: this.config.isProduction,
      expires: result.expiresAt,
      path: '/',
    });

    return {
      mustChangePassword: result.mustChangePassword,
      // 대시보드 경고 배너용 (ToDo.md 8절)
      usingDefaultPassword: PasswordPolicy.isDefaultPassword(password),
    };
  }

  /** POST /api/admin/auth/logout */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @AllowPendingPasswordChange()
  async logout(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const token = (request.cookies as Record<string, string> | undefined)?.[ADMIN_SESSION_COOKIE] ?? '';
    await this.authService.logout(token);
    response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** POST /api/admin/auth/change-password */
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @AllowPendingPasswordChange()
  async changePassword(
    @Body() body: ChangePasswordBody,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true; message: string }> {
    const admin = request.admin;
    if (admin === undefined) throw new UnauthorizedException('로그인이 필요합니다.');

    try {
      await this.authService.changePassword(
        admin.adminId,
        asString(body.currentPassword),
        asString(body.newPassword),
      );
    } catch (err) {
      if (err instanceof InvalidCurrentPasswordError) throw new UnauthorizedException(err.message);
      if (err instanceof PasswordPolicyError) throw new BadRequestException(err.errors);
      throw err;
    }

    // 변경과 동시에 기존 세션이 모두 무효화되므로 쿠키도 지운다
    response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    return { ok: true, message: '비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.' };
  }

  /** GET /api/admin/auth/me — 화면이 현재 상태를 알기 위해 */
  @Get('me')
  @UseGuards(AdminGuard)
  @AllowPendingPasswordChange()
  me(@Req() request: AdminRequest): {
    username: string;
    mustChangePassword: boolean;
    expiresAt: Date;
  } {
    const admin = request.admin;
    if (admin === undefined) throw new UnauthorizedException('로그인이 필요합니다.');

    // passwordHash 는 어떤 응답에도 포함하지 않는다 (ToDo.md 3.5)
    return {
      username: admin.username,
      mustChangePassword: admin.mustChangePassword,
      expiresAt: admin.expiresAt,
    };
  }
}
