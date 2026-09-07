import { describe, expect, it } from 'vitest';

import {
  MolitCsvError,
  detectCsvKind,
  parseCsvLine,
  parseRentCsv,
  parseTradeCsv,
  splitSigunguAndDong,
} from './molit-csv-parser';

/**
 * 아래 픽스처는 rt.molit.go.kr [조건별 자료제공]에서 실제로 내려받은 파일에서 옮긴 것이다
 * (2026-09, 서울 강남구). 손으로 지어낸 형식이 아니다.
 */
const PREAMBLE = [
  '"□ 본 서비스에서 제공하는 정보는 법적인 효력이 없으므로 참고용으로만 활용하시기 바랍니다."',
  '"□ 본 자료는 계약일 기준입니다. (※ 7월 계약, 8월 신고건 → 7월 거래건으로  제공)"',
  '""',
  '"□ 검색조건"',
  '"계약일자 : 2026-08-01 ~ 2026-08-07"',
  '"실거래구분 : 아파트(매매)"',
  '"시군구 : 강남구"',
].join('\n');

const TRADE_HEADER =
  '"NO","시군구","번지","본번","부번","단지명","전용면적(㎡)","계약년월","계약일",' +
  '"거래금액(만원)","동","층","매수자","매도자","건축년도","도로명","해제사유발생일",' +
  '"거래유형","중개사소재지","등기일자"';

const TRADE_ROWS = [
  '"1","서울특별시 강남구 수서동","708","0708","0000","삼익","49.2000","202608","07",' +
    '"212,000","401","8","개인","개인","1992","광평로51길 27","-","중개거래","서울 강남구","26.08.27"',
  // 중개사소재지에 쉼표가 들어 있다 — 따옴표를 못 지키면 칸이 밀린다
  '"3","서울특별시 강남구 자곡동","618","0618","0000","(토지임대부아파트)강남브리즈힐","84.2900",' +
    '"202608","07","130,000","-","6","개인","개인","2014","자곡로3길 45","-","중개거래",' +
    '"경기 화성시 동탄구, 서울 강남구","-"',
];

const tradeCsv = (...rows: string[]): string =>
  [PREAMBLE, TRADE_HEADER, ...rows].join('\n') + '\n';

const RENT_HEADER =
  '"NO","시군구","번지","본번","부번","단지명","전월세구분","전용면적(㎡)","계약년월","계약일",' +
  '"보증금(만원)","월세금(만원)","층","건축년도","도로명","계약기간","계약구분",' +
  '"갱신요구권 사용","종전계약 보증금(만원)","종전계약 월세(만원)","주택유형"';

const RENT_ROWS = [
  '"1","서울특별시 강남구 수서동","795","0795","0000","강남데시앙포레","전세","84.8600","202608",' +
    '"03","90,000","0","8","2014","광평로34길 55","202610~202810","갱신","사용","90,000","0","아파트"',
  '"3","서울특별시 강남구 일원동","688","0688","0000","상록스타힐스","월세","46.8550","202608",' +
    '"03","33,431","65","7","2022","영동대로 16","202609~202808","신규","-","","","아파트"',
];

const rentCsv = (...rows: string[]): string => [PREAMBLE, RENT_HEADER, ...rows].join('\n') + '\n';

describe('parseCsvLine — 따옴표 안의 쉼표 지키기', () => {
  it('평범한 줄을 칸으로 나눈다', () => {
    expect(parseCsvLine('"a","b","c"')).toEqual(['a', 'b', 'c']);
  });

  it('따옴표 안의 쉼표는 칸 구분자가 아니다', () => {
    expect(parseCsvLine('"1","경기 화성시, 서울 강남구","3"')).toEqual([
      '1',
      '경기 화성시, 서울 강남구',
      '3',
    ]);
  });

  it('"" 는 따옴표 한 글자', () => {
    expect(parseCsvLine('"그는 ""안녕"" 했다"')).toEqual(['그는 "안녕" 했다']);
  });

  it('빈 칸도 자리를 지킨다', () => {
    expect(parseCsvLine('"a","","c"')).toEqual(['a', '', 'c']);
  });
});

describe('splitSigunguAndDong — 시군구와 법정동 가르기', () => {
  it.each([
    ['서울특별시 강남구 수서동', '서울특별시 강남구', '수서동'],
    ['경기도 수원시 영통구 영통동', '경기도 수원시 영통구', '영통동'],
    ['세종특별자치시 도담동', '세종특별자치시', '도담동'],
    ['경기도 양평군 양평읍', '경기도 양평군', '양평읍'],
  ])('%s → 시군구 %s / 동 %s', (full, sigungu, dong) => {
    expect(splitSigunguAndDong(full)).toEqual({ sigunguName: sigungu, legalDongName: dong });
  });

  it('토큰이 하나뿐이면 동은 비운다', () => {
    expect(splitSigunguAndDong('세종특별자치시')).toEqual({
      sigunguName: '세종특별자치시',
      legalDongName: '',
    });
  });
});

