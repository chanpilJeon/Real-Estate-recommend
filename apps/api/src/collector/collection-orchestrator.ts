import type { ComplexUpsertInput, IComplexRepository } from '../complex';
import type { ILogger } from '../core';
import type { IComplexInfoClient, IGeocodeClient, IMolitClient, RawTrade, RawRent } from '../external';
import type { ComplexMatcher } from '../matching';
import type { JobRunRecorder, JobContext } from '../observability';
import type { RegionSearchService } from '../region';
import type { ITradeRepository, TradeStatsService, TradeUpsertInput, RentUpsertInput } from '../trade';

import { emptyReport, type CollectionReport } from './domain/collection-report';
import { YearMonth } from './domain/year-month';

const CTX = 'collector';

/** 매일 수집하는 증분 구간. 실거래는 계약 후 30일 내 신고라 지난달까지 다시 훑는다 */
export const INCREMENTAL_MONTHS = 2;

export const JOB_DAILY = 'daily-collect';
export const JOB_BACKFILL = 'backfill-collect';

export interface CollectorDeps {
  molit: IMolitClient;
  complexInfo: IComplexInfoClient;
  geocode: IGeocodeClient;
  complexes: IComplexRepository;
  trades: ITradeRepository;
  tradeStats: TradeStatsService;
  matcher: ComplexMatcher;
  regions: RegionSearchService;
  recorder: JobRunRecorder;
  logger: ILogger;
}

/**
 * 수집 오케스트레이션 (ToDo.md 3.11).
 *
 * "언제·무엇을·어떤 순서로" 수집할지만 정한다. 실제 파싱·매칭·저장은 하위 모듈이 한다.
 *
 * **지역 하나가 실패해도 전체를 멈추지 않는다.** 강남구 수집이 API 오류로 깨졌다고
 * 하남시까지 못 받으면, 하루치 데이터가 통째로 비어버린다.
 */
