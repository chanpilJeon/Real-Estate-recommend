import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import type { AdminUserRecord, IAdminUserStore } from '../ports';

const SELECT = {
  id: true,
  username: true,
  passwordHash: true,
  mustChangePassword: true,
  failedAttempts: true,
  lockedUntil: true,
} as const;

@Injectable()
export class PrismaAdminUserStore implements IAdminUserStore {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<AdminUserRecord | null> {
    return this.prisma.adminUser.findUnique({ where: { username }, select: SELECT });
  }

  findById(id: number): Promise<AdminUserRecord | null> {
    return this.prisma.adminUser.findUnique({ where: { id }, select: SELECT });
  }

  async updateLockState(id: number, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.prisma.adminUser.update({ where: { id }, data: { failedAttempts, lockedUntil } });
  }

  async markLoggedIn(id: number, at: Date): Promise<void> {
    await this.prisma.adminUser.update({ where: { id }, data: { lastLoginAt: at } });
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await this.prisma.adminUser.update({
      where: { id },
      // 비밀번호를 바꿨으면 강제 변경 상태도 해제된다
      data: { passwordHash, mustChangePassword: false },
    });
  }
}
