import { XMLParser } from 'fast-xml-parser';

import type { RawRent, RawTrade } from './raw-types';

/**
 * 국토부 실거래가 XML 파서 (순수 함수 — 네트워크를 모른다).
 *
 * ⚠ 국토부는 필드명을 한글("거래금액")에서 영문("dealAmount")으로 바꾼 이력이 있다.
 *   어느 쪽이 오든 읽히도록 **두 이름을 모두 시도**한다. 스펙이 또 바뀌어도
 *   여기 별칭만 추가하면 상위 모듈은 손대지 않는다.
 */

export class MolitApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MolitApiError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false, // 숫자 변환은 직접 한다 ("00123" 같은 값이 깨지지 않게)
});

type XmlNode = Record<string, unknown>;

/** 항목이 1건이면 배열이 아니라 객체로 온다 */
function toArray(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as XmlNode[];
}

/** 여러 후보 이름 중 먼저 값이 있는 것을 쓴다 */
function pick(node: XmlNode, ...names: string[]): string {
  for (const name of names) {
    const value = node[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** "  82,500" → 82500 */
function toNumber(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toDate(year: string, month: string, day: string): Date | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export interface MolitPage<T> {
  items: T[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

/**
 * 공통 봉투를 열고 item 목록을 꺼낸다.
 * 서비스 키 오류 같은 게이트웨이 응답도 여기서 판별해 사람이 읽는 오류로 바꾼다.
 */
function openEnvelope(xml: string): { items: XmlNode[]; body: XmlNode } {
  const root = parser.parse(xml) as XmlNode;

  // data.go.kr 게이트웨이 오류 (키 미등록·트래픽 초과 등)
  const gateway = root['OpenAPI_ServiceResponse'] as XmlNode | undefined;
  if (gateway !== undefined) {
    const header = (gateway['cmmMsgHeader'] ?? {}) as XmlNode;
    const code = pick(header, 'returnReasonCode');
    const reason = pick(header, 'returnAuthMsg', 'errMsg');
    throw new MolitApiError(code, translateGatewayError(code, reason));
  }

  const response = (root['response'] ?? {}) as XmlNode;
  const header = (response['header'] ?? {}) as XmlNode;
  const resultCode = pick(header, 'resultCode');

  // 정상은 "000" 또는 "00"
  if (resultCode !== '' && resultCode !== '000' && resultCode !== '00') {
    throw new MolitApiError(resultCode, `국토부 API 오류: ${pick(header, 'resultMsg')} (${resultCode})`);
  }

  const body = (response['body'] ?? {}) as XmlNode;
  const items = (body['items'] ?? {}) as XmlNode;
  return { items: toArray(items['item']), body };
}

function pageInfo(body: XmlNode): Omit<MolitPage<never>, 'items'> {
  return {
    totalCount: toNumber(pick(body, 'totalCount')),
    pageNo: toNumber(pick(body, 'pageNo')) || 1,
    numOfRows: toNumber(pick(body, 'numOfRows')),
  };
}

/** 매매 실거래 XML → RawTrade[] */
export function parseTradeXml(xml: string, sigunguCode: string): MolitPage<RawTrade> {
  const { items, body } = openEnvelope(xml);

  const trades: RawTrade[] = [];
  for (const node of items) {
    const contractedAt = toDate(
      pick(node, 'dealYear', '년'),
      pick(node, 'dealMonth', '월'),
      pick(node, 'dealDay', '일'),
    );
    const name = pick(node, 'aptNm', '아파트');
    // 날짜나 단지명이 없는 행은 쓸 수 없다 — 조용히 버리지 말고 건너뛴다
    if (contractedAt === null || name === '') continue;

    trades.push({
      sigunguCode: pick(node, 'sggCd', '지역코드') || sigunguCode,
      legalDongName: pick(node, 'umdNm', '법정동'),
      apartmentName: name,
      exclusiveSqm: toNumber(pick(node, 'excluUseAr', '전용면적')),
      priceManwon: toNumber(pick(node, 'dealAmount', '거래금액')),
      contractedAt,
      floor: toNumber(pick(node, 'floor', '층')),
      builtYear: toNumber(pick(node, 'buildYear', '건축년도')) || null,
      // 해제된 거래는 표기가 "O" 다 (신·구 필드 모두 확인)
      isCanceled: pick(node, 'cdealType', '해제여부').toUpperCase() === 'O',
      jibun: pick(node, 'jibun', '지번'),
    });
  }

  return { items: trades, ...pageInfo(body) };
}

/** 전월세 실거래 XML → RawRent[] */
export function parseRentXml(xml: string, sigunguCode: string): MolitPage<RawRent> {
  const { items, body } = openEnvelope(xml);

  const rents: RawRent[] = [];
  for (const node of items) {
    const contractedAt = toDate(
      pick(node, 'dealYear', '년'),
      pick(node, 'dealMonth', '월'),
      pick(node, 'dealDay', '일'),
    );
    const name = pick(node, 'aptNm', '아파트');
    if (contractedAt === null || name === '') continue;

    rents.push({
      sigunguCode: pick(node, 'sggCd', '지역코드') || sigunguCode,
      legalDongName: pick(node, 'umdNm', '법정동'),
      apartmentName: name,
      exclusiveSqm: toNumber(pick(node, 'excluUseAr', '전용면적')),
      depositManwon: toNumber(pick(node, 'deposit', '보증금액', '보증금')),
      monthlyManwon: toNumber(pick(node, 'monthlyRent', '월세금액', '월세')),
      contractedAt,
      floor: toNumber(pick(node, 'floor', '층')),
      builtYear: toNumber(pick(node, 'buildYear', '건축년도')) || null,
      jibun: pick(node, 'jibun', '지번'),
    });
  }

  return { items: rents, ...pageInfo(body) };
}

/** 게이트웨이 오류코드를 사람이 읽는 문장으로 (운영자가 바로 조치할 수 있게) */
function translateGatewayError(code: string, reason: string): string {
  const known: Record<string, string> = {
    '30': '등록되지 않은 서비스 키입니다. 공공데이터포털에서 발급받은 키를 .env 의 MOLIT_API_KEY 에 넣으세요.',
    '31': '서비스 키 사용 기간이 만료되었습니다. 공공데이터포털에서 연장하세요.',
    '22': '일일 호출 한도를 초과했습니다. 내일 다시 시도하거나 운영계정으로 전환하세요.',
    '32': '등록되지 않은 도메인/IP 에서 호출했습니다.',
    '10': '필수 요청 값이 빠졌습니다.',
  };
  return known[code] ?? `국토부 API 게이트웨이 오류 (${code}): ${reason}`;
}
