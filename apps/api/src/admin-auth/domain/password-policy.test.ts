import { describe, expect, it } from 'vitest';

import { countCharacterTypes, PasswordPolicy } from './password-policy';

describe('PasswordPolicy — 비밀번호 정책 (ToDo.md 8절)', () => {
  describe('countCharacterTypes', () => {
    it.each([
      ['abcdefghij', 1],
      ['abcdefghi1', 2],
      ['Abcdefghi1', 3],
      ['Abcdefghi1!', 4],
      ['1234567890', 1],
    ])('"%s" → %i종', (pw, expected) => {
      expect(countCharacterTypes(pw)).toBe(expected);
    });
  });

  describe('validate', () => {
    it('10자 이상 + 2종 이상이면 통과', () => {
      expect(PasswordPolicy.validate('apartment1').ok).toBe(true);
    });

    it('9자는 거부하고 이유를 알려준다', () => {
      const result = PasswordPolicy.validate('apartme1');
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('10자 이상'))).toBe(true);
    });

    it('정확히 10자는 통과 (경계값)', () => {
      expect(PasswordPolicy.validate('apartment1')).toEqual({ ok: true, errors: [] });
    });

    it('한 종류만 쓰면 거부한다', () => {
      const result = PasswordPolicy.validate('abcdefghijkl');
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('2종류 이상'))).toBe(true);
    });

    it('초기 비밀번호는 거부한다', () => {
      expect(PasswordPolicy.validate('12345').ok).toBe(false);
    });

    it('문제가 여러 개면 한 번에 다 알려준다 (하나씩 고치게 하지 않는다)', () => {
      const result = PasswordPolicy.validate('abc');
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('빈 문자열도 터지지 않는다', () => {
      expect(PasswordPolicy.validate('').ok).toBe(false);
    });

    it('한글은 영숫자가 아니므로 문자 종류 하나로 센다', () => {
      // 한글 8자 + 숫자 4자 = 12자, 2종 → 통과
      expect(PasswordPolicy.validate('아파트추천서비스1234').ok).toBe(true);
      // 한글만 10자는 1종이라 거부
      expect(PasswordPolicy.validate('아파트추천서비스입니다').ok).toBe(false);
    });
  });

  describe('isDefaultPassword — 대시보드 경고 배너용', () => {
    it('초기값이면 참', () => {
      expect(PasswordPolicy.isDefaultPassword('12345')).toBe(true);
    });

    it('바꾼 비밀번호면 거짓', () => {
      expect(PasswordPolicy.isDefaultPassword('apartment1')).toBe(false);
    });
  });
});
