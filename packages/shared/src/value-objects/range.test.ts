import { describe, expect, it } from 'vitest';

import { InvalidValueError } from '../errors';

import { Area } from './area';
import { Money } from './money';
import { Range } from './range';

describe('Range — 범위 값 객체', () => {
  const 오억 = Money.fromManwon(50_000);
  const 칠억 = Money.fromManwon(70_000);

  describe('생성', () => {
    it('하한과 상한으로 만든다', () => {
      const range = Range.of(오억, 칠억);
      expect(range.min?.toManwon()).toBe(50_000);
      expect(range.max?.toManwon()).toBe(70_000);
    });

    it('한쪽만 지정할 수 있다 (예산 상한만 정하는 경우가 흔하다)', () => {
      expect(Range.of(null, 칠억).min).toBeNull();
      expect(Range.of(오억, null).max).toBeNull();
    });

    it('하한이 상한보다 크면 거부한다 (조용히 뒤집지 않는다)', () => {
      expect(() => Range.of(칠억, 오억, '예산')).toThrow(InvalidValueError);
    });

    it('하한과 상한이 같으면 허용한다', () => {
      expect(() => Range.of(오억, 오억)).not.toThrow();
    });

    it('오류 메시지에 어떤 범위인지 담는다', () => {
      expect(() => Range.of(칠억, 오억, '예산')).toThrow(/예산/);
    });
  });

  describe('contains — 양끝 포함', () => {
    const range = Range.of(오억, 칠억);

    it.each([
      [50_000, true], // 하한 경계
      [70_000, true], // 상한 경계
      [60_000, true],
      [49_999, false],
      [70_001, false],
    ])('%i만원 → %s', (manwon, expected) => {
      expect(range.contains(Money.fromManwon(manwon))).toBe(expected);
    });

    it('제한이 없으면 무엇이든 포함한다', () => {
      expect(Range.unbounded<Money>().contains(Money.fromManwon(1))).toBe(true);
    });

    it('상한만 있으면 그 아래는 모두 포함', () => {
      const upTo = Range.of(null, 칠억);
      expect(upTo.contains(Money.fromManwon(1))).toBe(true);
      expect(upTo.contains(Money.fromManwon(80_000))).toBe(false);
    });
  });

  describe('면적에도 쓴다', () => {
    it('전용 59~85㎡ 범위', () => {
      const range = Range.of(Area.fromSqm(59), Area.fromSqm(85));
      expect(range.contains(Area.fromSqm(84.97))).toBe(true);
      expect(range.contains(Area.fromSqm(114.87))).toBe(false);
    });
  });

  it('isUnbounded', () => {
    expect(Range.unbounded<Money>().isUnbounded()).toBe(true);
    expect(Range.of(오억, null).isUnbounded()).toBe(false);
  });
});