describe('parseTradeCsv — 아파트 매매', () => {
  it('안내문 줄 수와 상관없이 헤더를 찾아낸다', () => {
    const withLongPreamble = ['"안내1"', '"안내2"', '"안내3"', '"안내4"', TRADE_HEADER, TRADE_ROWS[0]!]
      .join('\n');
    expect(parseTradeCsv(withLongPreamble).items).toHaveLength(1);
  });

  it('한 줄을 제대로 읽는다', () => {
    const [trade] = parseTradeCsv(tradeCsv(TRADE_ROWS[0]!)).items;

    expect(trade).toMatchObject({
      sigunguName: '서울특별시 강남구',
      legalDongName: '수서동',
      apartmentName: '삼익',
      exclusiveSqm: 49.2,
      priceManwon: 212000, // "212,000" 의 쉼표를 지운다
      floor: 8,
      builtYear: 1992,
      isCanceled: false,
      jibun: '708',
    });
    expect(trade!.contractedAt.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('중개사소재지의 쉼표 때문에 칸이 밀리지 않는다', () => {
    const [, second] = parseTradeCsv(tradeCsv(...TRADE_ROWS)).items;
    expect(second).toMatchObject({
      apartmentName: '(토지임대부아파트)강남브리즈힐',
      priceManwon: 130000,
      builtYear: 2014,
      floor: 6,
    });
  });

  it('해제사유발생일이 찍혀 있으면 해제된 거래다', () => {
    const canceled = TRADE_ROWS[0]!.replace('"-","중개거래"', '"26.08.20","중개거래"');
    expect(parseTradeCsv(tradeCsv(canceled)).items[0]!.isCanceled).toBe(true);
  });

  it('지하층 "-1" 을 빈 값으로 오해하지 않는다', () => {
    const basement = TRADE_ROWS[0]!.replace('"401","8"', '"401","-1"');
    expect(parseTradeCsv(tradeCsv(basement)).items[0]!.floor).toBe(-1);
  });

  it('건축년도가 비어 있으면 null', () => {
    const noYear = TRADE_ROWS[0]!.replace('"1992"', '"-"');
    expect(parseTradeCsv(tradeCsv(noYear)).items[0]!.builtYear).toBeNull();
  });

  it('날짜나 단지명이 없는 줄은 건너뛰고 몇 줄인지 알려 준다', () => {
    const noName = TRADE_ROWS[0]!.replace('"삼익"', '""');
    const badDate = TRADE_ROWS[0]!.replace('"202608","07"', '"","07"');
    const result = parseTradeCsv(tradeCsv(TRADE_ROWS[0]!, noName, badDate));

    expect(result.items).toHaveLength(1);
    expect(result.skippedRows).toBe(2);
  });

  it('빈 줄은 세지 않는다', () => {
    const result = parseTradeCsv(tradeCsv(TRADE_ROWS[0]!) + '\n\n\n');
    expect(result.skippedRows).toBe(0);
  });

  it('BOM 이 붙어 있어도 읽는다', () => {
    expect(parseTradeCsv('\uFEFF' + tradeCsv(TRADE_ROWS[0]!)).items).toHaveLength(1);
  });
});

describe('parseRentCsv — 아파트 전월세', () => {
  it('전세는 월세 0 으로 읽는다', () => {
    const [rent] = parseRentCsv(rentCsv(RENT_ROWS[0]!)).items;
    expect(rent).toMatchObject({
      apartmentName: '강남데시앙포레',
      depositManwon: 90000,
      monthlyManwon: 0,
      exclusiveSqm: 84.86,
      floor: 8,
    });
  });

  it('월세는 보증금과 월세를 따로 읽는다', () => {
    const [, monthly] = parseRentCsv(rentCsv(...RENT_ROWS)).items;
    expect(monthly).toMatchObject({ depositManwon: 33431, monthlyManwon: 65 });
  });

  it('"종전계약 보증금" 을 "보증금" 으로 착각하지 않는다', () => {
    // 종전계약 보증금(90,000)과 보증금(90,000)이 같은 줄이라, 잘못 읽으면 티가 안 난다.
    // 값을 다르게 바꿔 실제로 어느 칸을 읽는지 확인한다.
    const distinct = RENT_ROWS[0]!.replace('"사용","90,000","0"', '"사용","11,111","22"');
    const [rent] = parseRentCsv(rentCsv(distinct)).items;
    expect(rent!.depositManwon).toBe(90000);
    expect(rent!.monthlyManwon).toBe(0);
  });
});

describe('형식이 어긋났을 때', () => {
  it('헤더 줄이 없으면 무엇을 확인해야 하는지 알려 준다', () => {
    expect(() => parseTradeCsv('"안내문만 있는 파일"')).toThrow(MolitCsvError);
    expect(() => parseTradeCsv('"안내문만 있는 파일"')).toThrow(/rt\.molit\.go\.kr/);
  });

  it('필요한 칸이 없으면 실제로 있던 칸 이름을 알려 준다', () => {
    const wrong = '"NO","시군구","단지명"\n"1","서울특별시 강남구 수서동","삼익"';
    expect(() => parseTradeCsv(wrong)).toThrow(/전용면적.*칸이 없습니다/s);
    expect(() => parseTradeCsv(wrong)).toThrow(/NO, 시군구, 단지명/);
  });
});

describe('detectCsvKind — 파일 이름이 아니라 내용으로 판별', () => {
  it('거래금액이 있으면 매매', () => {
    expect(detectCsvKind(tradeCsv(TRADE_ROWS[0]!))).toBe('trade');
  });

  it('보증금이 있으면 전월세', () => {
    expect(detectCsvKind(rentCsv(RENT_ROWS[0]!))).toBe('rent');
  });

  it('둘 다 아니면 멈춘다', () => {
    expect(() => detectCsvKind('"NO","시군구","단지명"\n"1","서울 강남구 수서동","삼익"')).toThrow(
      MolitCsvError,
    );
  });
});
