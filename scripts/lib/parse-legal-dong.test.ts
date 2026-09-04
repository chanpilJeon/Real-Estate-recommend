import { describe, expect, it } from 'vitest';

import { levelOf, parseLegalDongFile, splitName } from './parse-legal-dong';

describe('법정동코드 파서', () => {
  describe('levelOf — 코드 자릿수로 행정 단계를 판별한다', () => {
    it.each([
      ['1100000000', 'sido'], // 서울특별시
      ['1111000000', 'sigungu'], // 서울특별시 종로구
      ['1111010100', 'dong'], // 서울특별시 종로구 청운동
      ['4182025021', 'ri'], // 경기도 가평군 …리 (뒤 2자리가 00이 아님)
    ] as const)('%s → %s', (code, level) => {
      expect(levelOf(code)).toBe(level);
    });
  });

  describe('splitName — 법정동명을 시도/시군구/동으로 쪼갠다', () => {
    it('일반적인 3단어', () => {
      expect(splitName('서울특별시 종로구 청운동', 'dong')).toEqual({
        sido: '서울특별시',
        sigungu: '종로구',
        dong: '청운동',
      });
    });

    it('시군구가 두 단어인 경우 (수원시 영통구)', () => {
      expect(splitName('경기도 수원시 영통구 영통동', 'dong')).toEqual({
        sido: '경기도',
        sigungu: '수원시 영통구',
        dong: '영통동',
      });
    });

    it('시군구 단계가 없는 경우 (세종시) — 시도명으로 채운다', () => {
      expect(splitName('세종특별자치시 반곡동', 'dong')).toEqual({
        sido: '세종특별자치시',
        sigungu: '세종특별자치시',
        dong: '반곡동',
      });
    });

    it('시군구 단위는 동이 없다', () => {
      expect(splitName('서울특별시 종로구', 'sigungu')).toEqual({
        sido: '서울특별시',
        sigungu: '종로구',
        dong: null,
      });
    });

    it('시도 단위', () => {
      expect(splitName('서울특별시', 'sido')).toEqual({
        sido: '서울특별시',
        sigungu: '',
        dong: null,
      });
    });
  });

  describe('parseLegalDongFile', () => {
    const sample = [
      '법정동코드\t법정동명\t폐지여부',
      '1100000000\t서울특별시\t존재',
      '1111000000\t서울특별시 종로구\t존재',
      '1111010100\t서울특별시 종로구 청운동\t존재',
      '4111100000\t경기도 수원시 장안구\t존재',
      '4111710100\t경기도 수원시 영통구 매탄동\t존재',
      '4182025021\t경기도 가평군 가평읍 상색리\t존재',
      '1111010200\t서울특별시 종로구 없어진동\t폐지',
      '',
    ].join('\n');

    it('헤더와 빈 줄을 건너뛴다', () => {
      const rows = parseLegalDongFile(sample);
      expect(rows.every((r) => /^\d{10}$/.test(r.code))).toBe(true);
    });

    it('리(里) 단위는 제외한다', () => {
      const rows = parseLegalDongFile(sample);
      expect(rows.find((r) => r.code === '4182025021')).toBeUndefined();
    });

    it('시군구코드는 앞 5자리다', () => {
      const row = parseLegalDongFile(sample).find((r) => r.code === '1111010100');
      expect(row?.sigunguCode).toBe('11110');
    });

    it('폐지된 법정동은 isActive=false 로 표시한다 (지우지는 않는다)', () => {
      const rows = parseLegalDongFile(sample);
      expect(rows.find((r) => r.code === '1111010200')?.isActive).toBe(false);
      expect(rows.find((r) => r.code === '1111010100')?.isActive).toBe(true);
    });

    it('샘플에서 리를 뺀 6건을 읽는다', () => {
      expect(parseLegalDongFile(sample)).toHaveLength(6);
    });
  });
});
