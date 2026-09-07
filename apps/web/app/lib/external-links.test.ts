import { describe, expect, it } from 'vitest';

import { externalLinks, regionLabelFromAddress } from './external-links';

describe('regionLabelFromAddress — 주소에서 검색용 지역 라벨 뽑기', () => {
  it.each([
    ['서울특별시 강남구 역삼동 736-1', '강남구 역삼동'],
    ['경기도 하남시 망월동 1130', '하남시 망월동'],
    ['경기도 수원시 영통구 영통동 960', '수원시 영통구 영통동'],
  ])('%s → %s', (address, expected) => {
    expect(regionLabelFromAddress(address)).toBe(expected);
  });

  it('세종시처럼 시군구가 없으면 동만 남는다', () => {
    expect(regionLabelFromAddress('세종특별자치시 도담동 620')).toBe('도담동');
  });

  it('시도만 있는 주소는 시도를 지우지 않는다 (지울 게 남지 않으므로)', () => {
    expect(regionLabelFromAddress('세종특별자치시')).toBe('세종특별자치시');
  });

  it('지번이 없으면 그대로 둔다', () => {
    expect(regionLabelFromAddress('서울특별시 강남구 역삼동')).toBe('강남구 역삼동');
  });

  it('동 이름에 숫자가 섞여도 지번으로 오해하지 않는다', () => {
    expect(regionLabelFromAddress('서울특별시 강남구 삼성1동')).toBe('강남구 삼성1동');
  });

  it('공백이 여러 개거나 앞뒤에 붙어 있어도 견딘다', () => {
    expect(regionLabelFromAddress('  서울특별시   강남구  역삼동 736-1 ')).toBe('강남구 역삼동');
  });

  it('빈 주소는 빈 문자열', () => {
    expect(regionLabelFromAddress('   ')).toBe('');
  });
});

describe('externalLinks — 외부 서비스 링크', () => {
  const target = { name: '래미안역삼1차', address: '서울특별시 강남구 역삼동 736-1' };

  it('네이버·카카오·국토부 세 곳을 준다', () => {
    expect(externalLinks(target).map((link) => link.id)).toEqual(['naver', 'kakao', 'molit']);
  });

  it('네이버는 단지명만으로 검색한다 (지역을 붙이면 0건이 되기 쉬움)', () => {
    const naver = externalLinks(target).find((link) => link.id === 'naver')!;
    expect(naver.href).toBe(
      `https://new.land.naver.com/search?sk=${encodeURIComponent('래미안역삼1차')}`,
    );
  });

  it('카카오는 지역 + 단지명으로 검색한다', () => {
    const kakao = externalLinks(target).find((link) => link.id === 'kakao')!;
    expect(kakao.href).toBe(
      `https://map.kakao.com/?q=${encodeURIComponent('강남구 역삼동 래미안역삼1차')}`,
    );
  });

  it('국토부는 단지별 딥링크가 없어 대문으로 보낸다', () => {
    const molit = externalLinks(target).find((link) => link.id === 'molit')!;
    expect(molit.href).toBe('https://rt.molit.go.kr/');
  });

  it('단지명의 괄호·＆ 같은 문자가 URL을 깨뜨리지 않는다', () => {
    const links = externalLinks({ name: '개포자이(1차)&', address: '서울특별시 강남구 개포동 189' });
    for (const link of links) {
      expect(() => new URL(link.href)).not.toThrow();
    }
    const naver = links.find((link) => link.id === 'naver')!;
    expect(new URL(naver.href).searchParams.get('sk')).toBe('개포자이(1차)&');
  });

  it('주소가 비어 있으면 카카오도 단지명만으로 검색한다', () => {
    const kakao = externalLinks({ name: '어떤단지', address: '' }).find(
      (link) => link.id === 'kakao',
    )!;
    expect(new URL(kakao.href).searchParams.get('q')).toBe('어떤단지');
  });

  it('모든 링크는 https 이고 설명이 붙어 있다', () => {
    for (const link of externalLinks(target)) {
      expect(new URL(link.href).protocol).toBe('https:');
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.hint.length).toBeGreaterThan(0);
    }
  });
});
