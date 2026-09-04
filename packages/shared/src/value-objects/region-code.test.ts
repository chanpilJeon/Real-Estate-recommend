import { describe, expect, it } from 'vitest';

import { InvalidValueError } from '../errors';

import { RegionCode } from './region-code';

describe('RegionCode — 법정동 코드 값 객체', () => {
  describe('parse', () => {
    it('10자리 숫자 문자열을 받는다', () => {
      expect(RegionCode.parse('1168010100').toString()).toBe('1168010100');
    });

    it('앞자리 0 이 보존된다 (number 로 다루면 안 되는 이유)', () => {
      expect(RegionCode.parse('0100000000').toString()).toBe('0100000000');
    });

    it('앞뒤 공백은 다듬는다', () => {
      expect(RegionCode.parse('  1168010100  ').toString()).toBe('1168010100');
    });

    it.each([
      ['116801010', '9자리'],
      ['11680101000', '11자리'],
      ['11680A0100', '숫자 아닌 문자 포함'],
      ['', '빈 문자열'],
      ['1168-01-0100', '구분자 포함'],
    ])('"%s" (%s) 는 거부한다', (input) => {
      expect(() => RegionCode.parse(input)).toThrow(InvalidValueError);
    });

    it('문자열이 아니면 거부한다', () => {
      expect(() => RegionCode.parse(1168010100 as unknown as string)).toThrow(InvalidValueError);
      expect(() => RegionCode.parse(null as unknown as string)).toThrow(InvalidValueError);
    });
  });

  describe('isValid — throw 하지 않는 검사', () => {
    it('유효하면 true', () => {
      expect(RegionCode.isValid('1168010100')).toBe(true);
    });

    it('유효하지 않으면 false (예외를 던지지 않는다)', () => {
      expect(RegionCode.isValid('abc')).toBe(false);
      expect(RegionCode.isValid(undefined as unknown as string)).toBe(false);
    });
  });

  describe('toSigunguCode — 국토부 API 조회 키', () => {
    it('앞 5자리를 뽑는다', () => {
      // 1168010100 = 서울특별시 강남구 역삼동
      expect(RegionCode.parse('1168010100').toSigunguCode()).toBe('11680');
    });

    it('앞자리 0 이 있어도 5자리를 유지한다', () => {
      expect(RegionCode.parse('0100000000').toSigunguCode()).toBe('01000');
    });
  });

  describe('isDongLevel', () => {
    it('뒤 5자리가 있으면 읍면동 단위', () => {
      expect(RegionCode.parse('1168010100').isDongLevel()).toBe(true);
    });

    it('뒤 5자리가 00000 이면 시군구 단위', () => {
      expect(RegionCode.parse('1168000000').isDongLevel()).toBe(false);
    });
  });

  it('같은 코드면 equals 가 참이다', () => {
    expect(RegionCode.parse('1168010100').equals(RegionCode.parse('1168010100'))).toBe(true);
    expect(RegionCode.parse('1168010100').equals(RegionCode.parse('1168010200'))).toBe(false);
  });
});
