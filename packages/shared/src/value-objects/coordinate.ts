import { assertFiniteNumber, InvalidValueError } from '../errors';

const EARTH_RADIUS_M = 6_371_000;
/** 도보 속도 — 부동산 광고 관례인 분당 80m 를 따른다 */
const WALKING_METERS_PER_MINUTE = 80;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * 좌표 값 객체 (ToDo.md 3.1).
 *
 * 거리 계산 공식(Haversine)은 **오직 이 클래스 안에만** 존재한다 (ToDo.md 3.9 캡슐화).
 * 여러 곳에 같은 공식이 복사되면 기준이 갈라지기 때문이다.
 */
export class Coordinate {
  constructor(
    readonly lat: number,
    readonly lng: number,
  ) {
    assertFiniteNumber(lat, '위도');
    assertFiniteNumber(lng, '경도');
    if (lat < -90 || lat > 90) {
      throw new InvalidValueError('위도', `-90 ~ 90 사이여야 합니다 (받은 값: ${lat})`);
    }
    if (lng < -180 || lng > 180) {
      throw new InvalidValueError('경도', `-180 ~ 180 사이여야 합니다 (받은 값: ${lng})`);
    }
  }

  /** 두 지점 사이 직선거리 (미터, 반올림) */
  distanceTo(other: Coordinate): number {
    const dLat = toRadians(other.lat - this.lat);
    const dLng = toRadians(other.lng - this.lng);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(this.lat)) * Math.cos(toRadians(other.lat)) * Math.sin(dLng / 2) ** 2;

    return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /**
   * 도보 소요 시간 (분).
   * 직선거리 기준이라 실제 보행 경로보다 짧게 나온다 — "도보 7분" 같은 표시는
   * 어디까지나 참고값임을 UI 에서 함께 밝힌다.
   */
  walkingMinutes(other: Coordinate): number {
    return Math.ceil(this.distanceTo(other) / WALKING_METERS_PER_MINUTE);
  }

  toString(): string {
    return `(${this.lat}, ${this.lng})`;
  }
}
