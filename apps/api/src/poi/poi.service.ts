import { Coordinate, RegionCode } from '@apt/shared';
import { Inject, Injectable } from '@nestjs/common';

import { COMPLEX_REPOSITORY, type IComplexRepository } from '../complex';
import { PrismaService } from '../core';
import {
  CATEGORY_SCHOOL,
  CATEGORY_SUBWAY,
  GEOCODE_CLIENT,
  type IGeocodeClient,
  type RawPlace,
} from '../external';

export const POI_RADIUS_M = 3000;

/** 조회한 반경 안에서 확인된 장소만 사용한다. 학교 카테고리에는 중·고교도 포함된다. */
export function nearestDistance(
  center: Coordinate,
  places: RawPlace[],
  category: string,
): number | null {
  const distances = places
    .filter(
      (p) =>
        p.categoryCode === category &&
        (category !== CATEGORY_SCHOOL || p.name.includes('초등학교')),
    )
    .map((p) => center.distanceTo(p.coordinate))
    .filter((distance) => distance <= POI_RADIUS_M);
  return distances.length === 0 ? null : Math.min(...distances);
}

@Injectable()
export class PoiCollectService {
  constructor(
    @Inject(GEOCODE_CLIENT) private readonly geocode: IGeocodeClient,
    @Inject(COMPLEX_REPOSITORY) private readonly complexes: IComplexRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 단지마다 최근접 검색. 구 경계 바깥의 역·학교도 포함한다. 실패한 단지의 캐시는 유지된다.
   *
   * **이미 거리를 아는 단지는 건너뛴다.** 단지당 카카오를 2회 부르므로 전국 규모에서는
   * 다시 부르는 것만으로 하루 한도가 날아간다. 덕분에 중간에 멈춰도 다시 돌리면 이어진다.
   * (거리를 새로 계산하고 싶으면 complexes 의 nearest_* 를 NULL 로 지우고 돌린다)
   *
   * @param onProgress 오래 걸리는 작업이라 진행 상황을 밖으로 알린다
   */
  async collectForRegion(
    code: RegionCode,
    onProgress?: (done: number, total: number) => void,
  ): Promise<number> {
    const all = code.isDongLevel()
      ? await this.complexes.findByRegion(code)
      : await this.complexes.findByRegionPrefix(code.toSigunguCode());

    const targets = all.filter(
      (c) => c.coordinate !== null && (c.nearestSubwayM === null || c.nearestSchoolM === null),
    );
    if (targets.length === 0) return 0;

    // 장소마다 DB 를 뒤지면 단지당 수십 번 왕복한다. 지역 시작 때 한 번만 읽어 기억해 둔다.
    const seen = new Set(
      (await this.prisma.poi.findMany({ select: { category: true, name: true } })).map(
        (row) => `${row.category}|${row.name}`,
      ),
    );

    let updated = 0;
    for (const complex of targets) {
      const center = complex.coordinate;
      if (center === null) continue;

      const [subways, schools] = await Promise.all([
        this.geocode.searchPlaces(CATEGORY_SUBWAY, center, POI_RADIUS_M),
        this.geocode.searchPlaces(CATEGORY_SCHOOL, center, POI_RADIUS_M),
      ]);

      const fresh: { category: string; name: string; lat: number; lng: number }[] = [];
      for (const place of [...subways, ...schools]) {
        if (place.categoryCode === CATEGORY_SCHOOL && !place.name.includes('초등학교')) continue;
        const category = place.categoryCode === CATEGORY_SUBWAY ? 'subway' : 'elementary_school';
        const key = `${category}|${place.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push({ category, name: place.name, lat: place.coordinate.lat, lng: place.coordinate.lng });
      }
      if (fresh.length > 0) await this.prisma.poi.createMany({ data: fresh });

      await this.complexes.updateNearestPoi(
        complex.id,
        nearestDistance(center, subways, CATEGORY_SUBWAY),
        nearestDistance(center, schools, CATEGORY_SCHOOL),
      );
      updated++;
      onProgress?.(updated, targets.length);
    }
    return updated;
  }
}

@Injectable()
export class DistanceCalculator {
  constructor(private readonly collector: PoiCollectService) {}
  async precomputeForRegion(code: RegionCode): Promise<{ updated: number }> {
    return { updated: await this.collector.collectForRegion(code) };
  }
}
