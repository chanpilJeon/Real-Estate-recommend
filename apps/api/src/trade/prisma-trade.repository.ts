import { Area, Money } from '@apt/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../core';

import { buildRentSourceHash, buildTradeSourceHash } from './domain/source-hash';
import { Rent, Trade } from './domain/trade';
import type {
  BulkResult,
  ITradeRepository,
  RentUpsertInput,
  TradeQuery,
  TradeUpsertInput,
} from './trade.repository';

const CHUNK = 500;
const DEFAULT_LIMIT = 200;

type TradeRow = Prisma.TradeGetPayload<Record<string, never>>;
type RentRow = Prisma.RentGetPayload<Record<string, never>>;

const toTrade = (row: TradeRow): Trade =>
  new Trade({
    id: row.id.toString(),
    complexId: row.complexId,
    regionCode: row.regionCode,
    rawName: row.rawName,
    price: Money.fromManwon(row.priceManwon),
    area: Area.fromSqm(Number(row.exclusiveSqm)),
    contractedAt: row.contractedAt,
    floor: row.floor,
    builtYear: row.builtYear,
    isCanceled: row.isCanceled,
  });

const toRent = (row: RentRow): Rent =>
  new Rent({
    id: row.id.toString(),
    complexId: row.complexId,
    rawName: row.rawName,
    deposit: Money.fromManwon(row.depositManwon),
    monthly: Money.fromManwon(row.monthlyManwon),
    area: Area.fromSqm(Number(row.exclusiveSqm)),
    contractedAt: row.contractedAt,
    floor: row.floor,
  });

@Injectable()
export class PrismaTradeRepository implements ITradeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 실거래 벌크 적재.
   *
   * `sourceHash` UNIQUE + `skipDuplicates` 로 **중복을 DB 가 막는다**.
   * 수집 배치는 매달 같은 구간을 다시 훑기 때문에 애플리케이션 로직만으로는 언젠가 샌다.
   */
  async bulkUpsertTrades(trades: TradeUpsertInput[]): Promise<BulkResult> {
    if (trades.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    for (let offset = 0; offset < trades.length; offset += CHUNK) {
      const chunk = trades.slice(offset, offset + CHUNK);
      const result = await this.prisma.trade.createMany({
        data: chunk.map((t) => ({
          complexId: t.complexId,
          regionCode: t.regionCode,
          rawName: t.rawName,
          exclusiveSqm: t.exclusiveSqm,
          priceManwon: t.priceManwon,
          contractedAt: t.contractedAt,
          floor: t.floor,
          builtYear: t.builtYear,
          isCanceled: t.isCanceled,
          sourceHash: buildTradeSourceHash(t),
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    return { inserted, skipped: trades.length - inserted };
  }

  async bulkUpsertRents(rents: RentUpsertInput[]): Promise<BulkResult> {
    if (rents.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    for (let offset = 0; offset < rents.length; offset += CHUNK) {
      const chunk = rents.slice(offset, offset + CHUNK);
      const result = await this.prisma.rent.createMany({
        data: chunk.map((r) => ({
          complexId: r.complexId,
          regionCode: r.regionCode,
          rawName: r.rawName,
          exclusiveSqm: r.exclusiveSqm,
          depositManwon: r.depositManwon,
          monthlyManwon: r.monthlyManwon,
          contractedAt: r.contractedAt,
          floor: r.floor,
          sourceHash: buildRentSourceHash(r),
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    return { inserted, skipped: rents.length - inserted };
  }

  async findTrades(query: TradeQuery): Promise<Trade[]> {
    const rows = await this.prisma.trade.findMany({
      where: this.whereOf(query),
      orderBy: { contractedAt: 'desc' },
      take: query.limit ?? DEFAULT_LIMIT,
    });
    return rows.map(toTrade);
  }

  async findRents(query: TradeQuery): Promise<Rent[]> {
    const rows = await this.prisma.rent.findMany({
      where: {
        complexId: query.complexId,
        ...(query.area === undefined ? {} : { exclusiveSqm: query.area.toSqm() }),
        ...(query.since === undefined ? {} : { contractedAt: { gte: query.since } }),
      },
      orderBy: { contractedAt: 'desc' },
      take: query.limit ?? DEFAULT_LIMIT,
    });
    return rows.map(toRent);
  }

  async latestContractDate(): Promise<Date | null> {
    // 인덱스만 읽고 끝난다 (EXPLAIN: Select tables optimized away)
    const result = await this.prisma.trade.aggregate({ _max: { contractedAt: true } });
    return result._max.contractedAt;
  }

  countTrades(complexId: number, since: Date): Promise<number> {
    return this.prisma.trade.count({
      where: { complexId, isCanceled: false, contractedAt: { gte: since } },
    });
  }

  async distinctAreas(complexId: number): Promise<number[]> {
    const rows = await this.prisma.trade.findMany({
      where: { complexId, isCanceled: false },
      distinct: ['exclusiveSqm'],
      select: { exclusiveSqm: true },
      orderBy: { exclusiveSqm: 'asc' },
    });
    return rows.map((r) => Number(r.exclusiveSqm));
  }

  private whereOf(query: TradeQuery): Prisma.TradeWhereInput {
    return {
      complexId: query.complexId,
      // 해제된 거래는 기본적으로 뺀다 (ToDo.md 7.3)
      ...(query.includeCanceled === true ? {} : { isCanceled: false }),
      ...(query.area === undefined ? {} : { exclusiveSqm: query.area.toSqm() }),
      ...(query.since === undefined ? {} : { contractedAt: { gte: query.since } }),
    };
  }
}
