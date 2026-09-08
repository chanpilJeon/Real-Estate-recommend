import type { RegionCode } from '@apt/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../core';

import type {
  ComplexUpsertInput,
  IComplexRepository,
  UpsertOptions,
  UpsertResult,
} from './complex.repository';
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
  async upsertMany(items: ComplexUpsertInput[], options?: UpsertOptions): Promise<UpsertResult> {
    const createMissing = options?.createMissing ?? true;
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
        let existingId = await this.findExistingId(item, data.nameNormalized);

        /*
          보강(createMissing=false)일 때는 이름이 안 맞아도 포기하지 않는다.
          실거래와 K-apt 는 같은 아파트를 다른 이름으로 부르기 때문이다
          ('한보미도맨션2' ↔ '대치미도맨션'). 대신 번지로 찾는다 — 이름과 달리
          번지는 사람이 붙이는 별칭이 아니라 주소라 양쪽이 같다.

          그다음 건축년도만 뺀 이름 대조를 시도한다. K-apt 는 '사용승인일'의 연도를,
          실거래는 '건축년도'를 주는데 자주 1년씩 어긋난다.

          둘 다 **후보가 딱 하나일 때만** 인정한다. 여럿이면 어느 쪽인지 알 수 없고,
          엉뚱한 단지에 세대수를 씌우면 추천이 조용히 틀어진다.
        */
        if (existingId === null && !createMissing) {
          existingId =
            (await this.findOnlyByJibun(item.regionCode, item.jibun)) ??
            (await this.findOnlyByName(item.regionCode, data.nameNormalized));
        }

        if (existingId === null) {
          if (!createMissing) {
            result.skipped += 1;
            continue;
          }
          await this.prisma.complex.create({ data });
          result.inserted += 1;
        } else {
          await this.prisma.complex.update({
            where: { id: existingId },
            data: withoutUnknowns(data),
          });
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
      jibun: item.jibun,
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

  /** 지역 + 번지로 찾는다. 딱 하나일 때만 인정한다 */
  private async findOnlyByJibun(regionCode: string, jibun: string | null): Promise<number | null> {
    if (jibun === null || jibun === '') return null;

    const rows = await this.prisma.complex.findMany({
      where: { regionCode, jibun },
      select: { id: true },
      take: 2,
    });
    return rows.length === 1 ? rows[0]!.id : null;
  }

  /** 지역 + 정규화명으로만 찾는다. 딱 하나일 때만 인정한다 (여럿이면 어느 쪽인지 알 수 없다) */
  private async findOnlyByName(regionCode: string, nameNormalized: string): Promise<number | null> {
    const rows = await this.prisma.complex.findMany({
      where: { regionCode, nameNormalized },
      select: { id: true },
      take: 2,
    });
    return rows.length === 1 ? rows[0]!.id : null;
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

/**
 * 갱신할 때 **아는 값을 모르는 값으로 덮어쓰지 않는다.**
 *
 * 실거래에서 만든 단지는 세대수·주차를 모르므로 0 을 들고 온다.
 * 그대로 update 하면 K-apt 가 채워 둔 "640세대"가 0 으로 지워진다.
 * 다음 수집 때마다 정보가 사라졌다 나타났다 하는, 찾기 어려운 버그가 된다.
 *
 * 이름·주소·지역은 항상 최신값을 쓴다 (빈 값으로 오는 경우가 없다).
 */
function withoutUnknowns(
  data: Prisma.ComplexUncheckedCreateInput,
): Prisma.ComplexUncheckedUpdateInput {
  const merged: Prisma.ComplexUncheckedUpdateInput = {
    name: data.name,
    nameNormalized: data.nameNormalized,
    regionCode: data.regionCode,
    address: data.address,
  };

  // 0 은 "모름"을 뜻한다 — 세대가 0인 아파트는 없다
  if (data.kaptCode != null && data.kaptCode !== '') merged.kaptCode = data.kaptCode;
  if (data.jibun != null && data.jibun !== '') merged.jibun = data.jibun;
  if (data.lat != null) merged.lat = data.lat;
  if (data.lng != null) merged.lng = data.lng;
  if (Number(data.households) > 0) merged.households = data.households;
  if (Number(data.buildingCount) > 0) merged.buildingCount = data.buildingCount;
  if (Number(data.parkingCount) > 0) merged.parkingCount = data.parkingCount;
  if (data.approvalDate != null) merged.approvalDate = data.approvalDate;
  if (data.builtYear != null) merged.builtYear = data.builtYear;
  if (data.heatingType != null && data.heatingType !== '') merged.heatingType = data.heatingType;

  return merged;
}
