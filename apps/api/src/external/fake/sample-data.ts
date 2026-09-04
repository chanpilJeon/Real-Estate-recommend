/**
 * 데모 모드용 샘플 데이터 (ToDo.md 7.2).
 *
 * 공공 API 키 승인 전에도 화면과 기능 전체를 확인할 수 있게 하는 것이 목적이다.
 * **실제 거래 기록이 아니다** — 형태만 진짜와 같게 만든 가짜 값이다.
 *
 * 지역은 서울 강남구(11680)와 경기 하남시(41450) 두 곳만 담았다.
 * 화면·매칭·통계를 시험하기에 충분하고, 더 늘리면 유지가 어렵다.
 */

export interface SampleComplex {
  kaptCode: string;
  name: string;
  sigunguCode: string;
  sido: string;
  sigungu: string;
  dong: string;
  jibun: string;
  address: string;
  lat: number;
  lng: number;
  households: number;
  buildingCount: number;
  approvalDate: string;
  builtYear: number;
  parkingCount: number;
  heatingType: string;
  /** 이 단지가 가진 전용면적 타입들 */
  areas: number[];
  /** 84㎡ 기준 대략적인 시세(만원). 다른 면적은 비례로 만든다 */
  basePriceManwon: number;
}

export const SAMPLE_COMPLEXES: SampleComplex[] = [
  {
    kaptCode: 'DEMO-A0001',
    name: '데모래미안역삼',
    sigunguCode: '11680',
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '역삼동',
    jibun: '736-1',
    address: '서울특별시 강남구 역삼동 736-1',
    lat: 37.4998,
    lng: 127.0374,
    households: 1284,
    buildingCount: 12,
    approvalDate: '2005-11-30',
    builtYear: 2005,
    parkingCount: 1650,
    heatingType: '지역난방',
    areas: [59.94, 84.97, 114.87],
    basePriceManwon: 245_000,
  },
  {
    kaptCode: 'DEMO-A0002',
    name: '데모개포자이(1차)',
    sigunguCode: '11680',
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '개포동',
    jibun: '189',
    address: '서울특별시 강남구 개포동 189',
    lat: 37.4783,
    lng: 127.0553,
    households: 640,
    buildingCount: 6,
    approvalDate: '1994-06-15',
    builtYear: 1994,
    parkingCount: 520,
    heatingType: '개별난방',
    areas: [49.86, 84.43],
    basePriceManwon: 198_000,
  },
  {
    kaptCode: 'DEMO-A0003',
    name: '데모대치푸르지오',
    sigunguCode: '11680',
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '대치동',
    jibun: '511',
    address: '서울특별시 강남구 대치동 511',
    lat: 37.4995,
    lng: 127.0629,
    households: 912,
    buildingCount: 9,
    approvalDate: '2012-03-20',
    builtYear: 2012,
    parkingCount: 1300,
    heatingType: '지역난방',
    areas: [59.99, 84.99],
    basePriceManwon: 268_000,
  },
  {
    kaptCode: 'DEMO-B0001',
    name: '데모미사강변센트럴',
    sigunguCode: '41450',
    sido: '경기도',
    sigungu: '하남시',
    dong: '망월동',
    jibun: '1130',
    address: '경기도 하남시 망월동 1130',
    lat: 37.5648,
    lng: 127.1927,
    households: 1560,
    buildingCount: 15,
    approvalDate: '2016-08-10',
    builtYear: 2016,
    parkingCount: 2100,
    heatingType: '지역난방',
    areas: [59.97, 84.96],
    basePriceManwon: 98_000,
  },
  {
    kaptCode: 'DEMO-B0002',
    name: '데모풍산아이파크 3단지',
    sigunguCode: '41450',
    sido: '경기도',
    sigungu: '하남시',
    dong: '풍산동',
    jibun: '480',
    address: '경기도 하남시 풍산동 480',
    lat: 37.5528,
    lng: 127.2043,
    households: 780,
    buildingCount: 8,
    approvalDate: '2008-12-05',
    builtYear: 2008,
    parkingCount: 900,
    heatingType: '개별난방',
    areas: [59.85, 84.88, 101.94],
    basePriceManwon: 82_000,
  },
];

/** 지하철역·학교 샘플 (입지 점수 계산용) */
export const SAMPLE_PLACES = [
  { name: '데모역삼역', categoryCode: 'SW8', lat: 37.5006, lng: 127.0364, extra: { line: '2호선' } },
  { name: '데모선릉역', categoryCode: 'SW8', lat: 37.5044, lng: 127.0489, extra: { line: '2호선' } },
  { name: '데모대치역', categoryCode: 'SW8', lat: 37.4945, lng: 127.0631, extra: { line: '3호선' } },
  { name: '데모미사역', categoryCode: 'SW8', lat: 37.5606, lng: 127.1925, extra: { line: '5호선' } },
  { name: '데모역삼초등학교', categoryCode: 'SC4', lat: 37.4972, lng: 127.0392, extra: {} },
  { name: '데모대곡초등학교', categoryCode: 'SC4', lat: 37.4801, lng: 127.0548, extra: {} },
  { name: '데모대치초등학교', categoryCode: 'SC4', lat: 37.5011, lng: 127.0605, extra: {} },
  { name: '데모미사초등학교', categoryCode: 'SC4', lat: 37.5661, lng: 127.1901, extra: {} },
];

export const SAMPLE_SIGUNGU_CODES = ['11680', '41450'];
