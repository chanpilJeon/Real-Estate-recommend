import type { Coordinate } from '@apt/shared';
import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../core';
import { ApiQuotaTracker } from '../../observability';
import { KakaoApiError, parseAddressSearch, parsePlaceSearch, translateKakaoError } from '../domain/kakao-parser';
import type { RawPlace } from '../domain/raw-types';
import type { IGeocodeClient, PlaceCategory } from '../ports';

import { HttpRequestError, RetryingFetch } from './retrying-fetch';

const ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const CATEGORY_URL = 'https://dapi.kakao.com/v2/local/search/category.json';
const MAX_PLACES = 15;

/**
 * 카카오 로컬 API 클라이언트.
 *
 * REST 키를 쓴다 — 지도 SDK 의 JavaScript 키와 **다른 값**이다.
 * (401 이 나면 거의 이 혼동이라 오류 문구에 명시해 뒀다)
 */
@Injectable()
export class KakaoGeocodeClient implements IGeocodeClient {
  private readonly http = new RetryingFetch();

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ApiQuotaTracker,
  ) {}

  async addressToCoordinate(address: string): Promise<Coordinate | null> {
    const body = await this.request(`${ADDRESS_URL}?${new URLSearchParams({ query: address }).toString()}`);
    return parseAddressSearch(body);
  }

  async searchPlaces(category: PlaceCategory, center: Coordinate, radiusM: number): Promise<RawPlace[]> {
    const body = await this.request(
      `${CATEGORY_URL}?${new URLSearchParams({
        category_group_code: category,
        // 카카오는 x=경도, y=위도 순서다
        x: String(center.lng),
        y: String(center.lat),
        radius: String(Math.min(Math.max(radiusM, 0), 20_000)), // 카카오 상한 20km
        size: String(MAX_PLACES),
        sort: 'distance',
      }).toString()}`,
    );
    return parsePlaceSearch(body, category);
  }

  private async request(url: string): Promise<unknown> {
    try {
      const text = await this.http.getText(url, {
        headers: { Authorization: `KakaoAK ${this.config.kakaoRestKey}` },
      });
      await this.quota.increment('kakao', 1);
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof HttpRequestError && err.status !== null) {
        // 상태코드를 운영자가 바로 조치할 수 있는 문장으로 바꾼다
        throw new KakaoApiError(err.status, translateKakaoError(err.status, err.message));
      }
      throw err;
    }
  }
}
