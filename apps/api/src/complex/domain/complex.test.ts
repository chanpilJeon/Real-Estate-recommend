import { Coordinate, RegionCode } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { Complex, LARGE_SCALE_HOUSEHOLDS, QUALITY_WEIGHTS, type ComplexProps } from './complex';

const NOW = new Date('2026-09-04T00:00:00Z');

function make(overrides: Partial<ComplexProps> = {}): Complex {
  return new Complex({
    id: 1,
    kaptCode: 'A0001',
    name: '래미안역삼',
    nameNormalized: '래미안역삼',
    regionCode: RegionCode.parse('1168010100'),
    address: '서울특별시 강남구 역삼동 736-1',
    coordinate: new Coordinate(37.4998, 127.0374),
    households: 1284,
    buildingCount: 12,
    approvalDate: new Date('2005-11-30T00:00:00Z'),
    builtYear: 2005,
    parkingCount: 1650,
    heatingType: '지역난방',
    nearestSubwayM: 125,
    nearestSchoolM: 330,
    ...overrides,
  });
}

describe('Complex — 단지 도메인 모델', () => {
  describe('ageYears — 연식', () => {
    it('사용승인일 기준으로 센다', () => {
      expect(make().ageYears(NOW)).toBe(20); // 2005-11-30 → 2026-09-04
    });

    it('사용승인일이 없으면 건축년도로 센다', () => {
      expect(make({ approvalDate: null, builtYear: 2010 }).ageYears(NOW)).toBe(16);
    });

    it('둘 다 없으면 null (0으로 채우면 신축으로 오인된다)', () => {
      expect(make({ approvalDate: null, builtYear: null }).ageYears(NOW)).toBeNull();
    });

    it('기념일 당일이면 정확히 그 햇수다 (일수 나눗셈 반올림 오차 방지)', () => {
      expect(make({ approvalDate: new Date('1996-09-04T00:00:00Z') }).ageYears(NOW)).toBe(30);
    });

    it('기념일 하루 전이면 아직 한 살 적다', () => {
      expect(make({ approvalDate: new Date('1996-09-05T00:00:00Z') }).ageYears(NOW)).toBe(29);
    });

    it('아직 준공 전이어도 음수가 나오지 않는다', () => {
      const future = new Date('2030-01-01T00:00:00Z');
      expect(make({ approvalDate: future }).ageYears(NOW)).toBe(0);
    });
  });

  describe('isLargeScale — 대단지 판정', () => {
    it(`${LARGE_SCALE_HOUSEHOLDS}세대 이상이면 대단지 (경계값 포함)`, () => {
      expect(make({ households: LARGE_SCALE_HOUSEHOLDS }).isLargeScale()).toBe(true);
      expect(make({ households: LARGE_SCALE_HOUSEHOLDS - 1 }).isLargeScale()).toBe(false);
    });
  });

  describe('parkingPerHousehold — 세대당 주차', () => {
    it('주차대수를 세대수로 나눈다', () => {
      expect(make({ households: 1000, parkingCount: 1200 }).parkingPerHousehold()).toBe(1.2);
    });

    it('세대수가 0이면 null (0으로 나누지 않는다)', () => {
      expect(make({ households: 0 }).parkingPerHousehold()).toBeNull();
    });
  });

  describe('qualityScore — 단지 품질 점수 (0~1)', () => {
    it('항상 0~1 범위 안이다', () => {
      const cases = [
        make(),
        make({ households: 0, parkingCount: 0, approvalDate: null, builtYear: null }),
        make({ households: 99_999, parkingCount: 99_999, approvalDate: new Date(NOW) }),
      ];
      for (const complex of cases) {
        const score = complex.qualityScore(NOW);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('모든 항목이 만점이면 1.0', () => {
      const perfect = make({
        households: 2000,
        parkingCount: 2500,
        approvalDate: new Date(NOW),
      });
      expect(perfect.qualityScore(NOW)).toBe(1);
    });

    it('세대수가 많을수록 높다 (다른 조건이 같을 때)', () => {
      const small = make({ households: 200, parkingCount: 200 });
      const large = make({ households: 1200, parkingCount: 1200 });
      expect(large.qualityScore(NOW)).toBeGreaterThan(small.qualityScore(NOW));
    });

    it('신축일수록 높다', () => {
      const old = make({ approvalDate: new Date('1996-01-01T00:00:00Z') });
      const recent = make({ approvalDate: new Date('2022-01-01T00:00:00Z') });
      expect(recent.qualityScore(NOW)).toBeGreaterThan(old.qualityScore(NOW));
    });

    it('30년이 넘으면 연식 점수가 0이 되어 더 내려가지 않는다', () => {
      const y30 = make({ approvalDate: new Date('1996-09-04T00:00:00Z') });
      const y50 = make({ approvalDate: new Date('1976-09-04T00:00:00Z') });
      expect(y50.qualityScore(NOW)).toBe(y30.qualityScore(NOW));
    });

    it('주차가 넉넉할수록 높다', () => {
      const tight = make({ households: 1000, parkingCount: 400 });
      const roomy = make({ households: 1000, parkingCount: 1200 });
      expect(roomy.qualityScore(NOW)).toBeGreaterThan(tight.qualityScore(NOW));
    });

    it('자료가 없는 항목은 0점이 아니라 중립(0.5)으로 계산한다', () => {
      // 세대수 0은 수집 미상: 모든 항목을 중립으로 계산
      const unknown = make({ households: 0, parkingCount: 0, approvalDate: null, builtYear: null });
      const expected = 0.5 * QUALITY_WEIGHTS.scale + 0.5 * QUALITY_WEIGHTS.age + 0.5 * QUALITY_WEIGHTS.parking;

      expect(unknown.qualityScore(NOW)).toBeCloseTo(expected, 3);
    });

    it('연식만 모르는 단지가 아주 오래된 단지보다 불리하지 않다', () => {
      const unknownAge = make({ approvalDate: null, builtYear: null });
      const veryOld = make({ approvalDate: new Date('1970-01-01T00:00:00Z') });

      expect(unknownAge.qualityScore(NOW)).toBeGreaterThan(veryOld.qualityScore(NOW));
    });

    it('가중치 합이 1이다 (점수가 1을 넘지 않는 근거)', () => {
      const sum = QUALITY_WEIGHTS.scale + QUALITY_WEIGHTS.age + QUALITY_WEIGHTS.parking;
      expect(sum).toBeCloseTo(1, 10);
    });
  });

  describe('qualityReasons — 사람이 읽는 근거', () => {
    it('대단지·신축·주차 조건을 만족하면 문장으로 알려준다', () => {
      const good = make({
        households: 1284,
        parkingCount: 1650,
        approvalDate: new Date('2020-01-01T00:00:00Z'),
      });
      const reasons = good.qualityReasons(NOW);

      expect(reasons).toContain('1,284세대 대단지');
      expect(reasons.some((r) => r.includes('신축급'))).toBe(true);
      expect(reasons.some((r) => r.includes('세대당 주차'))).toBe(true);
    });

    it('내세울 게 없으면 빈 배열 (없는 장점을 지어내지 않는다)', () => {
      const plain = make({
        households: 120,
        parkingCount: 60,
        approvalDate: new Date('1990-01-01T00:00:00Z'),
      });
      expect(plain.qualityReasons(NOW)).toEqual([]);
    });
  });
});
