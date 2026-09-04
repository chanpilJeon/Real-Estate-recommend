import { Module } from '@nestjs/common';

import { PrismaTradeRepository } from './prisma-trade.repository';
import { TradeStatsService } from './trade-stats.service';
import { TRADE_REPOSITORY, type ITradeRepository } from './trade.repository';

/**
 * 실거래 모듈 (계층 L2).
 * **가격에 관한 모든 계산의 단일 창구** (ToDo.md 3.8).
 */
@Module({
  providers: [
    PrismaTradeRepository,
    { provide: TRADE_REPOSITORY, useExisting: PrismaTradeRepository },
    {
      provide: TradeStatsService,
      useFactory: (repository: ITradeRepository) => new TradeStatsService(repository),
      inject: [TRADE_REPOSITORY],
    },
  ],
  exports: [TradeStatsService, TRADE_REPOSITORY],
})
export class TradeModule {}
