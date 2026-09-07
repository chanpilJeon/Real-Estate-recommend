/**
 * 단지 상세에서 외부 서비스로 내보내는 링크.
 *
 * 왜 "링크"인가 (Concept.md 3.2 / 3.3 / 7절):
 * - 매물(호가)은 네이버부동산도 어디선가 긁어오는 게 아니라 공인중개사가 올린 광고다.
 * - 중개대상물 광고는 개업공인중개사만 할 수 있어(공인중개사법) 우리가 직접 실을 수 없고,
 *   타 서비스의 매물을 크롤링하는 것은 약관 위반이며 법적 리스크가 있다.
 * 그래서 우리는 "어느 단지를 볼지"까지만 책임지고, 실제 매물 확인은 기존 서비스로 넘긴다.
 */

/** "736-1", "189" 같은 지번. 검색어에 넣으면 오히려 결과를 좁혀 방해가 된다. */
const JIBUN = /^\d+(-\d+)?$/;

/**
 * 지번 주소에서 검색에 쓸 지역 라벨을 뽑는다.
 * "서울특별시 강남구 역삼동 736-1" → "강남구 역삼동"
 *
 * 시도(서울특별시·경기도)를 빼는 이유: 지도 검색은 시군구+읍면동만으로 충분히 좁혀지고,
 * 토큰이 길수록 완전일치를 요구하는 검색엔진에서 결과가 사라지기 쉽다.
 */
export function regionLabelFromAddress(address: string): string {
  const tokens = address.trim().split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return '';

  const last = tokens[tokens.length - 1]!;
  const withoutJibun = JIBUN.test(last) ? tokens.slice(0, -1) : tokens;

  // 세종시처럼 시군구가 없는 주소는 시도를 빼면 남는 게 동뿐이다. 그건 그대로 쓴다.
  const withoutSido = withoutJibun.slice(1);
  return withoutSido.length > 0 ? withoutSido.join(' ') : withoutJibun.join(' ');
}

export interface ExternalLink {
  id: 'naver' | 'kakao' | 'molit';
  /** 버튼에 보이는 글자 */
  label: string;
  /** 카드에 함께 보이는 짧은 설명. 패널이 좁아 한두 줄을 넘기지 않는다 */
  hint: string;
  href: string;
}

/** 링크에 필요한 최소 정보만 받는다 (DTO 전체에 묶이지 않게) */
export interface LinkTarget {
  name: string;
  address: string;
}

export function externalLinks(complex: LinkTarget): ExternalLink[] {
  const region = regionLabelFromAddress(complex.address);
  // 네이버부동산 단지 검색은 이름 기반이라 지역을 붙이면 오히려 0건이 되기 쉽다.
  const naverQuery = complex.name;
  // 카카오맵은 장소·주소 검색이라 지역을 붙일수록 정확해진다.
  const kakaoQuery = region === '' ? complex.name : `${region} ${complex.name}`;

  return [
    {
      id: 'naver',
      label: '네이버부동산 매물',
      hint: '지금 나온 매물·호가',
      href: `https://new.land.naver.com/search?sk=${encodeURIComponent(naverQuery)}`,
    },
    {
      id: 'kakao',
      label: '카카오맵에서 보기',
      hint: '주변 지하철·학교·상권',
      href: `https://map.kakao.com/?q=${encodeURIComponent(kakaoQuery)}`,
    },
    {
      id: 'molit',
      label: '국토부 실거래가',
      hint: '실거래가 원본 대조',
      href: 'https://rt.molit.go.kr/',
    },
  ];
}
