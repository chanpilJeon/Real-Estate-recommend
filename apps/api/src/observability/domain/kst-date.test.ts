import { describe, expect, it } from 'vitest';

import { daysBetweenKst, kstDateOnly } from './kst-date';

describe('한국 시간 날짜 계산', () => {
  it('UTC 자정 직후는 한국에선 이미 같은 날 오전 9시다', () => {
    expect(kstDateOnly(new Date('2026-09-04T00:30:00Z')).toISOString()).toBe(
      '2026-09-04T00:00:00.000Z',
    );
  });

  it('UTC 오후 3시는 한국에선 이미 다음 날이다 (한도 초기화 경계)', () => {
    // 2026-09-04 15:00 UTC = 2026-09-05 00:00 KST
    expect(kstDateOnly(new Date('2026-09-04T15:00:00Z')).toISOString()).toBe(
      '2026-09-05T00:00:00.000Z',
    );
  });

  it('UTC 오후 2시 59분은 아직 한국에서 같은 날이다', () => {
    expect(kstDateOnly(new Date('2026-09-04T14:59:00Z')).toISOString()).toBe(
      '2026-09-04T00:00:00.000Z',
    );
  });

  describe('daysBetweenKst — 데이터 신선도 계산용', () => {
    it('같은 날이면 0', () => {
      expect(daysBetweenKst(new Date('2026-09-04T01:00:00Z'), new Date('2026-09-04T13:00:00Z'))).toBe(0);
    });

    it('3일 차이를 정확히 센다 (수집 장애 판단 기준)', () => {
      expect(daysBetweenKst(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-04T00:00:00Z'))).toBe(3);
    });
  });
});
