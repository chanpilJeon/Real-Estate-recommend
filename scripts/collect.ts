/**
 * scripts/collect.ts — 수집을 손으로 실행한다
 *
 *   pnpm collect                                  .env 의 COLLECT_SIGUNGU_CODES, 최근 2개월
 *   pnpm collect --regions 11680,41450            지역 지정
 *   pnpm collect --from 202301 --to 202609        기간 지정 (과거 채우기)
 *   pnpm collect --regions 41117 --from 202301    수원 영통구 3년치
 *
 * 평소에는 매일 06:00 cron 이 돌지만, 노트북이 꺼져 있으면 그 시간에 돌지 않는다.
 * 그래서 손으로 돌릴 방법이 필요하다.
 *
 * ⚠ NestJS 의존성 주입을 쓰지 않고 직접 조립한다.
 *   `tsx` 는 NestJS 가 쓰는 데코레이터 타입 메타데이터를 만들지 못해 앱을 부팅할 수 없다.
 *   조립 내용은 `apps/api/src/collector/collector.module.ts` 와 같아야 한다.
 */
import { RegionCode } from '@apt/shared';
import { PrismaClient } from '@prisma/client';

import { CollectionOrchestrator } from '../apps/api/src/collector/collection-orchestrator';
import { YearMonth } from '../apps/api/src/collector/domain/year-month';
import { PrismaComplexRepository } from '../apps/api/src/complex/prisma-complex.repository';
import { AppConfig } from '../apps/api/src/core/app.config';
import type { ILogger } from '../apps/api/src/core/logger';
import { ComplexInfoHttpClient } from '../apps/api/src/external/http/complex-info-http.client';
import { KakaoGeocodeClient } from '../apps/api/src/external/http/kakao-geocode.client';
import { MolitHttpClient } from '../apps/api/src/external/http/molit-http.client';
import { FakeComplexInfoClient } from '../apps/api/src/external/fake/fake-complex-info.client';
import { FakeGeocodeClient } from '../apps/api/src/external/fake/fake-geocode.client';
import { FakeMolitClient } from '../apps/api/src/external/fake/fake-molit.client';
import { ComplexMatcher } from '../apps/api/src/matching/complex-matcher';
import { PrismaMatchRepository } from '../apps/api/src/matching/prisma-match.repository';
import { ApiQuotaTracker } from '../apps/api/src/observability/api-quota-tracker';
import { JobRunRecorder } from '../apps/api/src/observability/job-run-recorder';
import { PrismaJobRunStore } from '../apps/api/src/observability/prisma/prisma-job-run.store';
import { PrismaQuotaStore } from '../apps/api/src/observability/prisma/prisma-quota.store';
import { PrismaRegionRepository } from '../apps/api/src/region/prisma-region.repository';
import { RegionSearchService } from '../apps/api/src/region/region-search.service';
import { SAMPLE_SIGUNGU_CODES } from '../apps/api/src/external/fake/sample-data';
import { PrismaTradeRepository } from '../apps/api/src/trade/prisma-trade.repository';
import { TradeStatsService } from '../apps/api/src/trade/trade-stats.service';

/** 데모 모드가 실제로 데이터를 가진 지역 */
const DEMO_REGIONS = SAMPLE_SIGUNGU_CODES;

interface Args {
  regions: string[] | null;
  from: YearMonth | null;
  to: YearMonth | null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };

  const regionsRaw = get('regions');
  const fromRaw = get('from');
  const toRaw = get('to');

  return {
    regions:
      regionsRaw === null
        ? null
        : regionsRaw.split(',').map((c) => c.trim()).filter((c) => c !== ''),
    from: fromRaw === null ? null : YearMonth.parse(fromRaw),
    to: toRaw === null ? null : YearMonth.parse(toRaw),
  };
}

