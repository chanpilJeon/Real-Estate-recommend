import { RegionCode } from '@apt/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../core';

import { Region } from './domain/region';
import type { IRegionRepository } from './region.repository';


/** Prisma 행 → 도메인 모델 */
interface RegionRow {
  code: string;
  sido: string;
  sigungu: string;
  dong: string | null;
}

const toDomain = (row: RegionRow): Region =>
  new Region(RegionCode.parse(row.code), row.sido, row.sigungu, row.dong);

const SELECT = { code: true, sido: true, sigungu: true, dong: true } as const;

/**
 * IRegionRepository 의 Prisma 구현.
 *
 * 이 클래스는 모듈 배럴(index.ts)에서 내보내지 않는다 — 외부는 인터페이스만 안다.
 *
 * 검색은 FULLTEXT 가 아니라 LIKE 를 쓴다. MariaDB 기본 전문검색은
 * 최소 토큰 길이가 3이라 "강남" 같은 두 글자 한국어가 색인되지 않고,
 * 단어 중간 일치도 안 된다. 실측으로 14,143건에서 LIKE 가 약 3ms 라 충분하다.
 */
@Injectable()
export class PrismaRegionRepository implements IRegionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: RegionCode): Promise<Region | null> {
    const row = await this.prisma.region.findUnique({
      where: { code: code.toString() },
      select: SELECT,
    });
    return row === null ? null : toDomain(row);
  }

  async searchByKeyword(keyword: string, limit: number): Promise<Region[]> {
    const rows = await this.prisma.region.findMany({
      where: {
        isActive: true, // 폐지된 법정동은 검색에 노출하지 않는다
        OR: [
          { sido: { contains: keyword } },
          { sigungu: { contains: keyword } },
          { dong: { contains: keyword } },
        ],
      },
      select: SELECT,
      orderBy: { code: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async findByAlias(alias: string): Promise<Region[]> {
    const rows = await this.prisma.regionAlias.findMany({
      where: { alias, region: { isActive: true } },
      select: { region: { select: SELECT } },
      orderBy: { regionCode: 'asc' },
    });
    return rows.map((row) => toDomain(row.region));
  }
}
