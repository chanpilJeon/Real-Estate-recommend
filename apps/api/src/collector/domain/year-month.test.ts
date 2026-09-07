import { InvalidValueError } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { YearMonth } from './year-month';

describe('YearMonth — 수집 대상 연월', () => {
  describe('생성', () => {
    it('연·월로 만든다', () => {
      expect(YearMonth.of(2026, 8).toString()).toBe('202608');
    });

    it('한 자리 월은 0을 채운다 (국토부 API 형식)', () => {
      expect(YearMonth.of(2026, 1).toString()).toBe('202601');
    });

    it('YYYYMM 문자열에서 만든다', () => {
      const ym = YearMonth.parse('202608');
      expect(ym.year).toBe(2026);
      expect(ym.month).toBe(8);
    });

    it('Date 에서 만든다', () => {
      expect(YearMonth.fromDate(new Date('2026-08-15T00:00:00Z')).toString()).toBe('202608');
    });

    it.each([
      ['13월', 2026, 13],
      ['0월', 2026, 0],
      ['너무 과거', 1990, 1],
    ])('%s 은 거부한다', (_label, year, month) => {
      expect(() => YearMonth.of(year, month)).toThrow(InvalidValueError);
    });

    it.each(['20268', '2026080', 'abcdef', '', '2026-08'])('"%s" 는 거부한다', (raw) => {
      expect(() => YearMonth.parse(raw)).toThrow(InvalidValueError);
    });
  });

  describe('shift — 개월 이동', () => {
    it('다음 달', () => {
      expect(YearMonth.of(2026, 8).shift(1).toString()).toBe('202609');
    });

    it('해를 넘어간다', () => {
      expect(YearMonth.of(2026, 12).shift(1).toString()).toBe('202701');
    });

    it('과거로 간다', () => {
      expect(YearMonth.of(2026, 1).shift(-1).toString()).toBe('202512');
    });

    it('여러 해를 건너뛴다', () => {
      expect(YearMonth.of(2026, 8).shift(-36).toString()).toBe('202308');
    });

    it('0 이면 그대로', () => {
      expect(YearMonth.of(2026, 8).shift(0).toString()).toBe('202608');
    });
  });

  describe('compare', () => {
    it('앞선 달이 작다', () => {
      expect(YearMonth.of(2026, 7).compare(YearMonth.of(2026, 8))).toBe(-1);
      expect(YearMonth.of(2026, 8).compare(YearMonth.of(2026, 7))).toBe(1);
      expect(YearMonth.of(2026, 8).compare(YearMonth.of(2026, 8))).toBe(0);
    });

    it('해가 다르면 해로 비교한다', () => {
      expect(YearMonth.of(2025, 12).compare(YearMonth.of(2026, 1))).toBe(-1);
    });
  });

  describe('rangeTo — 기간 펼치기', () => {
    it('양끝을 포함한다', () => {
      const months = YearMonth.of(2026, 6).rangeTo(YearMonth.of(2026, 8));
      expect(months.map((m) => m.toString())).toEqual(['202606', '202607', '202608']);
    });

    it('같은 달이면 한 개', () => {
      expect(YearMonth.of(2026, 8).rangeTo(YearMonth.of(2026, 8))).toHaveLength(1);
    });

    it('해를 넘는 구간도 이어진다', () => {
      const months = YearMonth.of(2025, 11).rangeTo(YearMonth.of(2026, 2));
      expect(months.map((m) => m.toString())).toEqual(['202511', '202512', '202601', '202602']);
    });

    it('3년치는 37개월이다 (수집 범위 계산에 쓴다)', () => {
      expect(YearMonth.of(2023, 9).rangeTo(YearMonth.of(2026, 9))).toHaveLength(37);
    });

    it('시작이 끝보다 뒤면 빈 배열 (조용히 뒤집지 않는다)', () => {
      expect(YearMonth.of(2026, 8).rangeTo(YearMonth.of(2026, 6))).toEqual([]);
    });
  });
});
