/**
 * scripts/seed-region.ts — 법정동 코드 적재 (ToDo.md Step 2)
 *
 * 실행:  pnpm seed:region
 *
 * 원본 파일은 깃에 없다. `data/README.md` 안내대로 내려받아
 * `data/legal-dong-codes.txt` 로 두어야 한다.
 *
 * 멱등하다 — 여러 번 실행해도 중복되지 않고, 폐지 여부만 갱신한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import iconv from 'iconv-lite';

import { ALIAS_SEEDS } from './lib/region-aliases';
import { parseLegalDongFile, type ParsedRegion } from './lib/parse-legal-dong';

const prisma = new PrismaClient();
const DATA_FILE = resolve(process.cwd(), 'data/legal-dong-codes.txt');
const CHUNK = 1000;

/** EUC-KR(CP949) / UTF-8 을 자동 판별해 읽는다. 정부 파일은 보통 EUC-KR 이다. */
function readTextAutoEncoding(path: string): string {
  const buffer = readFileSync(path);
  const asUtf8 = buffer.toString('utf8');
  // 깨진 문자(U+FFFD)가 있으면 UTF-8 이 아니다
  return asUtf8.includes('�') ? iconv.decode(buffer, 'cp949') : asUtf8;
}

async function seedRegions(rows: ParsedRegion[]): Promise<{ created: number; updated: number }> {
  const existing = await prisma.region.findMany({ select: { code: true, isActive: true } });
  const existingMap = new Map(existing.map((r) => [r.code, r.isActive]));

  const toCreate = rows.filter((r) => !existingMap.has(r.code));
  const toUpdate = rows.filter(
    (r) => existingMap.has(r.code) && existingMap.get(r.code) !== r.isActive,
  );

  for (let i = 0; i < toCreate.length; i += CHUNK) {
    await prisma.region.createMany({ data: toCreate.slice(i, i + CHUNK), skipDuplicates: true });
    process.stdout.write(`\r   적재 중... ${Math.min(i + CHUNK, toCreate.length)}/${toCreate.length}`);
  }
  if (toCreate.length > 0) process.stdout.write('\n');

  for (const row of toUpdate) {
    await prisma.region.update({ where: { code: row.code }, data: { isActive: row.isActive } });
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

async function seedAliases(): Promise<{ linked: number; missing: string[] }> {
  let linked = 0;
  const missing: string[] = [];

  for (const seed of ALIAS_SEEDS) {
    for (const dong of seed.dongNames) {
      const region = await prisma.region.findFirst({
        where: { sido: seed.sido, sigungu: seed.sigungu, dong, isActive: true },
        select: { code: true },
      });

      if (region === null) {
        // 코드를 지어내지 않는다 — 못 찾으면 남겨두고 사람이 확인한다
        missing.push(`${seed.alias}: ${seed.sido} ${seed.sigungu} ${dong}`);
        continue;
      }

      await prisma.regionAlias.upsert({
        where: { alias_regionCode: { alias: seed.alias, regionCode: region.code } },
        create: { alias: seed.alias, regionCode: region.code },
        update: {},
      });
      linked += 1;
    }
  }

  return { linked, missing };
}

async function main(): Promise<void> {
  if (!existsSync(DATA_FILE)) {
    console.error('\n법정동코드 파일을 찾지 못했습니다.');
    console.error(`  찾은 위치: ${DATA_FILE}\n`);
    console.error('내려받는 방법은 data/README.md 를 보세요. 요약하면:');
    console.error('  1. https://www.code.go.kr 에서 "법정동코드 전체자료" 다운로드');
    console.error('  2. 파일 이름을 legal-dong-codes.txt 로 바꿔 data/ 폴더에 넣기');
    console.error('  3. pnpm seed:region 다시 실행\n');
    process.exit(1);
  }

  console.log('법정동코드 파일을 읽는 중...');
  const rows = parseLegalDongFile(readTextAutoEncoding(DATA_FILE));

  if (rows.length === 0) {
    console.error('파일에서 읽어낸 지역이 0건입니다. 파일이 올바른지 확인해 주세요.');
    process.exit(1);
  }
  console.log(`  ${rows.length.toLocaleString()}건을 읽었습니다 (리 단위 제외).`);

  const { created, updated } = await seedRegions(rows);
  console.log(`지역: 새로 ${created.toLocaleString()}건 추가, ${updated}건 갱신`);

  const { linked, missing } = await seedAliases();
  console.log(`생활권 별칭: ${linked}건 연결`);
  if (missing.length > 0) {
    console.warn('  ⚠ 아래 별칭은 해당 법정동을 찾지 못해 건너뛰었습니다:');
    for (const m of missing) console.warn(`     - ${m}`);
    console.warn('  (scripts/lib/region-aliases.ts 의 이름 표기를 확인하세요)');
  }

  const total = await prisma.region.count();
  console.log(`\n완료. regions 테이블에 총 ${total.toLocaleString()}건이 있습니다.`);
}

main()
  .catch((err: unknown) => {
    console.error('\n법정동 코드 적재에 실패했습니다:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
