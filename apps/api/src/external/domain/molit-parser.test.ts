import { describe, expect, it } from 'vitest';

import { MolitApiError, parseRentXml, parseTradeXml } from './molit-parser';

/** 신 스펙(영문 필드) 응답 */
const newFormat = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>래미안역삼</aptNm>
        <buildYear>2005</buildYear>
        <dealAmount>   182,500</dealAmount>
        <dealDay>15</dealDay>
        <dealMonth>8</dealMonth>
        <dealYear>2026</dealYear>
        <excluUseAr>84.97</excluUseAr>
        <floor>12</floor>
        <jibun>736-1</jibun>
        <sggCd>11680</sggCd>
        <umdNm>역삼동</umdNm>
      </item>
    </items>
    <numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount>
  </body>
</response>`;

/** 구 스펙(한글 필드) 응답 — 국토부가 과거에 쓰던 형식 */
const legacyFormat = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <아파트>래미안역삼</아파트>
        <건축년도>2005</건축년도>
        <거래금액>   182,500</거래금액>
        <일>15</일><월>8</월><년>2026</년>
        <전용면적>84.97</전용면적>
        <층>12</층>
        <지번>736-1</지번>
        <지역코드>11680</지역코드>
        <법정동> 역삼동</법정동>
      </item>
    </items>
    <numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount>
  </body>
</response>`;

