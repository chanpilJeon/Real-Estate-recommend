/**
 * scripts/seed-admin.ts — 기본 관리자 계정 생성 (멱등: 여러 번 실행해도 안전)
 *
 * 초기 비밀번호 '12345' 는 로컬에서 바로 실행해보기 위한 값이다.
 * mustChangePassword=true 이므로 최초 로그인 시 변경이 강제된다. (ToDo.md 8절)
 *
 * 실행:  pnpm seed:admin
 *
 * ⚠ Step 2 에서 AdminUser 모델이 추가된 뒤에 동작한다.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? '12345';

  // Step 2 이전에는 adminUser 모델이 없으므로 안내만 하고 끝낸다.
  if (!('adminUser' in prisma)) {
    console.log('AdminUser 모델이 아직 없습니다 — Step 2 에서 스키마 작성 후 다시 실행하세요.');
    return;
  }

  const client = prisma as PrismaClient & {
    adminUser: {
      findUnique(args: { where: { username: string } }): Promise<unknown>;
      create(args: { data: Record<string, unknown> }): Promise<unknown>;
    };
  };

  if (await client.adminUser.findUnique({ where: { username } })) {
    console.log(`관리자 계정 '${username}' 이(가) 이미 있습니다 — 건너뜁니다.`);
    return;
  }

  await client.adminUser.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
    },
  });

  console.log(`관리자 계정을 만들었습니다: ${username} / ${password}`);
  console.log('⚠ 최초 로그인 시 비밀번호를 반드시 변경하세요.');
}

main()
  .catch((err: unknown) => {
    console.error('관리자 계정 생성 실패:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
