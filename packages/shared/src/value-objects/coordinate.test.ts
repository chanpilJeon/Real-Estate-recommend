import { describe, expect, it } from 'vitest';

import { InvalidValueError } from '../errors';

import { Coordinate } from './coordinate';

// 실제 좌표 (기대값은 Haversine 공식으로 별도 계산해 고정)
const 서울시청 = new Coordinate(37.5663, 126.9779);
const 강남역 = new Coordinate(37.4979, 127.0276);
const 역삼역 = new Coordinate(37.5006, 127.0364);

describe('Coordinate — 좌표 값 객체', () => {
  describe('생성 검증', () => {
    it('정상 좌표를 받는다', () => {
      const c = new Coordinate(37.4979, 127.0276);
      expect(c.lat).toBe(37.4979);
      expect(c.lng).toBe(127.0276);
    });

    it('경계값을 허용한다', () => {
      expect(() => new Coordinate(90, 180)).not.toThrow();
      expect(() => new Coordinate(-90, -180)).not.toThrow();
      expect(() => new Coordinate(0, 0)).not.toThrow();
    });

    it('범위를 벗어난 위도·경도는 거부한다', () => {
      expect(() => new Coordinate(90.1, 127)).toThrow(InvalidValueError);
      expect(() => new Coordinate(-90.1, 127)).toThrow(InvalidValueError);
      expect(() => new Coordinate(37, 180.1)).toThrow(InvalidValueError);
      expect(() => new Coordinate(37, -180.1)).toThrow(InvalidValueError);
    });

    it('숫자가 아니면 거부한다', () => {
      expect(() => new Coordinate(NaN, 127)).toThrow(InvalidValueError);
      expect(() => new Coordinate(37, undefined as unknown as number)).toThrow(InvalidValueError);
    });
  });

  describe('distanceTo — Haversine 직선거리 (미터)', () => {
    it('같은 지점은 0m', () => {
      expect(강남역.distanceTo(강남역)).toBe(0);
    });

    it('위도 1도 차이는 약 111km', () => {
      const a = new Coordinate(37, 127);
      const b = new Coordinate(38, 127);
      expect(a.distanceTo(b)).toBe(111_195);
    });

    it('서울시청 → 강남역 은 약 8.8km', () => {
      expect(서울시청.distanceTo(강남역)).toBe(8_778);
    });

    it('강남역 → 역삼역 은 약 830m (한 정거장)', () => {
      expect(강남역.distanceTo(역삼역)).toBe(832);
    });

    it('방향이 바뀌어도 거리는 같다 (대칭)', () => {
      expect(강남역.distanceTo(서울시청)).toBe(서울시청.distanceTo(강남역));
    });
  });

  it('toString() 은 (위도, 경도) 형태로 낸다', () => {
    expect(String(강남역)).toBe('(37.4979, 127.0276)');
  });

  describe('walkingMinutes — 도보 분 (80m/분)', () => {
    it('같은 지점은 0분', () => {
      expect(강남역.walkingMinutes(강남역)).toBe(0);
    });

    it('강남역 → 역삼역(832m) 은 도보 11분', () => {
      expect(강남역.walkingMinutes(역삼역)).toBe(11);
    });

    it('올림 처리한다 (81m 는 2분)', () => {
      const origin = new Coordinate(37.5, 127);
      // 위도 0.000728도 ≈ 81m
      const near = new Coordinate(37.500728, 127);
      expect(origin.distanceTo(near)).toBeGreaterThan(80);
      expect(origin.walkingMinutes(near)).toBe(2);
    });
  });
});
