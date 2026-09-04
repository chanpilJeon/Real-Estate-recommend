import type { Area } from '@apt/shared';

import type { Rent, Trade } from './domain/trade';

/** 수집기가 넘기는 실거래 입력 (sourceHash 는 저장소가 계산한다) */
export interface TradeUpsertInput {
  complexId: number | null;
  regionCode: string;
  rawName: string;
  exclusiveSqm: number;
  priceManwon: number;
  contractedAt: Date;
  floor: number;
  builtYear: number | null;
  isCanceled: boolean;
}

export interface RentUpsertInput {
  complexId: number | null;
  regionCode: string;
  rawName: string;
  exclusiveSqm: number;
  depositManwon: number;
  monthlyManwon: number;
  contractedAt: Date;
  floor: number;
}

export interface BulkResult {
  inserted: number;
  /** 이미 있어서 건너뛴 건수 (sourceHash 중복) */
  skipped: number;
}

export interface TradeQuery {
  complexId: number;
  area?: Area;
  /** 이 날짜 이후 계약만 */
  since?: Date;
  limit?: number;
  /** 해제된 거래도 포함할지. 기본은 제외 */
  includeCanceled?: boolean;
}

/**
 * 실거래·전월세 저장소 추상 (ToDo.md 3.8).
 *
 * ※ 명세의 `ITradeRepository` 에 전월세 메서드를 함께 둔다.
 *   같은 모듈이 소유하는 데이터이고, 저장소를 둘로 쪼갤 만한 이유가 없다.
 */
export interface ITradeRepository {
  bulkUpsertTrades(trades: TradeUpsertInput[]): Promise<BulkResult>;
  bulkUpsertRents(rents: RentUpsertInput[]): Promise<BulkResult>;

  findTrades(query: TradeQuery): Promise<Trade[]>;
  findRents(query: TradeQuery): Promise<Rent[]>;

  /** 데이터 신선도 지표 — 가장 최근 계약일 */
  latestContractDate(): Promise<Date | null>;
  /** 유동성 계산용 — 기간 내 거래 건수 */
  countTrades(complexId: number, since: Date): Promise<number>;
  /** 단지에 존재하는 전용면적 목록 */
  distinctAreas(complexId: number): Promise<number[]>;

  /**
   * 매칭 실패로 단지에 붙지 못한 거래를 뒤늦게 이어붙인다.
   * 관리자가 수동 보정하면 **과거 데이터까지 되살아난다** —
   * `rawName` 을 보존해 둔 이유가 이것이다 (ToDo.md 4.3).
   */
  relinkByRawName(regionCode: string, rawName: string, complexId: number): Promise<number>;
}
export const TRADE_REPOSITORY = Symbol('ITradeRepository');
