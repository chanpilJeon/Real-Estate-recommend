import { describe, expect, it } from 'vitest';

import { jibunFromAddress, normalizeJibun } from './jibun';

describe('normalizeJibun — 지번 표기 맞추기', () => {
  it.each([
    ['761-10', '761-10'],
    ['0761-0010', '761-10'], // CSV 의 본번/부번은 0 으로 채워져 온다
    ['708', '708'],
    ['0708', '708'],
    ['761 - 10', '761-10'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeJibun(raw)).toBe(expected);
  });

  it('부번 0 은 부번이 없는 것과 같다', () => {
    expect(normalizeJibun('708-0')).toBe('708');
    expect(normalizeJibun('0708-0000')).toBe('708');
    expect(normalizeJibun('708-0')).toBe(normalizeJibun('708'));
  });

  it('지번 형태가 아니면 null — 엉뚱한 값으로 단지를 이어붙이면 안 된다', () => {
    for (const bad of ['', '-', '산12', '역삼동', 'A-1', '761-10-3', null, undefined]) {
      expect(normalizeJibun(bad)).toBeNull();
    }
  });
});

describe('jibunFromAddress — 주소 끝의 지번 떼어내기', () => {
  it('K-apt 주소에서 지번을 뽑는다', () => {
    expect(jibunFromAddress('서울특별시 강남구 역삼동 761-10')).toBe('761-10');
  });

  it('읍·면 주소(리 포함)에서도 뽑는다', () => {
    expect(jibunFromAddress('경기도 남양주시 진접읍 내곡리 123-4')).toBe('123-4');
  });

  it('지번이 없는 주소는 null', () => {
    expect(jibunFromAddress('서울특별시 강남구 역삼동')).toBeNull();
  });

  it('도로명주소의 건물번호를 지번으로 착각하지 않는다 ★', () => {
    // 잘못 읽으면 "테헤란로48길 10" 과 "○○동 10" 이 같은 번지로 묶인다
    for (const road of [
      '서울특별시 강남구 테헤란로48길 10',
      '서울특별시 강남구 삼성로 150',
      '경기도 성남시 분당구 판교대로 235',
      '서울특별시 강남구 광평로51길 27',
    ]) {
      expect(jibunFromAddress(road)).toBeNull();
    }
  });

  it('빈 주소도 터지지 않는다', () => {
    expect(jibunFromAddress('   ')).toBeNull();
  });
});
