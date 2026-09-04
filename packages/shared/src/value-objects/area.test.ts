import { describe, expect, it } from 'vitest';

import { InvalidValueError } from '../errors';

import { Area } from './area';

describe('Area — 면적 값 객체', () => {
  describe('생성', () => {
    it('m² 로 만든다', () => {
      expect(Area.fromSqm(84.97).toSqm()).toBe(84.97);
    });

    it('평으로 만들면 m² 로 환산해 보관한다', () => {
      expect(Area.fromPyeong(25).toSqm()).toBeCloseTo(82.64, 2);
    });

    it('0 이하는 거부한다 (면적이 0인 집은 없다)', () => {
      expect(() => Area.fromSqm(0)).toThrow(InvalidValueError);
      expect(() => Area.fromSqm(-1)).toThrow(InvalidValueError);
      expect(() => Area.fromPyeong(0)).toThrow(InvalidValueError);
    });

    it('숫자가 아니면 거부한다', () => {
      expect(() => Area.fromSqm(NaN)).toThrow(InvalidValueError);
      expect(() => Area.fromSqm(undefined as unknown as number)).toThrow(InvalidValueError);
    });
  });

  describe('평 환산', () => {
    it.each([
      [84.97, 25.7], // ToDo.md 3.1 명세 예시
      [59.94, 18.1],
      [114.87, 34.7],
      [33.05785, 10],
    ])('%f㎡ → %f평', (sqm, pyeong) => {
      expect(Area.fromSqm(sqm).toPyeong()).toBe(pyeong);
    });

    it('m²↔평 왕복 변환에서 값이 보존된다', () => {
      const original = Area.fromSqm(84.97);
      expect(Area.fromPyeong(original.toPyeong()).toSqm()).toBeCloseTo(84.97, 1);
    });
  });

  describe('toTypeLabel — 단지 면적타입 라벨', () => {
    it.each([
      [84.97, '84㎡ (25평)'], // ToDo.md 3.1 명세 예시
      [59.94, '59㎡ (18평)'],
      [114.87, '114㎡ (34평)'],
    ])('%f㎡ → "%s"', (sqm, label) => {
      expect(Area.fromSqm(sqm).toTypeLabel()).toBe(label);
    });

    it('올림이 아니라 내림을 쓴다 (84.97㎡ 를 "85타입"이라 부르지 않는다)', () => {
      expect(Area.fromSqm(84.99).toTypeLabel()).toContain('84㎡');
    });
  });

  it('toString() 은 면적타입 라벨을 낸다', () => {
    expect(String(Area.fromSqm(84.97))).toBe('84㎡ (25평)');
  });

  describe('비교', () => {
    it('범위 판정은 양끝을 포함한다', () => {
      const min = Area.fromSqm(59);
      const max = Area.fromSqm(85);

      expect(Area.fromSqm(59).isWithin(min, max)).toBe(true);
      expect(Area.fromSqm(85).isWithin(min, max)).toBe(true);
      expect(Area.fromSqm(58.9).isWithin(min, max)).toBe(false);
      expect(Area.fromSqm(85.1).isWithin(min, max)).toBe(false);
    });

    it('compare 는 -1 / 0 / 1 을 돌려준다', () => {
      expect(Area.fromSqm(59).compare(Area.fromSqm(84))).toBe(-1);
      expect(Area.fromSqm(84).compare(Area.fromSqm(59))).toBe(1);
      expect(Area.fromSqm(84).compare(Area.fromSqm(84))).toBe(0);
    });
  });
});
