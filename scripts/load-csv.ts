/**
 * scripts/load-csv.ts — 국토부에서 내려받은 CSV 를 DB 에 넣는다
 *
 *   pnpm load-csv                        data/csv 폴더의 모든 .csv
 *   pnpm load-csv 파일.csv 다른파일.csv    파일 지정
 *   pnpm load-csv --dir ~/Downloads      폴더 지정
 *   pnpm load-csv --no-geocode           좌표 조회 건너뛰기 (지도에 안 찍히지만 빠르다)
 *
 * 왜 필요한가: 실거래가를 API 로 받으려면 공공데이터포털 승인 키가 있어야 한다.
 * 키 없이도 https://rt.molit.go.kr [조건별 자료제공]에서 사람이 직접 CSV 를 받을 수 있다.
 * 이 스크립트가 그 파일을 API 로 받은 것과 **똑같은 경로**로 적재한다 —
 * 단지 매칭·중복 차단·시세 캐시 무효화가 전부 그대로 돈다.
 *
 * 나중에 API 키가 생겨 `pnpm collect` 로 갈아타도 중복되지 않는다.
 * 중복 판정 지문(sourceHash)이 지역·단지명·면적·금액·계약일·층으로만 계산되기 때문에
 * 같은 거래는 CSV 로 넣었든 API 로 받았든 같은 지문을 갖는다.
 *
 * ⚠ collect.ts 와 같은 이유로 NestJS DI 를 쓰지 않고 직접 조립한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { RegionCode } from '@apt/shared';
import { PrismaClient } from '@prisma/client';

import { CollectionOrchestrator } from '../apps/api/src/collector/collection-orchestrator';
import { YearMonth } from '../apps/api/src/collector/domain/year-month';
import type { ComplexUpsertInput } from '../apps/api/src/complex';
import { normalizeComplexName } from '../apps/api/src/complex/domain/normalize-name';
import { PrismaComplexRepository } from '../apps/api/src/complex/prisma-complex.repository';
import { AppConfig } from '../apps/api/src/core/app.config';
import type { ILogger } from '../apps/api/src/core/logger';
import { CsvMolitClient } from '../apps/api/src/external/csv/csv-molit.client';
import {
  detectCsvKind,
  parseRentCsv,
  parseTradeCsv,
  type CsvRent,
  type CsvTrade,
} from '../apps/api/src/external/domain/molit-csv-parser';
import type { RawRent, RawTrade } from '../apps/api/src/external/domain/raw-types';
import type { IComplexInfoClient } from '../apps/api/src/external/ports';
import { KakaoGeocodeClient } from '../apps/api/src/external/http/kakao-geocode.client';
import { ComplexMatcher } from '../apps/api/src/matching/complex-matcher';
import { PrismaMatchRepository } from '../apps/api/src/matching/prisma-match.repository';
import { ApiQuotaTracker } from '../apps/api/src/observability/api-quota-tracker';
import { JobRunRecorder } from '../apps/api/src/observability/job-run-recorder';
import { PrismaJobRunStore } from '../apps/api/src/observability/prisma/prisma-job-run.store';
import { PrismaQuotaStore } from '../apps/api/src/observability/prisma/prisma-quota.store';
import { PrismaRegionRepository } from '../apps/api/src/region/prisma-region.repository';
import { RegionSearchService } from '../apps/api/src/region/region-search.service';
import { PrismaTradeRepository } from '../apps/api/src/trade/prisma-trade.repository';
import { TradeStatsService } from '../apps/api/src/trade/trade-stats.service';

import { decodeKoreanCsv } from './lib/decode-korean-csv';

const DEFAULT_DIR = 'data/csv';
/** 카카오 지오코딩 동시 요청 수. 너무 올리면 429 가 난다 */
const GEOCODE_CONCURRENCY = 4;

const logger: ILogger = {
  info: (ctx, msg) => console.log(`  [${ctx}] ${msg}`),
  warn: (ctx, msg) => console.warn(`  ⚠ [${ctx}] ${msg}`),
  error: (ctx, msg, err) => console.error(`  ✗ [${ctx}] ${msg}${err ? ` — ${err.message}` : ''}`),
};

/**
 * 단지 정보(K-apt) API 도 공공데이터포털 키가 필요하다.
 * CSV 경로에서는 단지를 CSV 자체에서 만들어 미리 넣으므로, 여기서는 아무것도 하지 않는다.
 */
const NO_COMPLEX_INFO: IComplexInfoClient = {
  fetchComplexList: () => Promise.resolve([]),
  fetchComplexDetail: () => Promise.resolve(null),
};

interface Args {
  files: string[];
  dir: string;
  geocode: boolean;
}