export class CollectionOrchestrator {
  constructor(
    private readonly deps: CollectorDeps,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 매일 06:00 — 설정된 지역의 최근 2개월 증분 */
  runDailyIncremental(sigunguCodes: string[], triggeredBy = 'cron'): Promise<CollectionReport> {
    const current = YearMonth.fromDate(this.now());
    const from = current.shift(-(INCREMENTAL_MONTHS - 1));
    return this.run(JOB_DAILY, sigunguCodes, from, current, triggeredBy);
  }

  /** 관리자 수동 트리거 — 지역·기간을 지정해 과거 데이터를 채운다 */
  runBackfill(
    sigunguCodes: string[],
    from: YearMonth,
    to: YearMonth,
    triggeredBy = 'admin',
  ): Promise<CollectionReport> {
    return this.run(JOB_BACKFILL, sigunguCodes, from, to, triggeredBy);
  }

  private async run(
    jobName: string,
    sigunguCodes: string[],
    from: YearMonth,
    to: YearMonth,
    triggeredBy: string,
  ): Promise<CollectionReport> {
    const startedAt = Date.now();
    const months = from.rangeTo(to);
    const report = emptyReport();

    if (sigunguCodes.length === 0) {
      report.errors.push(
        '수집 대상 지역이 설정되지 않았습니다. .env 의 COLLECT_SIGUNGU_CODES 를 확인하세요.',
      );
      this.deps.logger.warn(CTX, report.errors[0]!);
      return report;
    }
    if (months.length === 0) {
      report.errors.push(`기간이 올바르지 않습니다 (${from.toString()} ~ ${to.toString()})`);
      return report;
    }

    return this.deps.recorder.run(
      jobName,
      async (ctx: JobContext) => {
        // 배치마다 후보 목록을 새로 읽는다 (직전 실행의 단지 목록을 쓰면 안 된다)
        this.deps.matcher.resetCache();

        for (const sigunguCode of sigunguCodes) {
          try {
            await this.collectRegion(sigunguCode, months, report, ctx);
            report.regionsProcessed += 1;
          } catch (err) {
            // 한 지역의 실패를 여기서 가둔다 — 나머지 지역은 계속 받는다
            report.regionsFailed += 1;
            const message = err instanceof Error ? err.message : String(err);
            report.errors.push(`[${sigunguCode}] ${message}`);
            this.deps.logger.error(
              CTX,
              `지역 ${sigunguCode} 수집 실패 — 나머지 지역은 계속 진행합니다`,
              err instanceof Error ? err : new Error(message),
            );
          }
        }

        // 새 데이터가 들어왔으므로 가격 집계 캐시를 버린다
        this.deps.tradeStats.invalidateCache();

        report.monthsProcessed = months.length;
        report.durationMs = Date.now() - startedAt;
        this.logSummary(jobName, report, from, to);
        return report;
      },
      { triggeredBy, params: { sigunguCodes, from: from.toString(), to: to.toString() } },
    );
  }

  private async collectRegion(
    sigunguCode: string,
    months: YearMonth[],
    report: CollectionReport,
    ctx: JobContext,
  ): Promise<void> {
    // 1) 단지 마스터를 먼저 맞춰 둔다 — 매칭할 후보가 있어야 거래가 붙는다
    await this.syncComplexes(sigunguCode, report, ctx);

    // 2) 달마다 실거래·전월세를 받아 매칭 후 적재
    for (const month of months) {
      const [rawTrades, rawRents] = await Promise.all([
        this.deps.molit.fetchTrades(sigunguCode, month.toString()),
        this.deps.molit.fetchRents(sigunguCode, month.toString()),
      ]);

      const trades = await this.toTradeInputs(sigunguCode, rawTrades, report);
      const rents = await this.toRentInputs(sigunguCode, rawRents, report);

      const [tradeResult, rentResult] = await Promise.all([
        this.deps.trades.bulkUpsertTrades(trades),
        this.deps.trades.bulkUpsertRents(rents),
      ]);

      report.tradesInserted += tradeResult.inserted;
      report.tradesSkipped += tradeResult.skipped;
      report.rentsInserted += rentResult.inserted;
      report.rentsSkipped += rentResult.skipped;
      ctx.addInserted(tradeResult.inserted + rentResult.inserted);
    }
  }

  /** 공동주택 단지 목록·상세를 받아 마스터에 반영한다 */
  private async syncComplexes(
    sigunguCode: string,
    report: CollectionReport,
    ctx: JobContext,
  ): Promise<void> {
    const list = await this.deps.complexInfo.fetchComplexList(sigunguCode);
    if (list.length === 0) return;

    const inputs: ComplexUpsertInput[] = [];
    for (const summary of list) {
      const detail = await this.deps.complexInfo.fetchComplexDetail(summary.kaptCode);
      if (detail === null) continue;

      const regionCode = await this.deps.regions.resolveDongCode(sigunguCode, summary.dong);
      if (regionCode === null) {
        report.errors.push(`[${sigunguCode}] 법정동을 찾지 못함: ${summary.dong}`);
        continue;
      }

      // 좌표는 없어도 단지는 저장한다 — 지도에만 안 찍힐 뿐 검색·통계는 된다
      const coordinate = await this.deps.geocode.addressToCoordinate(detail.address).catch(() => null);

      inputs.push({
        kaptCode: detail.kaptCode,
        name: detail.name,
        regionCode: regionCode.toString(),
        address: detail.address,
        lat: coordinate?.lat ?? null,
        lng: coordinate?.lng ?? null,
        households: detail.households,
        buildingCount: detail.buildingCount,
        approvalDate: detail.approvalDate,
        builtYear: detail.approvalDate?.getUTCFullYear() ?? null,
        parkingCount: detail.parkingCount,
        heatingType: detail.heatingType,
      });
    }

    const result = await this.deps.complexes.upsertMany(inputs);
    report.complexesInserted += result.inserted;
    report.complexesUpdated += result.updated;
    ctx.addUpdated(result.updated);

    // 단지가 새로 생겼으니 매칭 후보를 다시 읽어야 한다
    this.deps.matcher.resetCache();
  }

  private async toTradeInputs(
    sigunguCode: string,
    raws: RawTrade[],
    report: CollectionReport,
  ): Promise<TradeUpsertInput[]> {
    const inputs: TradeUpsertInput[] = [];

    for (const raw of raws) {
      const regionCode = await this.deps.regions.resolveDongCode(sigunguCode, raw.legalDongName);
      if (regionCode === null) continue;

      const complexId = await this.resolveComplexId(regionCode.toString(), raw.apartmentName, raw.builtYear, report);

      inputs.push({
        complexId,
        regionCode: regionCode.toString(),
        rawName: raw.apartmentName,
        exclusiveSqm: raw.exclusiveSqm,
        priceManwon: raw.priceManwon,
        contractedAt: raw.contractedAt,
        floor: raw.floor,
        builtYear: raw.builtYear,
        isCanceled: raw.isCanceled,
      });
    }

    return inputs;
  }

  private async toRentInputs(
    sigunguCode: string,
    raws: RawRent[],
    report: CollectionReport,
  ): Promise<RentUpsertInput[]> {
    const inputs: RentUpsertInput[] = [];

    for (const raw of raws) {
      const regionCode = await this.deps.regions.resolveDongCode(sigunguCode, raw.legalDongName);
      if (regionCode === null) continue;

      inputs.push({
        complexId: await this.resolveComplexId(
          regionCode.toString(),
          raw.apartmentName,
          raw.builtYear,
          report,
        ),
        regionCode: regionCode.toString(),
        rawName: raw.apartmentName,
        exclusiveSqm: raw.exclusiveSqm,
        depositManwon: raw.depositManwon,
        monthlyManwon: raw.monthlyManwon,
        contractedAt: raw.contractedAt,
        floor: raw.floor,
      });
    }

    return inputs;
  }

  /**
   * 단지 매칭. 실패해도 거래를 버리지 않는다 —
   * `complexId = null` 로 저장해 두고, 나중에 사람이 보정하면 되살아난다. (ToDo.md 4.3)
   */
  private async resolveComplexId(
    regionCode: string,
    rawName: string,
    builtYear: number | null,
    report: CollectionReport,
  ): Promise<number | null> {
    const result = await this.deps.matcher.match({ regionCode, rawName, builtYear });

    if (result.status === 'matched') return result.complexId;

    report.unmatchedTrades += 1;
    if (result.status === 'failed') report.matchFailures += 1;
    return null;
  }

  private logSummary(
    jobName: string,
    report: CollectionReport,
    from: YearMonth,
    to: YearMonth,
  ): void {
    this.deps.logger.info(
      CTX,
      `${jobName} 완료: ${from.toString()}~${to.toString()} · ` +
        `지역 ${report.regionsProcessed}곳(실패 ${report.regionsFailed}) · ` +
        `단지 +${report.complexesInserted}/~${report.complexesUpdated} · ` +
        `실거래 +${report.tradesInserted}(중복 ${report.tradesSkipped}) · ` +
        `전월세 +${report.rentsInserted} · 미매칭 ${report.unmatchedTrades}건`,
    );
  }
}
