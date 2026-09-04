import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core';
import type { AdminSession } from '../domain/types';
import type { IAdminSessionStore } from '../ports';

@Injectable()
export class PrismaAdminSessionStore implements IAdminSessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    tokenHash: string;
    adminId: number;
    expiresAt: Date;
    ip?: string;
  }): Promise<void> {
    await this.prisma.adminSession.create({
      data: {
        tokenHash: input.tokenHash,
        adminId: input.adminId,
        expiresAt: input.expiresAt,
        ip: input.ip ?? null,
      },
    });
  }

  async findWithAdmin(tokenHash: string): Promise<AdminSession | null> {
    const row = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      select: {
        adminId: true,
        expiresAt: true,
        // 세션 확인 때마다 계정을 따로 조회하지 않도록 함께 가져온다
        admin: { select: { username: true, mustChangePassword: true } },
      },
    });
    if (row === null) return null;

    return {
      adminId: row.adminId,
      username: row.admin.username,
      mustChangePassword: row.admin.mustChangePassword,
      expiresAt: row.expiresAt,
    };
  }

  async delete(tokenHash: string): Promise<void> {
    // 이미 없어도 오류로 만들지 않는다 (로그아웃을 두 번 눌러도 괜찮아야 한다)
    await this.prisma.adminSession.deleteMany({ where: { tokenHash } });
  }

  async deleteAllForAdmin(adminId: number): Promise<number> {
    const result = await this.prisma.adminSession.deleteMany({ where: { adminId } });
    return result.count;
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } });
    return result.count;
  }
}
