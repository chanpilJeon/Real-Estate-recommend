import { describe, expect, it } from 'vitest';

import { normalizeComplexName } from './normalize-name';

describe('normalizeComplexName — 단지명 정규화', () => {
  describe('같은 단지로 묶여야 하는 표기들', () => {
    it.each([
      ['래미안OO 1차', '래미안OO(1차)'], // ToDo.md 3.10 이 지목한 대표 사례
      ['래미안OO 1차', '래미안OO1차'],
      ['개포자이', '개포자이아파트'],
      ['e편한세상', 'E편한세상'],
      ['힐스테이트 · 3단지', '힐스테이트3단지'],
      ['롯데캐슬-골드', '롯데캐슬골드'],
      ['자이   (2차)', '자이2차'],
    ])('"%s" 와 "%s" 는 같은 값이 된다', (a, b) => {
      expect(normalizeComplexName(a)).toBe(normalizeComplexName(b));
    });
  });

  describe('구분되어야 하는 것은 구분한다', () => {
    it.each([
      ['래미안OO 1차', '래미안OO 2차'], // 차수가 다르면 다른 단지
      ['힐스테이트 3단지', '힐스테이트 4단지'],
      ['개포자이', '반포자이'],
    ])('"%s" 와 "%s" 는 다른 값이다', (a, b) => {
      expect(normalizeComplexName(a)).not.toBe(normalizeComplexName(b));
    });
  });

  describe('세부 규칙', () => {
    it('공백을 모두 없앤다', () => {
      expect(normalizeComplexName('래 미 안')).toBe('래미안');
    });

    it('영문은 소문자로 통일한다', () => {
      expect(normalizeComplexName('SK VIEW')).toBe('skview');
    });

    it('뒤에 붙은 "아파트"만 지운다 (가운데는 남긴다)', () => {
      expect(normalizeComplexName('행복아파트')).toBe('행복');
      expect(normalizeComplexName('아파트마을')).toBe('아파트마을');
    });

    it('숫자는 남긴다 (차수·단지번호 구분에 필요)', () => {
      expect(normalizeComplexName('주공 3단지')).toBe('주공3단지');
    });

    it('자모가 분리된 한글도 합쳐서 비교한다', () => {
      const 조합형 = '역삼래미안';
      const 분리형 = 조합형.normalize('NFD');
      expect(normalizeComplexName(분리형)).toBe(normalizeComplexName(조합형));
    });
  });

  describe('이상한 입력', () => {
    it.each([
      ['', ''],
      ['   ', ''],
      ['()', ''],
    ])('"%s" → "%s"', (input, expected) => {
      expect(normalizeComplexName(input)).toBe(expected);
    });

    it('문자열이 아니어도 터지지 않는다', () => {
      expect(normalizeComplexName(null as unknown as string)).toBe('');
      expect(normalizeComplexName(undefined as unknown as string)).toBe('');
    });
  });
});