describe('국토부 실거래 XML 파서', () => {
  describe('필드명이 바뀌어도 읽는다 (국토부가 한글→영문으로 바꾼 이력이 있다)', () => {
    it.each([
      ['신 스펙(영문)', newFormat],
      ['구 스펙(한글)', legacyFormat],
    ])('%s 를 같은 결과로 읽는다', (_label, xml) => {
      const [trade] = parseTradeXml(xml, '11680').items;

      expect(trade).toEqual({
        sigunguCode: '11680',
        legalDongName: '역삼동',
        apartmentName: '래미안역삼',
        exclusiveSqm: 84.97,
        priceManwon: 182_500,
        contractedAt: new Date(Date.UTC(2026, 7, 15)),
        floor: 12,
        builtYear: 2005,
        isCanceled: false,
        jibun: '736-1',
      });
    });
  });

  describe('값 정제', () => {
    it('거래금액의 콤마와 공백을 없앤다', () => {
      expect(parseTradeXml(newFormat, '11680').items[0]?.priceManwon).toBe(182_500);
    });

    it('법정동명 앞뒤 공백을 다듬는다', () => {
      expect(parseTradeXml(legacyFormat, '11680').items[0]?.legalDongName).toBe('역삼동');
    });

    it('페이지 정보를 함께 돌려준다 (여러 장 수집에 필요)', () => {
      const page = parseTradeXml(newFormat, '11680');
      expect(page).toMatchObject({ totalCount: 1, pageNo: 1, numOfRows: 10 });
    });
  });

  describe('해제(취소)된 거래', () => {
    it('cdealType 이 O 면 해제로 표시한다', () => {
      const xml = newFormat.replace('<floor>12</floor>', '<floor>12</floor><cdealType>O</cdealType>');
      expect(parseTradeXml(xml, '11680').items[0]?.isCanceled).toBe(true);
    });

    it('구 스펙의 해제여부도 읽는다', () => {
      const xml = legacyFormat.replace('<층>12</층>', '<층>12</층><해제여부>O</해제여부>');
      expect(parseTradeXml(xml, '11680').items[0]?.isCanceled).toBe(true);
    });

    it('빈 값이면 해제가 아니다', () => {
      expect(parseTradeXml(newFormat, '11680').items[0]?.isCanceled).toBe(false);
    });
  });

  describe('항목 수에 따른 형태 변화', () => {
    it('1건이면 배열이 아니라 객체로 오는데도 읽는다', () => {
      expect(parseTradeXml(newFormat, '11680').items).toHaveLength(1);
    });

    it('여러 건이면 모두 읽는다', () => {
      const two = newFormat.replace(
        '</items>',
        `<item><aptNm>두번째</aptNm><dealAmount>90,000</dealAmount>
         <dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay>
         <excluUseAr>59.94</excluUseAr><floor>5</floor><umdNm>역삼동</umdNm></item></items>`,
      );
      expect(parseTradeXml(two, '11680').items).toHaveLength(2);
    });

    it('거래가 없는 달은 빈 배열 (오류가 아니다)', () => {
      const empty = `<response><header><resultCode>000</resultCode></header>
        <body><items></items><totalCount>0</totalCount></body></response>`;
      expect(parseTradeXml(empty, '11680').items).toEqual([]);
    });
  });

  describe('망가진 행은 건너뛴다', () => {
    it('날짜가 없으면 그 행만 버린다', () => {
      const broken = newFormat.replace('<dealDay>15</dealDay>', '<dealDay></dealDay>');
      expect(parseTradeXml(broken, '11680').items).toHaveLength(0);
    });

    it('단지명이 없으면 그 행만 버린다', () => {
      const broken = newFormat.replace('<aptNm>래미안역삼</aptNm>', '<aptNm></aptNm>');
      expect(parseTradeXml(broken, '11680').items).toHaveLength(0);
    });

    it('말이 안 되는 날짜(13월)는 버린다', () => {
      const broken = newFormat.replace('<dealMonth>8</dealMonth>', '<dealMonth>13</dealMonth>');
      expect(parseTradeXml(broken, '11680').items).toHaveLength(0);
    });
  });

  describe('오류 응답을 사람이 읽는 문장으로 바꾼다', () => {
    const gateway = (code: string, msg: string): string =>
      `<OpenAPI_ServiceResponse><cmmMsgHeader>
        <returnAuthMsg>${msg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode>
      </cmmMsgHeader></OpenAPI_ServiceResponse>`;

    it('키가 등록되지 않았으면 무엇을 해야 하는지 알려준다', () => {
      expect(() => parseTradeXml(gateway('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'), '11680')).toThrow(
        /MOLIT_API_KEY/,
      );
    });

    it('호출 한도 초과를 구분해 알려준다', () => {
      expect(() => parseTradeXml(gateway('22', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS'), '11680')).toThrow(
        /한도를 초과/,
      );
    });

    it('모르는 오류코드도 코드와 원문을 남긴다', () => {
      expect(() => parseTradeXml(gateway('99', 'UNKNOWN'), '11680')).toThrow(/99/);
    });

    it('MolitApiError 로 던져 상위에서 구분할 수 있게 한다', () => {
      try {
        parseTradeXml(gateway('30', 'X'), '11680');
        expect.unreachable('예외가 발생해야 한다');
      } catch (err) {
        expect(err).toBeInstanceOf(MolitApiError);
        expect((err as MolitApiError).code).toBe('30');
      }
    });

    it('본문 헤더의 오류코드도 잡는다', () => {
      const bad = `<response><header><resultCode>99</resultCode><resultMsg>서버 오류</resultMsg></header>
        <body><items></items></body></response>`;
      expect(() => parseTradeXml(bad, '11680')).toThrow(/서버 오류/);
    });
  });

  describe('전월세 파서', () => {
    const rentXml = `<response><header><resultCode>000</resultCode></header><body><items>
      <item>
        <aptNm>래미안역삼</aptNm><deposit>   70,000</deposit><monthlyRent>0</monthlyRent>
        <dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>10</dealDay>
        <excluUseAr>84.97</excluUseAr><floor>7</floor><umdNm>역삼동</umdNm><buildYear>2005</buildYear>
      </item></items><totalCount>1</totalCount></body></response>`;

    it('보증금과 월세를 읽는다', () => {
      const [rent] = parseRentXml(rentXml, '11680').items;
      expect(rent?.depositManwon).toBe(70_000);
      expect(rent?.monthlyManwon).toBe(0); // 0이면 전세
    });

    it('구 스펙의 보증금액/월세금액도 읽는다', () => {
      const legacy = rentXml
        .replace('<deposit>   70,000</deposit>', '<보증금액>   70,000</보증금액>')
        .replace('<monthlyRent>0</monthlyRent>', '<월세금액>50</월세금액>');
      const [rent] = parseRentXml(legacy, '11680').items;
      expect(rent?.depositManwon).toBe(70_000);
      expect(rent?.monthlyManwon).toBe(50);
    });
  });
});
