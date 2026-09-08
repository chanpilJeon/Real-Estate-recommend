/**
 * scripts/verify-molit.ts — 우리 DB 가 국토부 원본과 맞는지 대조한다 (ToDo.md 7.3 · M3)
 *
 *   pnpm verify:molit --regions 41117 --from 2026-08-01 --to 2026-09-08
 *   pnpm verify:molit --regions 11680,41117            (기간 생략 시 최근 30일)
 *
 * 명세는 "화면에서 10건을 눈으로 대조"지만, 그러면 표본이 너무 적고 사람이 지친다.
 * 여기서는 같은 조건의 **전 건**을 자동으로 맞대 본다.
 *
 * 왜 신뢰할 수 있나: 우리 데이터는 공공데이터포털 **API** 로 받았고, 대조 상대는
 * 실거래가 공개시스템 **웹** 이다. 같은 원천이지만 전달 경로가 달라서
 * 우리 파서·단위 변환·날짜 처리에 생긴 오류가 드러난다.
 * (같은 API 로 두 번 받아 비교하면 우리 실수는 절대 보이지 않는다)
 *
 * 비교 항목은 명세 그대로 **계약일 / 전용면적 / 층 / 거래금액** 이다.
 * 네 값이 모두 같아야 한 건이 일치한 것으로 센다.
 */
import { RegionCode, normalizeJibun } from '@apt/shared';
import { PrismaClient } from '@prisma/client';

import { parseTradeCsv, splitRegionText } from '../apps/api/src/external/domain/molit-csv-parser';
import { buildTradeSourceHash } from '../apps/api/src/trade/domain/source-hash';

import { downloadTradeCsv } from './lib/molit-web-csv';

const DEFAULT_DAYS = 30;

const iso = (date: Date): string => date.toISOString().slice(0, 10);

function parseArgs(argv: string[]) {
  const get = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const to = get('to') ?? iso(new Date());
  const from = get('from') ?? iso(new Date(Date.parse(to) - DEFAULT_DAYS * 86_400_000));
  const regions = (get('regions') ?? '').split(',').map((c) => c.trim()).filter((c) => c !== '');
  return { regions, from, to };
}

interface Row {
  hash: string;
  /** 이름을 뺀 열쇠 — 계약일·면적·층·금액이 같으면 같은 거래로 본다 */
  factsKey: string;
  label: string;
}

/**
 * 이름을 뺀 열쇠.
 *
 * API 와 웹이 같은 단지를 다르게 표기한다 (`강남브리즈힐(토지임대부아파트)` ↔
 * `(토지임대부아파트)강남브리즈힐`). 이건 우리 오류가 아니라 국토부 두 창구의 차이다.
 * 이름만 다르고 **계약일·면적·층·금액이 모두 같으면** 같은 거래로 보고 따로 보고한다.
 */
