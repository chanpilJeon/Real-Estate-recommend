import { describe, expect, it } from 'vitest';

import { parseAddressSearch, parsePlaceSearch, translateKakaoError } from './kakao-parser';

describe('카카오 로컬 응답 파서', () => {
  describe('주소 → 좌표', () => {
    it('x 는 경도, y 는 위도다 (뒤바뀌면 지도 반대편에 찍힌다)', () => {
      const body = {
        documents: [{ address_name: '서울 강남구 역삼동', x: '127.0276', y: '37.4979' }],
      };
      const coordinate = parseAddressSearch(body);

      expect(coordinate?.lat).toBe(37.4979); // y
      expect(coordinate?.lng).toBe(127.0276); // x
    });

    it('결과가 없으면 null', () => {
      expect(parseAddressSearch({ documents: [] })).toBeNull();
    });

    it('응답 형태가 예상과 달라도 터지지 않는다', () => {
      expect(parseAddressSearch(null)).toBeNull();
      expect(parseAddressSearch({})).toBeNull();
    });

    it('좌표가 숫자가 아니면 건너뛰고 다음 결과를 본다', () => {
      const body = {
        documents: [
          { x: 'abc', y: 'def' },
          { x: '127.0276', y: '37.4979' },
        ],
      };
      expect(parseAddressSearch(body)?.lat).toBe(37.4979);
    });

    it('범위를 벗어난 좌표는 채택하지 않는다', () => {
      expect(parseAddressSearch({ documents: [{ x: '999', y: '999' }] })).toBeNull();
    });
  });

  describe('장소 검색', () => {
    const body = {
      documents: [
        {
          place_name: '역삼역 2호선',
          category_group_code: 'SW8',
          category_name: '교통,수송 > 지하철,전철 > 수도권2호선',
          distance: '412',
          place_url: 'http://place.map.kakao.com/1',
          x: '127.0364',
          y: '37.5006',
        },
      ],
    };

    it('이름과 좌표를 읽는다', () => {
      const [place] = parsePlaceSearch(body, 'SW8');
      expect(place?.name).toBe('역삼역 2호선');
      expect(place?.coordinate.lat).toBe(37.5006);
    });

    it('카카오가 준 거리를 참고값으로 남긴다', () => {
      expect(parsePlaceSearch(body, 'SW8')[0]?.extra?.distanceM).toBe(412);
    });

    it('이름이 없는 항목은 버린다', () => {
      expect(parsePlaceSearch({ documents: [{ place_name: '', x: '127', y: '37' }] }, 'SW8')).toHaveLength(0);
    });

    it('카테고리 코드가 없으면 요청한 값으로 채운다', () => {
      const noCode = { documents: [{ place_name: '역삼초등학교', x: '127.03', y: '37.50' }] };
      expect(parsePlaceSearch(noCode, 'SC4')[0]?.categoryCode).toBe('SC4');
    });

    it('빈 응답은 빈 배열', () => {
      expect(parsePlaceSearch({ documents: [] }, 'SW8')).toEqual([]);
      expect(parsePlaceSearch(undefined, 'SW8')).toEqual([]);
    });
  });

  describe('오류 안내', () => {
    it('401 은 REST 키와 JS 키 혼동을 짚어준다 (가장 흔한 실수)', () => {
      expect(translateKakaoError(401, '')).toMatch(/REST 키/);
    });

    it('429 는 한도 초과로 구분한다', () => {
      expect(translateKakaoError(429, '')).toMatch(/한도를 초과/);
    });

    it('모르는 상태코드는 코드와 본문 일부를 남긴다', () => {
      expect(translateKakaoError(503, 'service unavailable')).toMatch(/503/);
    });
  });
});
