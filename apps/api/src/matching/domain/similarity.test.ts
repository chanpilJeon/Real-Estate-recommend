import { describe, expect, it } from 'vitest';

import { levenshtein, similarity } from './similarity';

describe('문자열 유사도', () => {
  describe('levenshtein — 편집 거리', () => {
    it.each([
      ['', '', 0],
      ['abc', 'abc', 0],
      ['abc', '', 3],
      ['', 'abc', 3],
      ['abc', 'abd', 1], // 치환
      ['abc', 'abcd', 1], // 삽입
      ['abcd', 'abc', 1], // 삭제
      ['kitten', 'sitting', 3],
    ])('"%s" ↔ "%s" = %i', (a, b, expected) => {
      expect(levenshtein(a, b)).toBe(expected);
    });

    it('순서를 바꿔도 같다 (대칭)', () => {
      expect(levenshtein('래미안역삼', '래미안역삼2차')).toBe(
        levenshtein('래미안역삼2차', '래미안역삼'),
      );
    });

    it('한글도 글자 단위로 센다', () => {
      expect(levenshtein('개포자이', '반포자이')).toBe(1);
    });
  });

  describe('similarity — 0~1 정규화', () => {
    it('같으면 1', () => {
      expect(similarity('래미안역삼', '래미안역삼')).toBe(1);
    });

    it('완전히 다르면 0에 가깝다', () => {
      expect(similarity('가나다', 'xyz')).toBe(0);
    });

    it('한 글자 차이는 길이에 비례해 덜 깎인다', () => {
      // 긴 이름에서 한 글자 차이는 짧은 이름에서보다 덜 치명적이다
      expect(similarity('래미안역삼센트럴파크', '래미안역삼센트럴파스')).toBeGreaterThan(
        similarity('자이', '차이'),
      );
    });

    it.each([
      ['래미안역삼2차', '래미안역삼제2차'],
      ['e편한세상강남', 'e편한세상강남1'],
    ])('"%s" 와 "%s" 는 0.85 이상으로 비슷하다', (a, b) => {
      expect(similarity(a, b)).toBeGreaterThanOrEqual(0.85);
    });

    it.each([
      ['래미안역삼1차', '래미안역삼2차'],
      ['개포자이', '반포자이'],
      ['힐스테이트3단지', '힐스테이트8단지'],
    ])('"%s" 와 "%s" 는 비슷하지만 같지 않다 (1 미만)', (a, b) => {
      expect(similarity(a, b)).toBeLessThan(1);
    });

    it('빈 문자열끼리는 1', () => {
      expect(similarity('', '')).toBe(1);
    });

    it('한쪽이 비어 있으면 0', () => {
      expect(similarity('래미안', '')).toBe(0);
    });
  });
});