function parseArgs(argv: string[]): Args {
  const dirIndex = argv.indexOf('--dir');
  const dir = dirIndex === -1 ? DEFAULT_DIR : (argv[dirIndex + 1] ?? DEFAULT_DIR);

  const files = argv.filter(
    (arg, index) => !arg.startsWith('--') && index !== dirIndex + 1 && extname(arg) === '.csv',
  );

  return { files, dir, geocode: !argv.includes('--no-geocode') };
}

/** 지정한 파일이 없으면 폴더를 훑는다 */
function findCsvFiles(args: Args): string[] {
  if (args.files.length > 0) return args.files.map((file) => resolve(file));

  const dir = resolve(args.dir);
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === '.csv')
    .sort()
    .map((name) => join(dir, name));
}

function printDownloadGuide(dir: string): void {
  console.error('\n넣을 CSV 파일을 찾지 못했습니다.\n');
  console.error('국토부 실거래가 공개시스템에서 받아 오세요 (API 키 필요 없음):');
  console.error('  1) https://rt.molit.go.kr 접속 → 상단 [자료제공] > [조건별 자료제공]');
  console.error('  2) 아파트 / 매매 선택');
  console.error('  3) 계약일자 범위 지정 (한 번에 최대 1년)');
  console.error('  4) 시도·시군구 선택');
  console.error('  5) [CSV 다운] 클릭');
  console.error('  6) 전월세도 필요하면 [전월세] 로 바꿔 한 번 더 받기\n');
  console.error(`받은 파일을 ${dir} 폴더에 넣고 다시 실행하세요.`);
  console.error('  pnpm load-csv\n');
  console.error('※ 엑셀로 열어 저장하지 말고 받은 파일 그대로 쓰세요 (형식이 바뀝니다).\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const files = findCsvFiles(args);

  if (files.length === 0) {
    printDownloadGuide(args.dir);
    process.exit(1);
  }

  const config = AppConfig.load(process.env);
  const prisma = new PrismaClient();

  // ── 1. 파일 읽기 ────────────────────────────────────────────────
  console.log(`\n■ CSV 읽기 — ${files.length}개 파일`);

  const csvTrades: CsvTrade[] = [];
  const csvRents: CsvRent[] = [];

  for (const file of files) {
    const { text, encoding } = decodeKoreanCsv(readFileSync(file));
    const name = file.split('/').pop() ?? file;

    try {
      const kind = detectCsvKind(text);
      if (kind === 'trade') {
        const { items, skippedRows } = parseTradeCsv(text);
        csvTrades.push(...items);
        console.log(`  ${name} — 매매 ${items.length}건${skipNote(skippedRows)} [${encoding}]`);
      } else {
        const { items, skippedRows } = parseRentCsv(text);
        csvRents.push(...items);
        console.log(`  ${name} — 전월세 ${items.length}건${skipNote(skippedRows)} [${encoding}]`);
      }
    } catch (err) {
      console.error(`  ✗ ${name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (csvTrades.length === 0 && csvRents.length === 0) {
    console.error('\n읽어들인 거래가 없습니다. 파일 형식을 확인하세요.\n');
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 2. 시군구 이름 → 코드 ───────────────────────────────────────
  const sigunguByName = await loadSigunguIndex(prisma);
  const unresolved = new Set<string>();

  const rawTrades: RawTrade[] = [];
  for (const row of csvTrades) {
    const code = sigunguByName.get(row.sigunguName);
    if (code === undefined) {
      unresolved.add(row.sigunguName);
      continue;
    }
    const { sigunguName: _drop, ...rest } = row;
    rawTrades.push({ ...rest, sigunguCode: code });
  }

  const rawRents: RawRent[] = [];
  for (const row of csvRents) {
    const code = sigunguByName.get(row.sigunguName);
    if (code === undefined) {
      unresolved.add(row.sigunguName);
      continue;
    }
    const { sigunguName: _drop, ...rest } = row;
    rawRents.push({ ...rest, sigunguCode: code });
  }

  if (unresolved.size > 0) {
    console.log(`\n  ⚠ 지역을 찾지 못해 건너뛴 시군구: ${[...unresolved].join(', ')}`);
    console.log('    법정동 코드가 없는 지역입니다. `pnpm seed:region` 을 먼저 돌려 보세요.');
  }

  const molit = new CsvMolitClient(rawTrades, rawRents);
  const sigunguCodes = molit.sigunguCodes();
  const range = molit.monthRange();

  if (range === null || sigunguCodes.length === 0) {
    console.error('\n적재할 수 있는 거래가 없습니다.\n');
    await prisma.$disconnect();
    process.exit(1);
  }

  const counts = molit.counts();
  console.log(`\n■ 적재 대상`);
  console.log(`  지역   ${sigunguCodes.length}곳 (${sigunguCodes.join(', ')})`);
  console.log(`  기간   ${range.from} ~ ${range.to}`);
  console.log(`  매매   ${counts.trades}건 / 전월세 ${counts.rents}건`);

  // ── 3. 배선 ────────────────────────────────────────────────────
  const complexes = new PrismaComplexRepository(prisma);
  const trades = new PrismaTradeRepository(prisma);
  const tradeStats = new TradeStatsService(trades);
  const quota = new ApiQuotaTracker(new PrismaQuotaStore(prisma));
  const regions = new RegionSearchService(new PrismaRegionRepository(prisma));

  const lighten = (list: Awaited<ReturnType<PrismaComplexRepository['findByRegion']>>) =>
    list.map((c) => ({
      id: c.id,
      name: c.name,
      nameNormalized: c.nameNormalized,
      regionCode: c.regionCode.toString(),
      builtYear: c.builtYear,
    }));

  const matcher = new ComplexMatcher(
    {
      byRegion: async (code) => lighten(await complexes.findByRegion(RegionCode.parse(code))),
      bySigungu: async (code) => lighten(await complexes.findByRegionPrefix(code)),
    },
    new PrismaMatchRepository(prisma),
  );

  // ── 4. CSV 에서 단지 만들기 ─────────────────────────────────────
  // K-apt 단지정보 API 도 키가 필요하므로, 거래 데이터가 아는 만큼만 단지를 만든다.
  // 세대수·주차 대수는 모르지만 `Complex.qualityScore()` 가 결측을 중립(0.5)으로 다루므로
  // 점수가 부당하게 깎이지 않는다. 나중에 K-apt 키가 생기면 같은 단지에 덧씌워진다
  // (kaptCode 가 없으면 지역+정규화명+건축년도로 동일 단지를 찾아 update 한다).
  const complexInputs = await buildComplexInputs(csvTrades, csvRents, sigunguByName, regions);
  console.log(`\n■ 단지 만들기 — ${complexInputs.length}곳`);

  if (args.geocode && config.kakaoRestKey !== '') {
    const geocoder = new KakaoGeocodeClient(config, quota);
    await geocodeAll(complexInputs, geocoder);
  } else {
    const why = args.geocode ? '.env 의 KAKAO_REST_KEY 가 비어 있어' : '--no-geocode 옵션으로';
    console.log(`  ⓘ ${why} 좌표를 조회하지 않습니다 (지도에 표시되지 않음).`);
  }

  const complexResult = await complexes.upsertMany(complexInputs);
  console.log(
    `  +${complexResult.inserted} 신규 / ${complexResult.updated} 갱신` +
      (complexResult.skipped > 0 ? ` / ${complexResult.skipped} 건너뜀(지역코드 없음)` : ''),
  );

  // ── 5. 거래 적재 ────────────────────────────────────────────────
  const orchestrator = new CollectionOrchestrator({
    molit,
    complexInfo: NO_COMPLEX_INFO,
    geocode: {
      addressToCoordinate: () => Promise.resolve(null),
      searchPlaces: () => Promise.resolve([]),
    },
    complexes,
    trades,
    tradeStats,
    matcher,
    regions,
    recorder: new JobRunRecorder(new PrismaJobRunStore(prisma), logger),
    logger,
  });

  console.log('\n■ 거래 적재');
  const report = await orchestrator.runBackfill(
    sigunguCodes,
    YearMonth.parse(range.from),
    YearMonth.parse(range.to),
    'csv',
  );

  console.log('\n■ 결과');
  console.log(`  지역   ${report.regionsProcessed}곳 처리 (실패 ${report.regionsFailed})`);
  console.log(`  실거래 +${report.tradesInserted} (이미 있던 것 ${report.tradesSkipped})`);
  console.log(`  전월세 +${report.rentsInserted} (이미 있던 것 ${report.rentsSkipped})`);
  console.log(`  미매칭 ${report.unmatchedTrades}건 / 매칭실패 ${report.matchFailures}종`);
  console.log(`  소요   ${(report.durationMs / 1000).toFixed(1)}초`);

  if (report.errors.length > 0) {
    console.log('\n■ 오류');
    for (const error of report.errors.slice(0, 10)) console.log(`  · ${error}`);
    if (report.errors.length > 10) console.log(`  … 외 ${report.errors.length - 10}건`);
  }

  console.log('\n  브라우저에서 http://localhost:3000 을 열고 해당 지역을 검색해 보세요.\n');
  await prisma.$disconnect();
}

const skipNote = (skipped: number): string => (skipped > 0 ? ` (버린 줄 ${skipped})` : '');

/**
 * "서울특별시 강남구" → "11680" 색인.
 * 세종시는 regions 에 sido 와 sigungu 가 같은 값으로 들어 있는데
 * CSV 는 "세종특별자치시 도담동" 처럼 한 번만 쓴다 — 두 표기 모두 받아 준다.
 */
async function loadSigunguIndex(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.region.findMany({
    where: { isActive: true },
    select: { sigunguCode: true, sido: true, sigungu: true },
    distinct: ['sigunguCode'],
  });

  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(`${row.sido} ${row.sigungu}`, row.sigunguCode);
    if (row.sido === row.sigungu) index.set(row.sido, row.sigunguCode);
  }
  return index;
}

interface ComplexSeed {
  regionCode: string;
  name: string;
  address: string;
  /** 건축년도별 건수 — 가장 많이 나온 값을 쓴다 (동마다 다르게 적힌 경우가 있다) */
  years: Map<number, number>;
}

/** 거래·전월세에 나온 단지들을 (지역 + 정규화명) 기준으로 모은다 */
async function buildComplexInputs(
  csvTrades: CsvTrade[],
  csvRents: CsvRent[],
  sigunguByName: Map<string, string>,
  regions: RegionSearchService,
): Promise<ComplexUpsertInput[]> {
  const dongCache = new Map<string, string | null>();
  const seeds = new Map<string, ComplexSeed>();

  for (const row of [...csvTrades, ...csvRents]) {
    const sigunguCode = sigunguByName.get(row.sigunguName);
    if (sigunguCode === undefined) continue;

    const dongKey = `${sigunguCode}|${row.legalDongName}`;
    if (!dongCache.has(dongKey)) {
      const resolved = await regions.resolveDongCode(sigunguCode, row.legalDongName);
      dongCache.set(dongKey, resolved?.toString() ?? null);
    }
    const regionCode = dongCache.get(dongKey);
    if (regionCode === null || regionCode === undefined) continue;

    const key = `${regionCode}|${normalizeComplexName(row.apartmentName)}`;
    let seed = seeds.get(key);
    if (seed === undefined) {
      const jibun = row.jibun === '' ? '' : ` ${row.jibun}`;
      seed = {
        regionCode,
        name: row.apartmentName,
        address: `${row.sigunguName} ${row.legalDongName}${jibun}`.trim(),
        years: new Map(),
      };
      seeds.set(key, seed);
    }
    if (row.builtYear !== null) {
      seed.years.set(row.builtYear, (seed.years.get(row.builtYear) ?? 0) + 1);
    }
  }

  return [...seeds.values()].map((seed) => ({
    kaptCode: null, // CSV 는 공동주택 코드를 주지 않는다
    name: seed.name,
    regionCode: seed.regionCode,
    address: seed.address,
    lat: null,
    lng: null,
    households: 0, // 모름 — qualityScore 가 결측을 중립으로 다룬다
    buildingCount: 0,
    approvalDate: null,
    builtYear: mostCommon(seed.years),
    parkingCount: 0,
    heatingType: null,
  }));
}

/** 가장 많이 나온 건축년도. 동률이면 이른 쪽(단지 최초 준공) */
function mostCommon(years: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [year, count] of years) {
    if (count > bestCount || (count === bestCount && best !== null && year < best)) {
      best = year;
      bestCount = count;
    }
  }
  return best;
}

/** 주소 → 좌표. 실패해도 단지는 저장한다 (지도에만 안 찍힌다) */
async function geocodeAll(
  inputs: ComplexUpsertInput[],
  geocoder: KakaoGeocodeClient,
): Promise<void> {
  let done = 0;
  let found = 0;
  // 실패를 조용히 삼키면 "왜 지도에 안 찍히지"로 헤매게 된다. 첫 오류는 그대로 보여 준다.
  let failed = 0;
  let firstError: string | null = null;

  for (let offset = 0; offset < inputs.length; offset += GEOCODE_CONCURRENCY) {
    const chunk = inputs.slice(offset, offset + GEOCODE_CONCURRENCY);

    await Promise.all(
      chunk.map(async (input) => {
        try {
          const coordinate = await geocoder.addressToCoordinate(input.address);
          if (coordinate !== null) {
            input.lat = coordinate.lat;
            input.lng = coordinate.lng;
            found += 1;
          }
        } catch (err) {
          failed += 1;
          firstError ??= err instanceof Error ? err.message : String(err);
        }
        done += 1;
      }),
    );

    if (done % 40 === 0 || done === inputs.length) {
      process.stdout.write(`\r  좌표 조회 ${done}/${inputs.length} (찾음 ${found})`);
    }
  }
  process.stdout.write('\n');

  if (failed > 0) {
    console.log(`  ⚠ ${failed}곳은 조회 중 오류가 났습니다 — 지도에만 안 찍히고 검색·시세는 됩니다.`);
    console.log(`    첫 오류: ${firstError}`);
  }
  if (found < inputs.length - failed) {
    console.log(`  ⓘ ${inputs.length - failed - found}곳은 주소로 좌표를 찾지 못했습니다 (번지가 없거나 폐지된 주소).`);
  }
}

main().catch((err: unknown) => {
  console.error('\nCSV 적재에 실패했습니다:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
