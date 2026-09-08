/**
 * scripts/fix-duplicate-complexes.ts — 같은 단지가 두 번 만들어진 것을 합친다
 *
 *   pnpm fix-duplicates            합친다
 *   pnpm fix-duplicates --dry-run  무엇이 합쳐질지만 보여준다
 *
 * 왜 생기나: 국토부 실거래 자료는 같은 단지의 거래인데도 건축년도를 다르게 주는 경우가 있다
 * (면목한신 1987/1988). 단지 식별에 건축년도가 들어가 있어서 두 개로 갈라졌다.
 *
 * 갈라지면 ① 목록에 같은 아파트가 두 번 나오고 ② 매칭 후보가 둘이라 애매해져서
 * 그 단지 거래가 통째로 단지에 안 붙는다.
 *
 * 코드는 고쳤지만(같은 이름은 같은 단지로 본다) 이미 갈라진 것은 여기서 합친다.
 * 거래·전월세를 남길 쪽으로 옮기고, 붙지 못했던 거래도 이어붙인다.
 */
import { PrismaClient } from '@prisma/client';

interface Group {
  regionCode: string;
  nameNormalized: string;
  ids: number[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  const rows = await prisma.$queryRaw<{ region_code: string; name_normalized: string; ids: string }[]>`
    SELECT region_code, name_normalized, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM complexes
    GROUP BY region_code, name_normalized
    HAVING COUNT(*) > 1
  `;

  const groups: Group[] = rows.map((row) => ({
    regionCode: row.region_code,
    nameNormalized: row.name_normalized,
    ids: row.ids.split(',').map(Number),
  }));

  console.log(`\n■ 같은 이름으로 갈라진 단지 ${groups.length}곳`);
  if (groups.length === 0) {
    console.log('  합칠 것이 없습니다.\n');
    await prisma.$disconnect();
    return;
  }

  let movedTrades = 0;
  let movedRents = 0;
  let relinked = 0;
  let removed = 0;

  for (const group of groups) {
    // 정보가 가장 많은 쪽을 남긴다 (세대수를 아는 쪽 > 좌표가 있는 쪽 > 먼저 만들어진 쪽)
    const complexes = await prisma.complex.findMany({
      where: { id: { in: group.ids } },
      select: { id: true, name: true, households: true, lat: true, builtYear: true, jibun: true },
    });
    const keep = [...complexes].sort(
      (a, b) =>
        Number(b.households > 0) - Number(a.households > 0) ||
        Number(b.lat !== null) - Number(a.lat !== null) ||
        a.id - b.id,
    )[0]!;
    const drop = complexes.filter((c) => c.id !== keep.id).map((c) => c.id);

    console.log(
      `  ${keep.name} — ${complexes.map((c) => `${c.id}(${c.builtYear ?? '?'}년)`).join(' + ')}` +
        ` → ${keep.id} 로 합침`,
    );
    if (dryRun) continue;

    const [t, r] = await Promise.all([
      prisma.trade.updateMany({ where: { complexId: { in: drop } }, data: { complexId: keep.id } }),
      prisma.rent.updateMany({ where: { complexId: { in: drop } }, data: { complexId: keep.id } }),
    ]);
    movedTrades += t.count;
    movedRents += r.count;

    // 후보가 둘이라 애매해서 붙지 못했던 거래를 이제 이어붙인다 (ToDo.md 4.3)
    const [t2, r2] = await Promise.all([
      prisma.trade.updateMany({
        where: { complexId: null, regionCode: group.regionCode, rawName: { in: complexes.map((c) => c.name) } },
        data: { complexId: keep.id },
      }),
      prisma.rent.updateMany({
        where: { complexId: null, regionCode: group.regionCode, rawName: { in: complexes.map((c) => c.name) } },
        data: { complexId: keep.id },
      }),
    ]);
    relinked += t2.count + r2.count;

    // 면적 타입은 단지에 딸린 것이라 함께 정리한다
    await prisma.areaType.deleteMany({ where: { complexId: { in: drop } } });
    const deleted = await prisma.complex.deleteMany({ where: { id: { in: drop } } });
    removed += deleted.count;
  }

  if (dryRun) {
    console.log('\n  --dry-run 이라 아무것도 바꾸지 않았습니다.\n');
  } else {
    console.log(`\n■ 결과`);
    console.log(`  옮긴 거래 ${movedTrades.toLocaleString()} / 전월세 ${movedRents.toLocaleString()}`);
    console.log(`  뒤늦게 이어붙인 거래 ${relinked.toLocaleString()}건`);
    console.log(`  지운 중복 단지 ${removed}곳\n`);
  }

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error('\n중복 단지 정리에 실패했습니다:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
