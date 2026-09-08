import { Coordinate, RegionCode } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { CollectionOrchestrator, INCREMENTAL_MONTHS, type CollectorDeps } from './collection-orchestrator';
import { YearMonth } from './domain/year-month';

const NOW = new Date('2026-09-04T00:00:00Z');
const 강남구 = '11680';
const 하남시 = '41450';

/** 테스트마다 갈아끼우는 가짜 의존성 묶음 */
function buildDeps(overrides: Partial<CollectorDeps> = {}): {
  deps: CollectorDeps;
  spies: {
    tradesInserted: string[];
    resetCacheCalls: number;
    invalidateCalls: number;
    jobs: { name: string; triggeredBy: string }[];
    errors: string[];
  };
} {
  const spies = {
    tradesInserted: [] as string[],
    resetCacheCalls: 0,
    invalidateCalls: 0,
    jobs: [] as { name: string; triggeredBy: string }[],
    errors: [] as string[],
  };

  const deps: CollectorDeps = {
    molit: {
      fetchTrades: (sigunguCode, yearMonth) =>
        Promise.resolve([
          {
            sigunguCode,
            legalDongName: '역삼동',
            apartmentName: '래미안역삼',
            exclusiveSqm: 84.97,
            priceManwon: 180_000,
            contractedAt: new Date(`${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-10T00:00:00Z`),
            floor: 10,
            builtYear: 2005,
            isCanceled: false,
            jibun: '736-1',
          },
        ]),
      fetchRents: () => Promise.resolve([]),
    },
    complexInfo: {
      fetchComplexList: (sigunguCode) =>
        Promise.resolve([
          { kaptCode: `K-${sigunguCode}`, name: '래미안역삼', sido: '서울', sigungu: '강남구', dong: '역삼동' },
        ]),
      fetchComplexDetail: (kaptCode) =>
        Promise.resolve({
          kaptCode,
          name: '래미안역삼',
          address: '서울 강남구 역삼동 736-1',
          jibun: '736-1',
          households: 1284,
          buildingCount: 12,
          approvalDate: new Date('2005-11-30T00:00:00Z'),
          parkingCount: 1650,
          heatingType: '지역난방',
        }),
    },
    geocode: {
      addressToCoordinate: () => Promise.resolve(new Coordinate(37.4998, 127.0374)),
      searchPlaces: () => Promise.resolve([]),
    },
    complexes: {
      findById: () => Promise.resolve(null),
      findByRegion: () => Promise.resolve([]),
      findByRegionPrefix: () => Promise.resolve([]),
      upsertMany: (items) => Promise.resolve({ inserted: items.length, updated: 0, skipped: 0 }),
      updateNearestPoi: () => Promise.resolve(),
      countAll: () => Promise.resolve(0),
    },
    trades: {
      bulkUpsertTrades: (t) => {
        spies.tradesInserted.push(...t.map((x) => x.rawName));
        return Promise.resolve({ inserted: t.length, skipped: 0 });
      },
      bulkUpsertRents: (r) => Promise.resolve({ inserted: r.length, skipped: 0 }),
      findTrades: () => Promise.resolve([]),
      findRents: () => Promise.resolve([]),
      latestContractDate: () => Promise.resolve(null),
      countTrades: () => Promise.resolve(0),
      distinctAreas: () => Promise.resolve([]),
      relinkByRawName: () => Promise.resolve(0),
      findTradesForComplexes: () => Promise.resolve([]),
    },
    tradeStats: {
      invalidateCache: () => {
        spies.invalidateCalls += 1;
      },
    } as unknown as CollectorDeps['tradeStats'],
    matcher: {
      resetCache: () => {
        spies.resetCacheCalls += 1;
      },
      match: () => Promise.resolve({ status: 'matched' as const, complexId: 7, confidence: 1, via: 'exact' as const }),
    } as unknown as CollectorDeps['matcher'],
    regions: {
      resolveDongCode: (_sgg: string, _dong: string) => Promise.resolve(RegionCode.parse('1168010100')),
      // 실거래에서 단지를 만들 때 주소를 붙이려고 부른다
      findByCode: (_code: string) =>
        Promise.resolve({ fullName: () => '서울특별시 강남구 역삼동' }),
    } as unknown as CollectorDeps['regions'],
    recorder: {
      run: (name: string, fn: (ctx: unknown) => Promise<unknown>, options?: { triggeredBy?: string }) => {
        spies.jobs.push({ name, triggeredBy: options?.triggeredBy ?? 'cron' });
        return fn({ addInserted: () => {}, addUpdated: () => {}, log: () => {} });
      },
    } as unknown as CollectorDeps['recorder'],
    logger: {
      info: () => {},
      warn: () => {},
      error: (_ctx: string, msg: string) => {
        spies.errors.push(msg);
      },
    },
    ...overrides,
  };

  return { deps, spies };
}

