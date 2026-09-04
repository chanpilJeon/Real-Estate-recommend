import { describe, expect, it } from 'vitest';

import { InvalidValueError } from '../errors';

import { Money } from './money';

describe('Money — 금액 값 객체', () => {
  describe('생성', () => {
    it('만원 단위로 만든다', () => {
      expect(Money.fromManwon(85_000).toManwon()).toBe(85_000);
    });

    it('원 단위를 만원으로 환산한다', () => {
      expect(Money.fromWon(850_000_000).toManwon()).toBe(85_000);
    });

    it('소수점은 반올림한다 (내부 표현은 만원 정수)', () => {
      expect(Money.fromManwon(85_000.4).toManwon()).toBe(85_000);
      expect(Money.fromManwon(85_000.6).toManwon()).toBe(85_001);
    });

    it('0원을 허용한다 (경계값)', () => {
      expect(Money.zero().toManwon()).toBe(0);
      expect(Money.fromManwon(0).toManwon()).toBe(0);
    });

    it('음수는 거부한다', () => {
      expect(() => Money.fromManwon(-1)).toThrow(InvalidValueError);
      expect(() => Money.fromWon(-10_000)).toThrow(InvalidValueError);
    });

    it('숫자가 아니면 거부한다', () => {
      expect(() => Money.fromManwon(NaN)).toThrow(InvalidValueError);
      expect(() => Money.fromManwon(Infinity)).toThrow(InvalidValueError);
      expect(() => Money.fromManwon('85000' as unknown as number)).toThrow(InvalidValueError);
    });
  });

  describe('toKoreanText — 한국어 표기', () => {
    it.each([
      [85_000, '8억 5,000만원'], // ToDo.md 3.1 명세 예시
      [80_000, '8억'],
      [100_000, '10억'],
      [123_456, '12억 3,456만원'],
      [9_999, '9,999만원'],
      [10_000, '1억'],
      [500, '500만원'],
      [0, '0원'],
      [1_234_567, '123억 4,567만원'],
    ])('%i만원 → "%s"', (manwon, expected) => {
      expect(Money.fromManwon(manwon).toKoreanText()).toBe(expected);
    });

    it('toString() 도 같은 결과를 낸다', () => {
      expect(String(Money.fromManwon(85_000))).toBe('8억 5,000만원');
    });
  });

  describe('비교', () => {
    it('범위 판정은 양끝을 포함한다', () => {
      const min = Money.fromManwon(50_000);
      const max = Money.fromManwon(70_000);

      expect(Money.fromManwon(50_000).isWithin(min, max)).toBe(true); // 하한 경계
      expect(Money.fromManwon(70_000).isWithin(min, max)).toBe(true); // 상한 경계
      expect(Money.fromManwon(60_000).isWithin(min, max)).toBe(true);
      expect(Money.fromManwon(49_999).isWithin(min, max)).toBe(false);
      expect(Money.fromManwon(70_001).isWithin(min, max)).toBe(false);
    });

    it('compare 는 -1 / 0 / 1 을 돌려준다', () => {
      const a = Money.fromManwon(50_000);
      const b = Money.fromManwon(70_000);

      expect(a.compare(b)).toBe(-1);
      expect(b.compare(a)).toBe(1);
      expect(a.compare(Money.fromManwon(50_000))).toBe(0);
    });

    it('같은 금액이면 equals 가 참이다 (값 객체 동등성)', () => {
      expect(Money.fromManwon(85_000).equals(Money.fromWon(850_000_000))).toBe(true);
    });
  });

  it('만원↔원 왕복 변환에서 값이 보존된다', () => {
    const original = Money.fromManwon(85_000);
    expect(Money.fromWon(original.toWon()).toManwon()).toBe(85_000);
  });
});
