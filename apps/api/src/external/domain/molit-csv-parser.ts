import type { RawRent, RawTrade } from './raw-types';

/**
 * 국토부 실거래가 공개시스템 "조건별 자료제공" CSV 파서 (순수 함수 — 파일·인코딩을 모른다).
 *
 * 왜 CSV 인가: 공공데이터포털 API 키 없이도 https://rt.molit.go.kr 에서
 * 사람이 직접 내려받을 수 있는 유일한 경로다. 키가 나오면 XML 파서로 갈아타면 되고,
 * `sourceHash` 가 같은 항목으로 계산되므로 **두 경로를 섞어도 중복 적재되지 않는다**.
 *
 * 파일 생김새 (실제 내려받아 확인, 2026-09):
 *   "□ 본 서비스에서 제공하는 정보는 ..."   ← 안내문 여러 줄 (검색조건에 따라 줄 수가 변한다)
 *   "□ 검색조건"
 *   "계약일자 : 2026-08-01 ~ 2026-08-07"
 *   "NO","시군구","번지",...                ← 이 줄부터가 진짜 표
 *   "1","서울특별시 강남구 수서동","708",...
 *
 * 그래서 안내문 줄 수를 세지 않고 **첫 칸이 NO 인 줄**을 찾아 헤더로 삼는다.
 */

export class MolitCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MolitCsvError';
  }
}

/** 값이 비었음을 뜻하는 표기. 지하 1층("-1")과 헷갈리면 안 되니 정확히 이 글자일 때만 */
const EMPTY = '-';

/**
 * CSV 한 줄 → 칸 배열.
 * 따옴표 안의 쉼표를 지켜야 한다 — 거래금액이 "212,000" 이고
 * 중개사소재지가 "경기 화성시 동탄구, 서울 강남구" 처럼 온다.
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch !== '"') {
        cur += ch;
      } else if (line[i + 1] === '"') {
        cur += '"'; // "" 는 따옴표 한 글자
        i += 1;
      } else {
        inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);

  return cells.map((cell) => cell.trim());
}

/** "전용면적(㎡)" → "전용면적", "갱신요구권 사용" → "갱신요구권사용" */
function normalizeHeader(name: string): string {
  return name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
}

interface Table {
  columns: Map<string, number>;
  rows: string[][];
}

/** 안내문을 건너뛰고 헤더 + 데이터 줄을 찾아낸다 */
function readTable(csv: string): Table {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => parseCsvLine(line)[0] === 'NO');

  if (headerIndex === -1) {
    throw new MolitCsvError(
      '표의 머리글을 찾지 못했습니다. 첫 칸이 "NO" 인 줄이 있어야 합니다.\n' +
        'rt.molit.go.kr 의 [조건별 자료제공]에서 받은 CSV 가 맞는지 확인하세요. ' +
        '(엑셀에서 열어 다시 저장하면 형식이 바뀔 수 있으니 받은 파일 그대로 쓰세요.)',
    );
  }

  const columns = new Map<string, number>();
  parseCsvLine(lines[headerIndex]!).forEach((name, index) => {
    const key = normalizeHeader(name);
    // 같은 이름이 또 나오면 처음 것을 쓴다
    if (key !== '' && !columns.has(key)) columns.set(key, index);
  });

  const rows = lines
    .slice(headerIndex + 1)
    .filter((line) => line.trim() !== '')
    .map(parseCsvLine);

  return { columns, rows };
}

/** 없으면 무엇이 있었는지 알려 주고 멈춘다 — 형식이 바뀌었을 때 원인을 바로 알 수 있게 */
function required(table: Table, name: string): number {
  const index = table.columns.get(name);
  if (index === undefined) {
    throw new MolitCsvError(
      `CSV 에 "${name}" 칸이 없습니다. 파일에 있는 칸: ${[...table.columns.keys()].join(', ')}`,
    );
  }
  return index;
}

function text(cells: string[], index: number | undefined): string {
  if (index === undefined) return '';
  const value = (cells[index] ?? '').trim();
  return value === EMPTY ? '' : value;
}

/** "212,000" → 212000. 비어 있으면 0 (지하층 "-1" 은 그대로 -1) */
function num(cells: string[], index: number | undefined): number {
  const value = text(cells, index).replace(/,/g, '');
  if (value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 계약년월 "202608" + 계약일 "07" → 2026-08-07 (UTC — XML 파서와 같은 규칙) */
function toDate(yearMonth: string, day: string): Date | null {
  if (!/^\d{6}$/.test(yearMonth)) return null;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4, 6));
  const dayNo = Number(day);
  if (month < 1 || month > 12) return null;
  if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > 31) return null;
  return new Date(Date.UTC(year, month - 1, dayNo));
}

/**
 * "서울특별시 강남구 수서동" → 시군구 이름과 법정동으로 가른다.
 * 마지막 토큰이 법정동(읍·면 포함), 나머지가 시군구다.
 * 세종시("세종특별자치시 도담동")처럼 시군구가 없는 곳도 이 규칙으로 맞는다.
 */
