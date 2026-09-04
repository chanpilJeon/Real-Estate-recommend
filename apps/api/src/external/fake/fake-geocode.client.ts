import { Coordinate } from '@apt/shared';
import { Injectable } from '@nestjs/common';

import type { RawPlace } from '../domain/raw-types';
import type { IGeocodeClient, PlaceCategory } from '../ports';

import { SAMPLE_COMPLEXES, SAMPLE_PLACES } from './sample-data';

/** 카카오 로컬 API 의 가짜 구현 (데모 모드용) */
@Injectable()
export class FakeGeocodeClient implements IGeocodeClient {
  addressToCoordinate(address: string): Promise<Coordinate | null> {
    // 샘플 단지 주소면 그 좌표를 준다
    const exact = SAMPLE_COMPLEXES.find((c) => address.includes(c.dong) && address.includes(c.jibun));
    if (exact !== undefined) return Promise.resolve(new Coordinate(exact.lat, exact.lng));

    // 동 이름만 맞아도 그 동네 좌표를 준다
    const byDong = SAMPLE_COMPLEXES.find((c) => address.includes(c.dong));
    if (byDong !== undefined) return Promise.resolve(new Coordinate(byDong.lat, byDong.lng));

    return Promise.resolve(null);
  }

  searchPlaces(category: PlaceCategory, center: Coordinate, radiusM: number): Promise<RawPlace[]> {
    const places = SAMPLE_PLACES.filter((p) => p.categoryCode === category)
      .map((p) => ({
        name: p.name,
        categoryCode: p.categoryCode,
        coordinate: new Coordinate(p.lat, p.lng),
        extra: p.extra,
      }))
      .filter((p) => center.distanceTo(p.coordinate) <= radiusM)
      .sort((a, b) => center.distanceTo(a.coordinate) - center.distanceTo(b.coordinate));

    return Promise.resolve(places);
  }
}
