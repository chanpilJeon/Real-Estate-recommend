import type { RegionCode } from '@apt/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../core';

import type { ComplexUpsertInput, IComplexRepository, UpsertResult } from './complex.repository';
import type { Complex } from './domain/complex';
import { normalizeComplexName } from './domain/normalize-name';
import { toComplexDomain } from './prisma-complex.mapper';

/** 한 번에 처리할 upsert 건수 — 트랜잭션이 너무 길어지지 않게 */
const CHUNK = 200;

@Injectable()
export class PrismaComplexRepository implements IComplexRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Complex | null> {
    const row = await this.prisma.complex.findUnique({ where: { id } });
    return row === null ? null : toComplexDomain(row);
  }

  async findByRegion(code: RegionCode): Promise<Complex[]> {
    const rows = await this.prisma.complex.findMany({
      where: { regionCode: code.toString() },
      orderBy: { name: 'asc' },
    });
    return rows.map(toComplexDomain);
  }

  /** 시군구 단위 조회 — 법정동코드 앞 5자리로 찾는다 */
  async findByRegionPrefix(sigunguCode: string): Promise<Complex[]> {
    const rows = await this.prisma.complex.findMany({
      where: { region: { sigunguCode } },
      orderBy: { name: 'asc' },
    });
    return rows.map(toComplexDomain);
  }

  /**
   * 벌크 upsert.
   *
   * ⚠ 스키마의 유니크 키 `(regionCode, nameNormalized, builtYear)` 는 builtYear 가 NULL 이면
   *   MySQL 이 서로 다른 행으로 취급한다(NULL != NULL). 그래서 Prisma 의 upsert 에만 기대지 않고,
   *   **kaptCode 가 있으면 그것을, 없으면 직접 조회해서** 신규/갱신을 가른다.
   */
  async upsertMany(items: ComplexUpsertInput[]): Promise<UpsertResult> {
    const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
    if (items.length === 0) return result;

    // 존재하지 않는 지역코드로 넣으면 외래키 오류가 난다 — 미리 걸러 낸다
    const codes = [...new Set(items.map((i) => i.regionCode))];
    const known = new Set(
      (
        await this.prisma.region.findMany({
          where: { code: { in: codes } },
          select: { code: true },
        })
      ).map((r) => r.code),
    );

    for (let offset = 0; offset < items.length; offset += CHUNK) {
      const chunk = items.slice(offset, offset + CHUNK);

      for (const item of chunk) {
        if (!known.has(item.regionCode)) {
          result.skipped += 1;
          continue;
        }

        const data = this.toData(item);
        const existingId = await this.findExistingId(item, data.nameNormalized);

        if (existingId === null) {
          await this.prisma.complex.create({ data });
          result.inserted += 1;
        } else {
          await this.prisma.complex.update({ where: { id: existingId }, data });
          result.updated += 1;
        }
      }
    }

    return result;
  }

  async updateNearestPoi(id: number, subwayM: number | null, schoolM: number | null): Promise<void> {
    await this.prisma.complex.update({
      where: { id },
      data: { nearestSubwayM: subwayM, nearestSchoolM: schoolM },
    });
  }

  countAll(): Promise<number> {
    return this.prisma.complex.count();
  }

  private toData(item: ComplexUpsertInput): Prisma.ComplexUncheckedCreateInput {
    return {
      kaptCode: item.kaptCode,
      name: item.name,
      nameNormalized: normalizeComplexName(item.name),
      regionCode: item.regionCode,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      households: item.households,
      buildingCount: item.buildingCount,
      approvalDate: item.approvalDate,
      builtYear: item.builtYear,
      parkingCount: item.parkingCount,
      heatingType: item.heatingType,
    };
  }

  private async findExistingId(item: ComplexUpsertInput, nameNormalized: string): Promise<number | null> {
    if (item.kaptCode !== null && item.kaptCode !== '') {
      const byKapt = await this.prisma.complex.findUnique({
        where: { kaptCode: item.kaptCode },
        select: { id: true },
      });
      if (byKapt !== null) return byKapt.id;
    }

    const byIdentity = await this.prisma.complex.findFirst({
      where: { regionCode: item.regionCode, nameNormalized, builtYear: item.builtYear },
      select: { id: true },
    });
    return byIdentity?.id ?? null;
  }
}
