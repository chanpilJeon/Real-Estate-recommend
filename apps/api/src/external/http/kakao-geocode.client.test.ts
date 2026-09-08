import { Coordinate } from '@apt/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KakaoGeocodeClient } from './kakao-geocode.client';

afterEach(() => {
  vi.unstubAllGlobals();
});
describe('학교 검색 페이지', () => {
  it('첫 페이지가 중학교뿐이어도 다음 페이지 초등학교를 가져온다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: { is_end: false },
            documents: [{ place_name: '중학교', x: '127', y: '37.5' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: { is_end: true },
            documents: [{ place_name: '초등학교', x: '127', y: '37.501' }],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new KakaoGeocodeClient(
      { kakaoRestKey: 'test' } as any,
      { increment: async () => {} } as any,
    );
    const places = await client.searchPlaces('SC4', new Coordinate(37.5, 127), 3000);
    expect(places.map((p) => p.name)).toEqual(['중학교', '초등학교']);
    expect(String(fetch.mock.calls[1]?.[0])).toContain('page=2');
  });
});