const make = (overrides: Partial<CollectorDeps> = {}) => {
  const { deps, spies } = buildDeps(overrides);
  return { orchestrator: new CollectionOrchestrator(deps, () => NOW), spies };
};

describe('CollectionOrchestrator — 수집 오케스트레이션', () => {
  describe('runDailyIncremental', () => {
    it(`최근 ${INCREMENTAL_MONTHS}개월을 훑는다`, async () => {
      const { orchestrator } = make();
      const report = await orchestrator.runDailyIncremental([강남구]);

      expect(report.monthsProcessed).toBe(INCREMENTAL_MONTHS);
    });

    it('실거래를 적재한다', async () => {
      const { orchestrator, spies } = make();
      const report = await orchestrator.runDailyIncremental([강남구]);

      expect(report.tradesInserted).toBe(INCREMENTAL_MONTHS);
      expect(spies.tradesInserted).toContain('래미안역삼');
    });

    it('실거래에 나온 단지를 마스터에 만든다 (K-apt 목록이 아니라 실거래가 기준)', async () => {
      // 두 API 가 같은 단지를 다른 이름으로 부르기 때문에 K-apt 만 믿으면 거래가 붙지 못한다.
      const { orchestrator } = make();
      expect((await orchestrator.runDailyIncremental([강남구])).complexesInserted).toBeGreaterThan(0);
    });

    it('K-apt 는 이미 있는 단지만 보강한다 — 거래 없는 단지를 만들지 않는다', async () => {
      // 만들었다면 같은 아파트가 이름만 다르게 목록에 두 번 나온다.
      const calls: (boolean | undefined)[] = [];
      const { orchestrator } = make({
        complexes: {
          findById: () => Promise.resolve(null),
          findByRegion: () => Promise.resolve([]),
          // 실거래로 만들어져 세대수를 아직 모르는 단지 — 보강 대상이다
          findByRegionPrefix: () =>
            Promise.resolve([
              { nameNormalized: '래미안역삼', households: 0, coordinate: null, regionCode: RegionCode.parse('1168010100') },
            ] as unknown as Awaited<ReturnType<CollectorDeps['complexes']['findByRegionPrefix']>>),
          upsertMany: (items, options) => {
            calls.push(options?.createMissing);
            return Promise.resolve({ inserted: items.length, updated: 0, skipped: 0 });
          },
          updateNearestPoi: () => Promise.resolve(),
          countAll: () => Promise.resolve(0),
        },
      });
      await orchestrator.runDailyIncremental([강남구]);

      // 실거래 적재는 생성 허용(기본값), K-apt 보강은 생성 금지
      expect(calls).toContain(false);
      expect(calls.filter((c) => c !== false).length).toBeGreaterThan(0);
    });

    it('보강이 필요 없는 단지는 상세를 받지 않는다 (한도가 가장 먼저 닳는 곳)', async () => {
      let detailCalls = 0;
      const { orchestrator } = make({
        complexInfo: {
          fetchComplexList: (sigunguCode: string) =>
            Promise.resolve([
              { kaptCode: `K-${sigunguCode}`, name: '래미안역삼', sido: '서울', sigungu: '강남구', dong: '역삼동' },
            ]),
          fetchComplexDetail: () => {
            detailCalls += 1;
            return Promise.resolve(null);
          },
        },
        complexes: {
          findById: () => Promise.resolve(null),
          findByRegion: () => Promise.resolve([]),
          // 이미 세대수를 아는 단지뿐이다
          findByRegionPrefix: () =>
            Promise.resolve([
              { nameNormalized: '래미안역삼', households: 1284, coordinate: null, regionCode: RegionCode.parse('1168010100') },
            ] as unknown as Awaited<ReturnType<CollectorDeps['complexes']['findByRegionPrefix']>>),
          upsertMany: (items) => Promise.resolve({ inserted: items.length, updated: 0, skipped: 0 }),
          updateNearestPoi: () => Promise.resolve(),
          countAll: () => Promise.resolve(0),
        },
      });
      await orchestrator.runDailyIncremental([강남구]);

      expect(detailCalls).toBe(0);
    });

    it('JobRunRecorder 로 감싸 실행한다 (기록 없는 배치를 만들지 않는다)', async () => {
      const { orchestrator, spies } = make();
      await orchestrator.runDailyIncremental([강남구]);

      expect(spies.jobs).toEqual([{ name: 'daily-collect', triggeredBy: 'cron' }]);
    });

    it('수집이 끝나면 가격 캐시를 버린다', async () => {
      const { orchestrator, spies } = make();
      await orchestrator.runDailyIncremental([강남구]);

      expect(spies.invalidateCalls).toBe(1);
    });
  });

  describe('지역 단위 실패 격리 ★', () => {
    it('한 지역이 실패해도 나머지 지역은 계속 받는다', async () => {
      const { deps } = buildDeps();
      const failing: CollectorDeps = {
        ...deps,
        molit: {
          fetchTrades: (sigunguCode, yearMonth) => {
            if (sigunguCode === 강남구) return Promise.reject(new Error('국토부 API 타임아웃'));
            return deps.molit.fetchTrades(sigunguCode, yearMonth);
          },
          fetchRents: () => Promise.resolve([]),
        },
      };
      const orchestrator = new CollectionOrchestrator(failing, () => NOW);
      const report = await orchestrator.runDailyIncremental([강남구, 하남시]);

      expect(report.regionsFailed).toBe(1);
      expect(report.regionsProcessed).toBe(1); // 하남시는 성공
      expect(report.tradesInserted).toBeGreaterThan(0);
    });

    it('실패한 지역과 이유를 보고에 남긴다', async () => {
      const { deps } = buildDeps();
      const failing: CollectorDeps = {
        ...deps,
        molit: {
          fetchTrades: () => Promise.reject(new Error('국토부 API 타임아웃')),
          fetchRents: () => Promise.resolve([]),
        },
      };
      const report = await new CollectionOrchestrator(failing, () => NOW).runDailyIncremental([강남구]);

      expect(report.errors[0]).toContain(강남구);
      expect(report.errors[0]).toContain('국토부 API 타임아웃');
    });

    it('전 지역이 실패해도 예외를 던지지 않고 보고서를 돌려준다', async () => {
      const { deps } = buildDeps();
      const failing: CollectorDeps = {
        ...deps,
        molit: {
          fetchTrades: () => Promise.reject(new Error('전부 실패')),
          fetchRents: () => Promise.resolve([]),
        },
      };
      const report = await new CollectionOrchestrator(failing, () => NOW).runDailyIncremental([
        강남구,
        하남시,
      ]);

      expect(report.regionsFailed).toBe(2);
      expect(report.regionsProcessed).toBe(0);
    });
  });

  describe('매칭 실패 처리', () => {
    it('매칭에 실패해도 거래를 버리지 않는다 (complexId=null 로 저장)', async () => {
      const { deps } = buildDeps();
      let saved: (number | null)[] = [];
      const unmatched: CollectorDeps = {
        ...deps,
        matcher: {
          resetCache: () => {},
          match: () => Promise.resolve({ status: 'failed' as const, reason: '후보 없음', candidates: [] }),
        } as unknown as CollectorDeps['matcher'],
        trades: {
          ...deps.trades,
          bulkUpsertTrades: (t) => {
            saved = t.map((x) => x.complexId);
            return Promise.resolve({ inserted: t.length, skipped: 0 });
          },
        },
      };
      const report = await new CollectionOrchestrator(unmatched, () => NOW).runDailyIncremental([강남구]);

      expect(report.tradesInserted).toBeGreaterThan(0); // 거래는 저장됨
      expect(saved.every((id) => id === null)).toBe(true);
      expect(report.unmatchedTrades).toBeGreaterThan(0);
      expect(report.matchFailures).toBeGreaterThan(0);
    });

    it('애매한(ambiguous) 매칭도 미매칭으로 세되 실패 기록에는 안 넣는다', async () => {
      const { deps } = buildDeps();
      const ambiguous: CollectorDeps = {
        ...deps,
        matcher: {
          resetCache: () => {},
          match: () => Promise.resolve({ status: 'ambiguous' as const, candidates: [] }),
        } as unknown as CollectorDeps['matcher'],
      };
      const report = await new CollectionOrchestrator(ambiguous, () => NOW).runDailyIncremental([강남구]);

      expect(report.unmatchedTrades).toBeGreaterThan(0);
      expect(report.matchFailures).toBe(0);
    });
  });

  describe('runBackfill', () => {
    it('지정한 기간 전체를 훑는다', async () => {
      const { orchestrator } = make();
      const report = await orchestrator.runBackfill(
        [강남구],
        YearMonth.of(2026, 6),
        YearMonth.of(2026, 8),
      );

      expect(report.monthsProcessed).toBe(3);
    });

    it('수동 실행으로 기록된다', async () => {
      const { orchestrator, spies } = make();
      await orchestrator.runBackfill([강남구], YearMonth.of(2026, 8), YearMonth.of(2026, 8));

      expect(spies.jobs[0]).toEqual({ name: 'backfill-collect', triggeredBy: 'admin' });
    });

    it('기간이 뒤집혀 있으면 아무것도 하지 않고 이유를 남긴다', async () => {
      const { orchestrator, spies } = make();
      const report = await orchestrator.runBackfill(
        [강남구],
        YearMonth.of(2026, 8),
        YearMonth.of(2026, 6),
      );

      expect(report.errors[0]).toContain('기간이 올바르지 않습니다');
      expect(spies.jobs).toHaveLength(0); // 배치 기록도 남기지 않는다
    });
  });

  describe('설정 누락', () => {
    it('수집 대상 지역이 없으면 무엇을 고쳐야 하는지 알려준다', async () => {
      const { orchestrator } = make();
      const report = await orchestrator.runDailyIncremental([]);

      expect(report.errors[0]).toContain('COLLECT_SIGUNGU_CODES');
      expect(report.regionsProcessed).toBe(0);
    });
  });

  describe('좌표 조회 실패', () => {
    it('지오코딩이 실패해도 단지는 저장한다 (지도에만 안 찍힐 뿐)', async () => {
      const { deps } = buildDeps();
      const noGeo: CollectorDeps = {
        ...deps,
        geocode: {
          addressToCoordinate: () => Promise.reject(new Error('카카오 API 오류')),
          searchPlaces: () => Promise.resolve([]),
        },
      };
      const report = await new CollectionOrchestrator(noGeo, () => NOW).runDailyIncremental([강남구]);

      expect(report.complexesInserted).toBe(1);
      expect(report.regionsFailed).toBe(0);
    });
  });

  describe('매칭 후보 캐시', () => {
    it('배치 시작과 단지 동기화 후에 후보를 다시 읽는다', async () => {
      const { orchestrator, spies } = make();
      await orchestrator.runDailyIncremental([강남구]);

      // 배치 시작 1회 + 실거래로 단지를 만든 뒤 매칭 직전 1회.
      // 새로 만든 단지를 후보 목록이 모르면 방금 만든 단지에도 거래가 안 붙는다.
      expect(spies.resetCacheCalls).toBeGreaterThanOrEqual(2);
    });
  });
});
