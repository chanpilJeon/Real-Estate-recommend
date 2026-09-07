/**
 * trade 모듈 공개 API (ToDo.md 2.1-5).
 *
 * Prisma 구현체와 가격 집계 함수는 내보내지 않는다 —
 * **가격 집계 규칙이 이 모듈 밖으로 새면 이상치 기준이 갈라진다** (3.8 캡슐화).
 */
export { TradeModule } from './trade.module';
export { TradeStatsService, type MedianPriceResult } from './trade-stats.service';
export { Trade, Rent, type TradeProps, type RentProps } from './domain/trade';
export type { MonthlyPoint } from './domain/price-stats';
export {
  TRADE_REPOSITORY,
  type AreaRangeFilter,
  type BulkResult,
  type ITradeRepository,
  type RentUpsertInput,
  type TradeQuery,
  type TradeUpsertInput,
} from './trade.repository';
