import { Module } from '@nestjs/common';

import { ComplexModule } from '../complex';
import { LOGGER, type ILogger } from '../core';
import { RegionModule } from '../region';
import { TradeModule, TradeStatsService } from '../trade';

import { ComplexSearchService } from './complex-search.service';
import { PrismaSearchEventStore, PrismaSearchRepository } from './prisma-search.repository';
import { SearchController } from './search.controller';
import {
  SEARCH_EVENT_STORE,
  SEARCH_REPOSITORY,
  type ISearchEventStore,
  type ISearchRepository,
} from './search.repository';

/** 조건 검색 모듈 (계층 L4) */
@Module({
  imports: [RegionModule, ComplexModule, TradeModule],
  controllers: [SearchController],
  providers: [
    PrismaSearchRepository,
    PrismaSearchEventStore,
    { provide: SEARCH_REPOSITORY, useExisting: PrismaSearchRepository },
    { provide: SEARCH_EVENT_STORE, useExisting: PrismaSearchEventStore },
    {
      provide: ComplexSearchService,
      useFactory: (
        repository: ISearchRepository,
        tradeStats: TradeStatsService,
        events: ISearchEventStore,
        logger: ILogger,
      ) => new ComplexSearchService(repository, tradeStats, events, logger),
      inject: [SEARCH_REPOSITORY, TradeStatsService, SEARCH_EVENT_STORE, LOGGER],
    },
  ],
  exports: [ComplexSearchService],
})
export class SearchModule {}
