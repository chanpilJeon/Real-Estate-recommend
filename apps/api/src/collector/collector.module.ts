import { Inject, Module } from '@nestjs/common';

import { COMPLEX_REPOSITORY, ComplexModule, type IComplexRepository } from '../complex';
import { AppConfig, LOGGER, type ILogger } from '../core';
import {
  COMPLEX_INFO_CLIENT,
  ExternalModule,
  GEOCODE_CLIENT,
  MOLIT_CLIENT,
  type IComplexInfoClient,
  type IGeocodeClient,
  type IMolitClient,
} from '../external';
import { ComplexMatcher, MatchingModule } from '../matching';
import { JobRunRecorder } from '../observability';
import { RegionModule, RegionSearchService } from '../region';
import { TRADE_REPOSITORY, TradeModule, TradeStatsService, type ITradeRepository } from '../trade';

import { CollectionOrchestrator } from './collection-orchestrator';
import { DailyCollectionJob } from './daily-collection.job';

/**
 * 수집 모듈 (계층 L3).
 * 앞서 만든 모듈들이 여기서 맞물린다 — 이 모듈은 조합만 하고 직접 일하지 않는다.
 */
@Module({
  imports: [ExternalModule, ComplexModule, TradeModule, MatchingModule, RegionModule],
  providers: [
    {
      provide: CollectionOrchestrator,
      useFactory: (
        molit: IMolitClient,
        complexInfo: IComplexInfoClient,
        geocode: IGeocodeClient,
        complexes: IComplexRepository,
        trades: ITradeRepository,
        tradeStats: TradeStatsService,
        matcher: ComplexMatcher,
        regions: RegionSearchService,
        recorder: JobRunRecorder,
        logger: ILogger,
      ) =>
        new CollectionOrchestrator({
          molit,
          complexInfo,
          geocode,
          complexes,
          trades,
          tradeStats,
          matcher,
          regions,
          recorder,
          logger,
        }),
      inject: [
        MOLIT_CLIENT,
        COMPLEX_INFO_CLIENT,
        GEOCODE_CLIENT,
        COMPLEX_REPOSITORY,
        TRADE_REPOSITORY,
        TradeStatsService,
        ComplexMatcher,
        RegionSearchService,
        JobRunRecorder,
        LOGGER,
      ],
    },
    DailyCollectionJob,
  ],
  exports: [CollectionOrchestrator],
})
export class CollectorModule {
  constructor(@Inject(AppConfig) config: AppConfig, @Inject(LOGGER) logger: ILogger) {
    logger.info(
      'collector',
      config.collectSigunguCodes.length === 0
        ? '수집 대상 지역이 설정되지 않았습니다 (COLLECT_SIGUNGU_CODES)'
        : `수집 대상 지역: ${config.collectSigunguCodes.join(', ')} · 매일 06:00 실행`,
    );
  }
}