const factsKeyOf = (regionCode: string, sqm: number, date: Date, floor: number, price: number) =>
  [regionCode, sqm.toFixed(2), iso(date), floor, price].join('|');

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.regions.length === 0 || args.regions.some((c) => !/^\d{5}$/.test(c))) {
    console.error('\n대조할 시군구 코드를 지정하세요 (5자리).');
    console.error('  예: pnpm verify:molit --regions 41117 --from 2026-08-01 --to 2026-09-08\n');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const regions = await prisma.region.findMany({
    where: { isActive: true },
    select: { sigunguCode: true, sido: true, sigungu: true },
    distinct: ['sigunguCode'],
  });
  const sigunguByName = new Map<string, string>();
  for (const row of regions) {
    sigunguByName.set(`${row.sido} ${row.sigungu}`, row.sigunguCode);
    if (row.sido === row.sigungu) sigunguByName.set(row.sido, row.sigunguCode);
  }
  const isKnownSigungu = (name: string): boolean => sigunguByName.has(name);

  console.log(`\n■ 국토부 원본과 대조 — ${args.from} ~ ${args.to}`);
  let allPassed = true;

  for (const sigunguCode of args.regions) {
    const sidoCode = `${sigunguCode.slice(0, 2)}000`;
    process.stdout.write(`\n[${sigunguCode}] 국토부에서 내려받는 중… `);

    let csv: string;
    try {
      csv = await downloadTradeCsv({ sidoCode, sigunguCode, from: args.from, to: args.to });
    } catch (err) {
      console.log(`실패 — ${err instanceof Error ? err.message : String(err)}`);
      allPassed = false;
      continue;
    }

    // ── 국토부 쪽 ──────────────────────────────────────────────
    const parsed = parseTradeCsv(csv);
    const official = new Map<string, Row>();
    let canceledInOfficial = 0;
    let unresolvedRegion = 0;

    /*
      ⚠ 국토부는 같은 계약을 두 줄로 준다 — 원거래 한 줄, 해제거래 한 줄.
      그래서 "해제된 줄은 건너뛴다"로는 부족하다. 해제된 계약의 지문을 따로 모아 두고,
      **우리 쪽이 그 계약을 아직 살아 있는 거래로 들고 있지 않은지** 확인해야 한다.
      취소된 거래가 시세에 섞이는 것이 이 대조의 핵심 합격 기준이다 (ToDo.md 7.3).
    */
    const canceledHashes = new Set<string>();

    for (const row of parsed.items) {
      const place = splitRegionText(row.regionText, isKnownSigungu);
      if (place === null) {
        unresolvedRegion += 1;
        continue;
      }
      const dong = await prisma.region.findFirst({
        where: { sigunguCode: sigunguByName.get(place.sigunguName), dong: place.legalDongName },
        select: { code: true },
      });
      if (dong === null) {
        unresolvedRegion += 1;
        continue;
      }

      const hash = buildTradeSourceHash({
        regionCode: dong.code,
        rawName: row.apartmentName,
        exclusiveSqm: row.exclusiveSqm,
        priceManwon: row.priceManwon,
        contractedAt: row.contractedAt,
        floor: row.floor,
      });
      const label = `${row.apartmentName} ${row.exclusiveSqm}㎡ ${iso(row.contractedAt)} ${row.floor}층 ${row.priceManwon.toLocaleString()}만원`;
      if (row.isCanceled) {
        canceledInOfficial += 1;
        canceledHashes.add(hash);
        continue;
      }
      official.set(hash, {
        hash,
        factsKey: factsKeyOf(dong.code, row.exclusiveSqm, row.contractedAt, row.floor, row.priceManwon),
        label,
      });
    }

    // 해제된 계약은 살아 있는 거래 목록에서 빼고 본다 (같은 계약의 원거래 줄도 함께 온다)
    for (const hash of canceledHashes) official.delete(hash);

    // ── 우리 쪽 ────────────────────────────────────────────────
    const ours = await prisma.trade.findMany({
      where: {
        regionCode: { startsWith: sigunguCode },
        contractedAt: { gte: new Date(`${args.from}T00:00:00Z`), lte: new Date(`${args.to}T00:00:00Z`) },
        isCanceled: false,
      },
      select: { sourceHash: true, regionCode: true, rawName: true, exclusiveSqm: true, contractedAt: true, floor: true, priceManwon: true },
    });
    const ourHashes = new Set(ours.map((t) => t.sourceHash));
    const ourFacts = new Map(
      ours.map((t) => [
        factsKeyOf(t.regionCode, Number(t.exclusiveSqm), t.contractedAt, t.floor, t.priceManwon),
        t,
      ]),
    );

    const notFoundByHash = [...official.values()].filter((row) => !ourHashes.has(row.hash));
    // 이름만 다른 것은 우리 오류가 아니다 — 따로 센다
    const namingOnly = notFoundByHash.filter((row) => ourFacts.has(row.factsKey));
    const missing = notFoundByHash.filter((row) => !ourFacts.has(row.factsKey));

    const officialFacts = new Set([...official.values()].map((row) => row.factsKey));
    const extra = ours.filter(
      (t) =>
        !official.has(t.sourceHash) &&
        !canceledHashes.has(t.sourceHash) &&
        !officialFacts.has(
          factsKeyOf(t.regionCode, Number(t.exclusiveSqm), t.contractedAt, t.floor, t.priceManwon),
        ),
    );
    // ★ 국토부가 해제했는데 우리는 아직 살아 있는 거래로 들고 있는 것 — 시세를 왜곡한다
    const shouldBeCanceled = ours.filter((t) => canceledHashes.has(t.sourceHash));
    const matched = official.size - missing.length;

    const rate = official.size === 0 ? 100 : (matched / official.size) * 100;
    const ok = missing.length === 0 && extra.length === 0 && shouldBeCanceled.length === 0;
    if (!ok) allPassed = false;

    console.log(`\n  국토부 ${official.size}건 / 우리 ${ours.length}건`);
    console.log(`  ${ok ? '✅ 전부 일치' : '❌ 불일치'} — 일치 ${matched}건 (${rate.toFixed(1)}%)`);
    if (namingOnly.length > 0) {
      console.log(
        `  ⓘ 값은 같은데 단지명 표기만 다른 것 ${namingOnly.length}건 (국토부 API 와 웹의 표기 차이 — 우리 오류 아님)`,
      );
      for (const row of namingOnly.slice(0, 3)) console.log(`     · ${row.label}`);
    }
    if (canceledInOfficial > 0) {
      console.log(`  ⓘ 해제된 거래 ${canceledInOfficial}건은 양쪽 모두 목록에서 제외`);
    }
    if (unresolvedRegion > 0) {
      console.log(`  ⚠ 법정동을 찾지 못해 대조하지 못한 국토부 행 ${unresolvedRegion}건`);
    }

    if (shouldBeCanceled.length > 0) {
      console.log(`\n  ▸ ★ 해제된 거래인데 우리는 살아 있는 것으로 들고 있음 ${shouldBeCanceled.length}건`);
      console.log('     시세에 섞이므로 반드시 고쳐야 합니다.');
      for (const t of shouldBeCanceled.slice(0, 10)) {
        console.log(
          `     · ${t.rawName} ${Number(t.exclusiveSqm)}㎡ ${iso(t.contractedAt)} ${t.floor}층 ${t.priceManwon.toLocaleString()}만원`,
        );
      }
      if (shouldBeCanceled.length > 10) console.log(`     … 외 ${shouldBeCanceled.length - 10}건`);
    }

    if (missing.length > 0) {
      console.log(`\n  ▸ 국토부에는 있는데 우리에게 없는 것 ${missing.length}건`);
      for (const row of missing.slice(0, 10)) console.log(`     · ${row.label}`);
      if (missing.length > 10) console.log(`     … 외 ${missing.length - 10}건`);
    }
    if (extra.length > 0) {
      console.log(`\n  ▸ 우리에게만 있는 것 ${extra.length}건 (원본에서 취소·정정됐을 수 있음)`);
      for (const t of extra.slice(0, 10)) {
        console.log(
          `     · ${t.rawName} ${Number(t.exclusiveSqm)}㎡ ${iso(t.contractedAt)} ${t.floor}층 ${t.priceManwon.toLocaleString()}만원`,
        );
      }
      if (extra.length > 10) console.log(`     … 외 ${extra.length - 10}건`);
    }
  }

  console.log(
    allPassed
      ? '\n■ 결과: 합격 — 대조한 모든 건이 국토부 원본과 같습니다.\n'
      : '\n■ 결과: 확인 필요 — 위의 어긋난 항목을 보세요. (원본이 나중에 정정되면 차이가 날 수 있습니다)\n',
  );

  await prisma.$disconnect();
  process.exitCode = allPassed ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error('\n대조에 실패했습니다:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
