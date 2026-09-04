import { Module } from '@nestjs/common';

import { LOGGER, type ILogger } from '../core';

import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';
import { BcryptPasswordHasher } from './bcrypt-password-hasher';
import {
  ADMIN_SESSION_STORE,
  ADMIN_USER_STORE,
  PASSWORD_HASHER,
  type IAdminSessionStore,
  type IAdminUserStore,
  type IPasswordHasher,
} from './ports';
import { PrismaAdminSessionStore } from './prisma/prisma-admin-session.store';
import { PrismaAdminUserStore } from './prisma/prisma-admin-user.store';
import { AdminSessionCleanupJob } from './session-cleanup.job';

/** 관리자 인증 모듈 (계층 L1). 서비스 사용자 인증과 완전히 분리한다. */
@Module({
  controllers: [AdminAuthController],
  providers: [
    PrismaAdminUserStore,
    PrismaAdminSessionStore,
    BcryptPasswordHasher,
    { provide: ADMIN_USER_STORE, useExisting: PrismaAdminUserStore },
    { provide: ADMIN_SESSION_STORE, useExisting: PrismaAdminSessionStore },
    { provide: PASSWORD_HASHER, useExisting: BcryptPasswordHasher },
    {
      provide: AdminAuthService,
      useFactory: (
        users: IAdminUserStore,
        sessions: IAdminSessionStore,
        hasher: IPasswordHasher,
        logger: ILogger,
      ) => new AdminAuthService(users, sessions, hasher, logger),
      inject: [ADMIN_USER_STORE, ADMIN_SESSION_STORE, PASSWORD_HASHER, LOGGER],
    },
    AdminGuard,
    AdminSessionCleanupJob,
  ],
  exports: [AdminAuthService, AdminGuard],
})
export class AdminAuthModule {}
