/**
 * 생활권 별칭 사전 초기값 (ToDo.md 3.3, 5.1).
 *
 * "미사", "판교" 처럼 행정구역명이 아닌 이름으로 검색하는 사용자를 위한 사전이다.
 *
 * ⚠ 법정동 **코드를 직접 적지 않는다.** 시도·시군구·동 이름으로 적고,
 *   시드할 때 실제 적재된 regions 테이블에서 찾아 연결한다.
 *   못 찾으면 경고만 남기고 건너뛴다 — 잘못된 코드가 들어가는 것보다 낫다.
 *
 * 이 목록은 출발점일 뿐이다. 운영하면서 관리자 화면으로 늘려간다.
 */
export interface AliasSeed {
  alias: string;
  sido: string;
  /** 시군구 이름 (부분 일치) */
  sigungu: string;
  dongNames: string[];
}

export const ALIAS_SEEDS: AliasSeed[] = [
  { alias: '미사', sido: '경기도', sigungu: '하남시', dongNames: ['망월동', '풍산동', '선동', '덕풍동'] },
  {
    alias: '판교',
    sido: '경기도',
    sigungu: '성남시 분당구',
    dongNames: ['판교동', '삼평동', '백현동', '운중동'],
  },
  {
    alias: '광교',
    sido: '경기도',
    sigungu: '수원시 영통구',
    dongNames: ['이의동', '하동', '원천동'],
  },
  { alias: '마곡', sido: '서울특별시', sigungu: '강서구', dongNames: ['마곡동'] },
  { alias: '상암', sido: '서울특별시', sigungu: '마포구', dongNames: ['상암동'] },
  { alias: '목동', sido: '서울특별시', sigungu: '양천구', dongNames: ['목동', '신정동'] },
  { alias: '잠실', sido: '서울특별시', sigungu: '송파구', dongNames: ['잠실동', '신천동'] },
  { alias: '반포', sido: '서울특별시', sigungu: '서초구', dongNames: ['반포동'] },
  { alias: '대치', sido: '서울특별시', sigungu: '강남구', dongNames: ['대치동'] },
];