/** 진행 상황을 보여주는 콘솔 로거 */
const logger: ILogger = {
  info: (ctx, msg) => console.log(`  [${ctx}] ${msg}`),
  warn: (ctx, msg) => console.warn(`  ⚠ [${ctx}] ${msg}`),
  error: (ctx, msg, err) => console.error(`  ✗ [${ctx}] ${msg}${err ? ` — ${err.message}` : ''}`),
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = AppConfig.load(process.env);
  const prisma = new PrismaClient();

  const regions = args.regions ?? config.collectSigunguCodes;
  if (regions.length === 0) {
    console.error('\n수집할 지역이 없습니다.');
    console.error('  .env 의 COLLECT_SIGUNGU_CODES 를 채우거나 --regions 로 지정하세요.');
    console.error('  예: pnpm collect --regions 11680,41450\n');
    process.exit(1);
  }

  const complexes = new PrismaComplexRepository(prisma);
  const trades = new PrismaTradeRepository(prisma);
  const tradeStats = new TradeStatsService(trades);
  const quota = new ApiQuotaTracker(new PrismaQuotaStore(prisma));

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

  const orchestrator = new CollectionOrchestrator({
    molit: config.demoMode ? new FakeMolitClient() : new MolitHttpClient(config, quota, logger),
    complexInfo: config.demoMode
      ? new FakeComplexInfoClient()
      : new ComplexInfoHttpClient(config, quota),
    geocode: config.demoMode ? new FakeGeocodeClient() : new KakaoGeocodeClient(config, quota),
    complexes,
    trades,
    tradeStats,
    matcher,
    regions: new RegionSearchService(new PrismaRegionRepository(prisma)),
    recorder: new JobRunRecorder(new PrismaJobRunStore(prisma), logger),
    logger,
  });

  const mode = config.demoMode ? '데모 (샘플 데이터)' : '실제 공공 API';
  console.log(`\n■ 수집 시작 — ${mode}`);
  console.log(`  지역: ${regions.join(', ')}`);

  const report =
    args.from === null
      ? await orchestrator.runDailyIncremental(regions, 'manual')
      : await orchestrator.runBackfill(
          regions,
          args.from,
          args.to ?? YearMonth.fromDate(new Date()),
          'manual',
        );

  console.log('\n■ 결과');
  console.log(`  지역   ${report.regionsProcessed}곳 처리 (실패 ${report.regionsFailed})`);
  console.log(`  기간   ${report.monthsProcessed}개월`);
  console.log(`  단지   +${report.complexesInserted} / 갱신 ${report.complexesUpdated}`);
  console.log(`  실거래 +${report.tradesInserted} (이미 있던 것 ${report.tradesSkipped})`);
  console.log(`  전월세 +${report.rentsInserted} (이미 있던 것 ${report.rentsSkipped})`);
  console.log(`  미매칭 ${report.unmatchedTrades}건 / 매칭실패 ${report.matchFailures}종`);
  console.log(`  소요   ${(report.durationMs / 1000).toFixed(1)}초`);

  if (report.errors.length > 0) {
    console.log('\n■ 오류');
    for (const error of report.errors.slice(0, 10)) console.log(`  · ${error}`);
    if (report.errors.length > 10) console.log(`  … 외 ${report.errors.length - 10}건`);
  }

  // "성공했는데 아무것도 안 들어옴" 을 그냥 두면 원인을 찾느라 헤맨다
  const nothingCollected =
    report.complexesInserted === 0 &&
    report.complexesUpdated === 0 &&
    report.tradesInserted === 0 &&
    report.tradesSkipped === 0;

  if (nothingCollected && config.demoMode) {
    console.log('\n  ⚠ 이 지역에는 데모 데이터가 없습니다.');
    console.log(`    데모 모드가 가진 지역: ${DEMO_REGIONS.join(', ')}`);
    console.log('    다른 지역의 실제 데이터를 받으려면 공공데이터포털 API 키가 필요합니다.');
  } else if (nothingCollected) {
    console.log('\n  ⚠ 수집된 데이터가 없습니다. 아래를 확인해 보세요.');
    console.log('    · 시군구 코드가 맞는지 (5자리)');
    console.log('    · 요청한 기간에 실제로 거래가 있었는지');
    console.log('    · MOLIT_API_KEY 가 승인된 키인지 (docs/API-VERIFICATION.md)');
  }

  if (config.demoMode) {
    console.log('\n  ⓘ 데모 모드입니다. 실제 데이터를 받으려면 .env 에');
    console.log('    MOLIT_API_KEY 를 넣고 DEMO_MODE=false 로 바꾸세요.');
    console.log('    (docs/API-VERIFICATION.md 참조)');
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error('\n수집에 실패했습니다:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
