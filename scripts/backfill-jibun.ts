/**
 * scripts/backfill-jibun.ts — 이미 쌓인 단지의 지번을 주소에서 채운다
 *
 *   pnpm backfill-jibun            실제로 채운다
 *   pnpm backfill-jibun --dry-run  무엇이 바뀔지만 보여준다
 *
 * 왜 필요한가: 지번 칸을 나중에 추가했다. 그전에 만들어진 단지들은 지번이 비어 있는데,
 * 주소에 이미 들어 있으므로("서울특별시 강남구 역삼동 736-1") 공공 API 를 다시 부르지 않고
 * 뽑아낼 수 있다. 지번이 채워져야 K-apt 의 세대수·주차가 이름이 달라도 이어붙는다.
 *
 * 여러 번 돌려도 안전하다 — 이미 채워진 단지는 건너뛴다.
 */
import { jibunFromAddress } from '@apt/shared';
import { PrismaClient } from '@prisma/client';

const CHUNK = 500;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  const targets = await prisma.complex.findMany({
    where: { jibun: null },
    select: { id: true, name: true, address: true },
  });

  console.log(`\n■ 지번이 비어 있는 단지 ${targets.length.toLocaleString()}곳`);
  if (targets.length === 0) {
    console.log('  채울 것이 없습니다.\n');
    await prisma.$disconnect();
    return;
  }

  const found: { id: number; jibun: string }[] = [];
  const missed: string[] = [];

  for (const complex of targets) {
    const jibun = jibunFromAddress(complex.address);
    if (jibun === null) missed.push(`${complex.name} — ${complex.address}`);
    else found.push({ id: complex.id, jibun });
  }

  console.log(`  주소에서 지번을 뽑은 곳: ${found.length.toLocaleString()}`);
  console.log(`  뽑지 못한 곳: ${missed.length.toLocaleString()} (도로명주소만 있거나 번지가 없음)`);
  for (const sample of missed.slice(0, 5)) console.log(`    · ${sample}`);

  if (dryRun) {
    console.log('\n  --dry-run 이라 저장하지 않았습니다.\n');
    await prisma.$disconnect();
    return;
  }

  // 같은 지번끼리 묶어 한 번에 갱신한다 (한 건씩 update 하면 수만 번 왕복한다)
  const byJibun = new Map<string, number[]>();
  for (const row of found) {
    const bucket = byJibun.get(row.jibun);
    if (bucket === undefined) byJibun.set(row.jibun, [row.id]);
    else bucket.push(row.id);
  }

  let done = 0;
  for (const [jibun, ids] of byJibun) {
    for (let offset = 0; offset < ids.length; offset += CHUNK) {
      await prisma.complex.updateMany({
        where: { id: { in: ids.slice(offset, offset + CHUNK) } },
        data: { jibun },
      });
    }
    done += ids.length;
    if (done % 2000 === 0) process.stdout.write(`\r  저장 ${done}/${found.length}`);
  }
  process.stdout.write(`\r  저장 ${done}/${found.length}\n`);

  console.log('\n  이제 `pnpm collect` 로 단지 정보를 받으면 이름이 달라도 번지로 이어붙습니다.\n');
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error('\n지번 채우기에 실패했습니다:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
