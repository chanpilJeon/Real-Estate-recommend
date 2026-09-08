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

  /** 단지마다 최근접 검색. 구 경계 바깥의 역·학교도 포함한다. 실패한 단지의 캐시는 유지된다. */
  async collectForRegion(code: RegionCode): Promise<number> {
    const complexes = code.isDongLevel()
      ? await this.complexes.findByRegion(code)
      : await this.complexes.findByRegionPrefix(code.toSigunguCode());
    let updated = 0;
    for (const complex of complexes) {
      const center = complex.coordinate;
      if (center === null) continue;
      const [subways, schools] = await Promise.all([
        this.geocode.searchPlaces(CATEGORY_SUBWAY, center, POI_RADIUS_M),
        this.geocode.searchPlaces(CATEGORY_SCHOOL, center, POI_RADIUS_M),
      ]);
      for (const place of [...subways, ...schools]) {
        if (place.categoryCode === CATEGORY_SCHOOL && !place.name.includes('초등학교')) continue;
        const data = {
          category: place.categoryCode === CATEGORY_SUBWAY ? 'subway' : 'elementary_school',
          name: place.name,
          lat: place.coordinate.lat,
          lng: place.coordinate.lng,
        };
        const existing = await this.prisma.poi.findFirst({ where: data, select: { id: true } });
        if (existing === null) await this.prisma.poi.create({ data });
      }
      await this.complexes.updateNearestPoi(
        complex.id,
        nearestDistance(center, subways, CATEGORY_SUBWAY),
        nearestDistance(center, schools, CATEGORY_SCHOOL),
      );
      updated++;
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
