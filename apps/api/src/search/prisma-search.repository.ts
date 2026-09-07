import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { toComplexDomain, type Complex } from '../complex';
import { PrismaService } from '../core';

import type { SearchCondition } from './domain/search-condition';
import type { CollectedRegion, ISearchEventStore, ISearchRepository } from './search.repository';

/**
 * 한 번에 훑을 최대 단지 수.
 * 시군구 하나가 이보다 많은 아파트 단지를 갖는 경우는 사실상 없다.
 * 가격 필터를 메모리에서 적용하므로 상한을 둬 폭주를 막는다.
 */
const MAX_CANDIDATES = 2_000;

@Injectable()
export class PrismaSearchRepository implements ISearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(condition: SearchCondition): Promise<Complex[]> {
    const rows = await this.prisma.complex.findMany({
      where: this.whereOf(condition),
      orderBy: { id: 'asc' },
      take: MAX_CANDIDATES,
    });

    // complex 모듈의 도메인 모델로 되돌린다 — 판단 로직은 그쪽에 있다
    return rows.map(toComplexDomain);
  }

  async collectedRegions(): Promise<CollectedRegion[]> {
    const grouped = await this.prisma.complex.groupBy({
      by: ['regionCode'],
      _count: { regionCode: true },
    });
    if (grouped.length === 0) return [];

    const regions = await this.prisma.region.findMany({
      where: { code: { in: grouped.map((g) => g.regionCode) } },
      select: { code: true, sigunguCode: true, sido: true, sigungu: true },
    });
    const regionByCode = new Map(regions.map((r) => [r.code, r]));

    // 동 단위로 흩어진 단지를 시군구로 묶는다 — 사용자는 "강남구" 단위로 생각한다
    const bySigungu = new Map<string, CollectedRegion>();
    for (const group of grouped) {
      const region = regionByCode.get(group.regionCode);
      if (region === undefined) continue;

      const existing = bySigungu.get(region.sigunguCode);
      if (existing === undefined) {
        bySigungu.set(region.sigunguCode, {
          sigunguCode: region.sigunguCode,
          name: `${region.sido} ${region.sigungu}`,
          complexCount: group._count.regionCode,
          tradeCount: 0,
          regionCode: `${region.sigunguCode}00000`,
        });
      } else {
        existing.complexCount += group._count.regionCode;
      }
    }

    // 지역별 실거래 건수
    const tradeCounts = await this.prisma.trade.groupBy({
      by: ['regionCode'],
      _count: { regionCode: true },
    });
    for (const group of tradeCounts) {
      const sigunguCode = group.regionCode.slice(0, 5);
      const entry = bySigungu.get(sigunguCode);
      if (entry !== undefined) entry.tradeCount += group._count.regionCode;
    }

    return [...bySigungu.values()].sort((a, b) => b.complexCount - a.complexCount);
  }

  private whereOf(condition: SearchCondition): Prisma.ComplexWhereInput {
    const dongCodes = condition.dongCodes();
    const sigunguPrefixes = condition.sigunguPrefixes();

    const regionFilters: Prisma.ComplexWhereInput[] = [];
    if (dongCodes.length > 0) regionFilters.push({ regionCode: { in: dongCodes } });
    if (sigunguPrefixes.length > 0) {
      // 시군구를 고르면 그 아래 모든 동을 훑는다
      regionFilters.push({ region: { sigunguCode: { in: sigunguPrefixes } } });
    }

    const where: Prisma.ComplexWhereInput = {
      ...(regionFilters.length === 1 ? regionFilters[0] : { OR: regionFilters }),
      ...(condition.minBuiltYear === null ? {} : { builtYear: { gte: condition.minBuiltYear } }),
      ...(condition.minHouseholds === null ? {} : { households: { gte: condition.minHouseholds } }),
    };

    // 면적 조건은 "그 면적의 거래가 실제로 있는 단지"로 좁힌다.
    // area_types 는 공공 데이터에 비어 있는 경우가 많아 거래를 기준으로 삼는 편이 정확하다.
    const areaFilter = this.areaFilterOf(condition);
    if (areaFilter !== null) where.trades = { some: areaFilter };

    return where;
  }

  private areaFilterOf(condition: SearchCondition): Prisma.TradeWhereInput | null {
    const { min, max } = condition.areaRange;
    if (min === null && max === null) return null;

    return {
      isCanceled: false,
      exclusiveSqm: {
        ...(min === null ? {} : { gte: min.toSqm() }),
        ...(max === null ? {} : { lte: max.toSqm() }),
      },
    };
  }
}

@Injectable()
export class PrismaSearchEventStore implements ISearchEventStore {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    regionCode: string,
    conditions: Record<string, unknown>,
    resultCount: number,
  ): Promise<void> {
    await this.prisma.searchEvent.create({
      data: {
        regionCode,
        conditions: JSON.parse(JSON.stringify(conditions)) as Prisma.InputJsonValue,
        resultCount,
      },
    });
  }
}
