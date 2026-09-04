import { RegionCode } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { Region } from './region';

const make = (code: string, sido: string, sigungu: string, dong: string | null): Region =>
  new Region(RegionCode.parse(code), sido, sigungu, dong);

describe('Region — 지역 도메인 모델', () => {
  describe('fullName', () => {
    it('시도·시군구·동을 잇는다', () => {
      expect(make('1168010100', '서울특별시', '강남구', '역삼동').fullName()).toBe(
        '서울특별시 강남구 역삼동',
      );
    });

    it('시군구가 두 단어여도 그대로 잇는다', () => {
      expect(make('4111710500', '경기도', '수원시 영통구', '영통동').fullName()).toBe(
        '경기도 수원시 영통구 영통동',
      );
    });

    it('세종시처럼 시군구가 시도와 같으면 중복을 걷어낸다', () => {
      // 실제 적재 데이터가 이렇게 들어온다 (시군구 단계가 없는 시)
      expect(make('3611010100', '세종특별자치시', '세종특별자치시', '반곡동').fullName()).toBe(
        '세종특별자치시 반곡동',
      );
    });

    it('시군구 단계는 동 없이 잇는다', () => {
      expect(make('1168000000', '서울특별시', '강남구', null).fullName()).toBe('서울특별시 강남구');
    });

    it('시도 단계는 시도명만', () => {
      expect(make('1100000000', '서울특별시', '', null).fullName()).toBe('서울특별시');
    });
  });

  describe('level', () => {
    it.each([
      ['1100000000', '서울특별시', '', null, 'sido'],
      ['1168000000', '서울특별시', '강남구', null, 'sigungu'],
      ['1168010100', '서울특별시', '강남구', '역삼동', 'dong'],
    ] as const)('%s → %s', (code, sido, sigungu, dong, expected) => {
      expect(make(code, sido, sigungu, dong).level()).toBe(expected);
    });

    it('isDongLevel 은 동 단계에서만 참', () => {
      expect(make('1168010100', '서울특별시', '강남구', '역삼동').isDongLevel()).toBe(true);
      expect(make('1168000000', '서울특별시', '강남구', null).isDongLevel()).toBe(false);
    });
  });

  describe('matchesExactly', () => {
    const 역삼동 = make('1168010100', '서울특별시', '강남구', '역삼동');

    it('동 이름이 정확히 같으면 참', () => {
      expect(역삼동.matchesExactly('역삼동')).toBe(true);
    });

    it('시군구 이름이 정확히 같으면 참', () => {
      expect(역삼동.matchesExactly('강남구')).toBe(true);
    });

    it('일부만 같으면 거짓 (부분일치와 구분해야 한다)', () => {
      expect(역삼동.matchesExactly('역삼')).toBe(false);
      expect(역삼동.matchesExactly('강남')).toBe(false);
    });
  });
});