export function splitSigunguAndDong(full: string): {
  sigunguName: string;
  legalDongName: string;
} {
  const tokens = full.trim().split(/\s+/).filter((token) => token !== '');
  if (tokens.length <= 1) return { sigunguName: tokens.join(' '), legalDongName: '' };
  return {
    sigunguName: tokens.slice(0, -1).join(' '),
    legalDongName: tokens[tokens.length - 1]!,
  };
}

/**
 * CSV 는 시군구를 **이름**으로만 준다 ("서울특별시 강남구").
 * 코드로 바꾸려면 regions 테이블이 필요한데 그건 DB 일이라 여기서 하지 않는다.
 * 그래서 `RawTrade` 대신 이름을 든 채로 내보내고, 코드 변환은 부르는 쪽이 한다.
 */
export type CsvTrade = Omit<RawTrade, 'sigunguCode'> & { sigunguName: string };
export type CsvRent = Omit<RawRent, 'sigunguCode'> & { sigunguName: string };

export interface CsvParseResult<T> {
  items: T[];
  /** 날짜나 단지명이 없어 쓸 수 없던 줄 수 */
  skippedRows: number;
}

/** 아파트(매매) CSV → 실거래 목록 */
export function parseTradeCsv(csv: string): CsvParseResult<CsvTrade> {
  const table = readTable(csv);

  const iSigungu = required(table, '시군구');
  const iName = required(table, '단지명');
  const iSqm = required(table, '전용면적');
  const iYearMonth = required(table, '계약년월');
  const iDay = required(table, '계약일');
  const iPrice = required(table, '거래금액');
  const iFloor = table.columns.get('층');
  const iBuiltYear = table.columns.get('건축년도');
  const iJibun = table.columns.get('번지');
  const iCanceled = table.columns.get('해제사유발생일');

  const items: CsvTrade[] = [];
  let skippedRows = 0;

  for (const cells of table.rows) {
    const contractedAt = toDate(text(cells, iYearMonth), text(cells, iDay));
    const apartmentName = text(cells, iName);
    if (contractedAt === null || apartmentName === '') {
      skippedRows += 1;
      continue;
    }

    const { sigunguName, legalDongName } = splitSigunguAndDong(text(cells, iSigungu));

    items.push({
      sigunguName,
      legalDongName,
      apartmentName,
      exclusiveSqm: num(cells, iSqm),
      priceManwon: num(cells, iPrice),
      contractedAt,
      floor: num(cells, iFloor),
      builtYear: num(cells, iBuiltYear) || null,
      // 해제사유발생일이 찍혀 있으면 취소된 거래다 (XML 의 "해제여부 = O" 와 같은 뜻)
      isCanceled: text(cells, iCanceled) !== '',
      jibun: text(cells, iJibun),
    });
  }

  return { items, skippedRows };
}

/** 아파트(전월세) CSV → 전월세 목록 */
export function parseRentCsv(csv: string): CsvParseResult<CsvRent> {
  const table = readTable(csv);

  const iSigungu = required(table, '시군구');
  const iName = required(table, '단지명');
  const iSqm = required(table, '전용면적');
  const iYearMonth = required(table, '계약년월');
  const iDay = required(table, '계약일');
  const iDeposit = required(table, '보증금');
  const iMonthly = table.columns.get('월세금');
  const iFloor = table.columns.get('층');
  const iBuiltYear = table.columns.get('건축년도');
  const iJibun = table.columns.get('번지');

  const items: CsvRent[] = [];
  let skippedRows = 0;

  for (const cells of table.rows) {
    const contractedAt = toDate(text(cells, iYearMonth), text(cells, iDay));
    const apartmentName = text(cells, iName);
    if (contractedAt === null || apartmentName === '') {
      skippedRows += 1;
      continue;
    }

    const { sigunguName, legalDongName } = splitSigunguAndDong(text(cells, iSigungu));

    items.push({
      sigunguName,
      legalDongName,
      apartmentName,
      exclusiveSqm: num(cells, iSqm),
      depositManwon: num(cells, iDeposit),
      monthlyManwon: num(cells, iMonthly),
      contractedAt,
      floor: num(cells, iFloor),
      builtYear: num(cells, iBuiltYear) || null,
      jibun: text(cells, iJibun),
    });
  }

  return { items, skippedRows };
}

/** 이 CSV 가 매매인지 전월세인지 — 파일 이름에 기대지 않고 내용으로 판별한다 */
export function detectCsvKind(csv: string): 'trade' | 'rent' {
  const table = readTable(csv);
  if (table.columns.has('보증금')) return 'rent';
  if (table.columns.has('거래금액')) return 'trade';
  throw new MolitCsvError(
    '매매("거래금액")도 전월세("보증금")도 아닌 CSV 입니다. ' +
      `파일에 있는 칸: ${[...table.columns.keys()].join(', ')}`,
  );
}
