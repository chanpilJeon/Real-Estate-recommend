import { Coordinate } from '@apt/shared';

import type { RawPlace } from './raw-types';

/**
 * 카카오 로컬 API 응답 파서 (순수 함수).
 *
 * ⚠ 카카오는 좌표를 `x`=경도, `y`=위도 로 준다. 흔히 x를 위도로 착각하는데
 *   그러면 단지가 지도 반대편에 찍힌다. 변환은 여기서만 한다.
 */

interface KakaoDocument {
  address_name?: string;
  place_name?: string;
  category_group_code?: string;
  category_name?: string;
  distance?: string;
  place_url?: string;
  x?: string;
  y?: string;
}

interface KakaoResponse {
  documents?: KakaoDocument[];
  meta?: { total_count?: number; is_end?: boolean };
}

export class KakaoApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'KakaoApiError';
  }
}

/** x(경도)·y(위도) 문자열을 좌표로. 값이 이상하면 null */
function toCoordinate(doc: KakaoDocument): Coordinate | null {
  const lng = Number(doc.x);
  const lat = Number(doc.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    return new Coordinate(lat, lng);
  } catch {
    return null; // 범위를 벗어난 값
  }
}

/** 주소 검색 결과에서 첫 좌표를 꺼낸다. 결과가 없으면 null */
export function parseAddressSearch(body: unknown): Coordinate | null {
  const documents = (body as KakaoResponse)?.documents ?? [];
  for (const doc of documents) {
    const coordinate = toCoordinate(doc);
    if (coordinate !== null) return coordinate;
  }
  return null;
}

/** 카테고리(지하철역·학교) 검색 결과 */
export function parsePlaceSearch(body: unknown, fallbackCategory: string): RawPlace[] {
  const documents = (body as KakaoResponse)?.documents ?? [];
  const places: RawPlace[] = [];

  for (const doc of documents) {
    const coordinate = toCoordinate(doc);
    const name = (doc.place_name ?? '').trim();
    if (coordinate === null || name === '') continue;

    places.push({
      name,
      categoryCode: doc.category_group_code ?? fallbackCategory,
      coordinate,
      extra: {
        categoryName: doc.category_name ?? null,
        // 카카오가 준 거리(m). 우리가 다시 계산할 수도 있지만 참고로 남긴다
        distanceM: doc.distance === undefined ? null : Number(doc.distance),
        placeUrl: doc.place_url ?? null,
      },
    });
  }

  return places;
}

/** HTTP 상태코드를 운영자가 바로 조치할 수 있는 문장으로 */
export function translateKakaoError(status: number, body: string): string {
  if (status === 401) {
    return '카카오 API 키가 올바르지 않습니다. .env 의 KAKAO_REST_KEY 를 확인하세요 (JavaScript 키가 아니라 REST 키여야 합니다).';
  }
  if (status === 403) {
    return '카카오 API 사용 권한이 없습니다. 개발자 콘솔에서 해당 앱에 로컬 API 사용 설정을 확인하세요.';
  }
  if (status === 429) {
    return '카카오 API 일일 호출 한도를 초과했습니다.';
  }
  return `카카오 API 오류 (HTTP ${status}): ${body.slice(0, 200)}`;
}
