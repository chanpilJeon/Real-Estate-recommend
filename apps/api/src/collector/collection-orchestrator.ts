import { normalizeJibun } from '@apt/shared';

import { normalizeComplexName, type ComplexUpsertInput, type IComplexRepository } from '../complex';
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

/** 카카오 지오코딩 동시 요청 수. 너무 올리면 429 가 난다 */
const GEOCODE_CONCURRENCY = 8;

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
    // 1) 이 지역·기간의 원본을 먼저 다 받는다.
    //    단지를 만들려면 어떤 단지가 거래됐는지 전부 알아야 하기 때문이다.
    const fetched: { rawTrades: RawTrade[]; rawRents: RawRent[] }[] = [];
    for (const month of months) {
      const [rawTrades, rawRents] = await Promise.all([
        this.deps.molit.fetchTrades(sigunguCode, month.toString()),
        this.deps.molit.fetchRents(sigunguCode, month.toString()),
      ]);
      fetched.push({ rawTrades, rawRents });
    }

    // 2) **실거래에 나온 단지를 마스터로 삼는다.**
    //    K-apt 목록만 믿으면 두 API 의 단지명이 달라 거래가 붙지 못한다
    //    (실거래 '한보미도맨션2' ↔ K-apt '대치미도맨션').
    await this.seedComplexesFromTrades(sigunguCode, fetched, report);

    // 3) K-apt 로 세대수·주차·난방을 덧씌운다. **없는 단지는 만들지 않는다** —
    //    거래가 한 건도 없는 단지를 만들면 같은 아파트가 목록에 두 번 나온다.
    await this.syncComplexes(sigunguCode, report, ctx);

    // 4) 매칭 후 적재
    this.deps.matcher.resetCache();
    for (const { rawTrades, rawRents } of fetched) {
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

  /**
   * 실거래·전월세에 나온 단지를 마스터에 반영한다.
   *
   * 실거래는 세대수·주차를 알려주지 않으므로 0(=모름)으로 둔다.
   * `Complex.qualityScore()` 가 결측을 중립으로 다루므로 점수가 부당하게 깎이지 않고,
   * K-apt 이름이 맞는 단지는 3) 에서 채워진다.
   */
  private async seedComplexesFromTrades(
    sigunguCode: string,
    fetched: { rawTrades: RawTrade[]; rawRents: RawRent[] }[],
    report: CollectionReport,
  ): Promise<void> {
    const seeds = new Map<string, ComplexUpsertInput>();
    // 법정동 이름은 같은 값이 수천 번 반복된다 — 한 번만 조회한다
    const dongCache = new Map<string, { code: string; fullName: string } | null>();

    for (const { rawTrades, rawRents } of fetched) {
      for (const raw of [...rawTrades, ...rawRents]) {
        const dong = await this.resolveDong(sigunguCode, raw.legalDongName, dongCache);
        if (dong === null) continue;

        const key = `${dong.code}|${normalizeComplexName(raw.apartmentName)}`;
        if (seeds.has(key)) continue;

        const jibun = raw.jibun === '' ? '' : ` ${raw.jibun}`;
        seeds.set(key, {
          kaptCode: null, // 실거래는 공동주택 코드를 주지 않는다
          name: raw.apartmentName,
          regionCode: dong.code,
          address: `${dong.fullName}${jibun}`,
          // 이름이 K-apt 와 달라도 번지가 같으면 나중에 이어붙는다
          jibun: normalizeJibun(raw.jibun),
          lat: null,
          lng: null,
          households: 0, // 모름 — qualityScore 가 결측을 중립으로 다룬다
          buildingCount: 0,
          approvalDate: null,
          builtYear: raw.builtYear,
          parkingCount: 0,
          heatingType: null,
        });
      }
    }

    if (seeds.size === 0) return;

    const inputs = [...seeds.values()];
    await this.geocodeNewComplexes(sigunguCode, inputs);

    const result = await this.deps.complexes.upsertMany(inputs);
    report.complexesInserted += result.inserted;
    report.complexesUpdated += result.updated;
  }

  /** 법정동 이름 → 코드와 전체 주소 ("서울특별시 강남구 역삼동"). 결과를 캐시한다 */
  private async resolveDong(
    sigunguCode: string,
    dongName: string,
    cache: Map<string, { code: string; fullName: string } | null>,
  ): Promise<{ code: string; fullName: string } | null> {
    const cached = cache.get(dongName);
    if (cached !== undefined) return cached;

    const code = await this.deps.regions.resolveDongCode(sigunguCode, dongName);
    if (code === null) {
      cache.set(dongName, null);
      return null;
    }

    const region = await this.deps.regions.findByCode(code.toString());
    const resolved = { code: code.toString(), fullName: region?.fullName() ?? dongName };
    cache.set(dongName, resolved);
    return resolved;
  }

  /** 아직 좌표를 모르는 단지만 조회한다 (이미 아는 곳까지 다시 물으면 한도가 빨리 닳는다) */
  private async geocodeNewComplexes(
    sigunguCode: string,
    inputs: ComplexUpsertInput[],
  ): Promise<void> {
    const existing = await this.deps.complexes.findByRegionPrefix(sigunguCode);
    const known = new Set(
      existing
        .filter((complex) => complex.coordinate !== null)
        .map((complex) => `${complex.regionCode.toString()}|${complex.nameNormalized}`),
    );

    const todo = inputs.filter(
      (input) => !known.has(`${input.regionCode}|${normalizeComplexName(input.name)}`),
    );

    // 한 건씩 순서대로 물으면 단지 만 곳에 30분이 걸린다. 조금씩 겹쳐 보낸다.
    for (let offset = 0; offset < todo.length; offset += GEOCODE_CONCURRENCY) {
      await Promise.all(
        todo.slice(offset, offset + GEOCODE_CONCURRENCY).map(async (input) => {
          // 좌표는 없어도 단지는 저장한다 — 지도에만 안 찍힐 뿐 검색·통계는 된다
          const coordinate = await this.deps.geocode
            .addressToCoordinate(input.address)
            .catch(() => null);
          if (coordinate !== null) {
            input.lat = coordinate.lat;
            input.lng = coordinate.lng;
          }
        }),
      );
    }
  }

  /**
   * 공동주택 단지 목록·상세로 **기존 단지를 보강한다.**
   * 어떤 단지가 존재하는지는 실거래가 정하므로 여기서는 새로 만들지 않는다.
   */
  private async syncComplexes(
    sigunguCode: string,
    report: CollectionReport,
    ctx: JobContext,
  ): Promise<void> {
    const list = await this.deps.complexInfo.fetchComplexList(sigunguCode);
    if (list.length === 0) return;

    /*
      단지 상세는 **단지당 2회**(기본정보+상세정보) 호출한다. 공공 API 하루 한도가
      가장 먼저 닳는 곳이라, 받아 봐야 소용없는 것을 미리 걸러 낸다.

      ① 실거래에 나오지 않은 단지 — 우리 목록에 없으니 보강 대상이 아니다.
         (K-apt 목록의 절반 이상이 여기 해당한다. 이름이 달라 못 붙는 것 포함)
      ② 이미 세대수를 아는 단지 — 세대수·주차는 거의 변하지 않으니 다시 받지 않는다.
    */
    const existing = await this.deps.complexes.findByRegionPrefix(sigunguCode);
    const needsEnrichment = new Set(
      existing.filter((c) => c.households <= 0).map((c) => c.nameNormalized),
    );
    if (needsEnrichment.size === 0) return;

    const inputs: ComplexUpsertInput[] = [];
    for (const summary of list) {
      if (!needsEnrichment.has(normalizeComplexName(summary.name))) continue;

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
        jibun: detail.jibun,
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

    const result = await this.deps.complexes.upsertMany(inputs, { createMissing: false });
    report.complexesUpdated += result.updated;
    ctx.addUpdated(result.updated);
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
