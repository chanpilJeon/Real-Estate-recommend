import { decodeKoreanCsv } from './decode-korean-csv';

/**
 * 국토부 실거래가 **공개시스템(웹)** 에서 CSV 를 내려받는다.
 *
 * 왜 웹인가: 우리 데이터는 공공데이터포털 **API** 로 받았다. 같은 원천이지만 전달 경로가
 * 달라서, 두 쪽을 맞대 보면 우리 파서·단위 변환·날짜 처리에 생긴 오류를 잡을 수 있다.
 * 같은 API 로 두 번 받아 비교하면 우리 실수는 절대 드러나지 않는다.
 *
 * ⚠ 브라우저 User-Agent 가 없으면 400 을 돌려준다. 세션 쿠키도 먼저 받아야 한다.
 */
const BASE = 'https://rt.molit.go.kr';
const FORM_URL = `${BASE}/pt/xls/xls.do?mobileAt=`;
const DOWNLOAD_URL = `${BASE}/pt/xls/ptXlsCSVDown.do`;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface MolitCsvQuery {
  /** 시도 코드 (예: 경기도 41000) */
  sidoCode: string;
  /** 시군구 코드 5자리 (예: 수원 영통구 41117) */
  sigunguCode: string;
  /** 'YYYY-MM-DD' */
  from: string;
  to: string;
}

/** Set-Cookie 여러 줄에서 name=value 만 모은다 */
function collectCookies(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((line) => line.split(';')[0]).join('; ');
}

export async function downloadTradeCsv(query: MolitCsvQuery): Promise<string> {
  const session = await fetch(FORM_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!session.ok) throw new Error(`국토부 공개시스템에 접속하지 못했습니다 (${session.status})`);
  const cookie = collectCookies(session);

  const body = new URLSearchParams({
    srhThingNo: 'A', // 아파트
    srhDelngSecd: '1', // 매매
    srhAddrGbn: '1', // 지번주소
    srhLfstsSecd: '1',
    sidoNm: '',
    sggNm: '',
    emdNm: '전체',
    loadNm: '전체',
    areaNm: '전체',
    hsmpNm: '전체',
    mobileAt: '',
    srhFromDt: query.from,
    srhToDt: query.to,
    srhNewRonSecd: '',
    srhSidoCd: query.sidoCode,
    srhSggCd: query.sigunguCode,
    srhEmdCd: '',
    srhRoadNm: '',
    srhLoadCd: '',
    srhHsmpCd: '',
    srhArea: '',
    srhFromAmount: '',
    srhToAmount: '',
    srhLrArea: '',
  });

  const response = await fetch(DOWNLOAD_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT, // 없으면 400
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: FORM_URL,
      Origin: BASE,
      Cookie: cookie,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `CSV 를 받지 못했습니다 (${response.status}). 사이트 점검 중이거나 조회 조건이 너무 넓을 수 있습니다.`,
    );
  }

  return decodeKoreanCsv(Buffer.from(await response.arrayBuffer())).text;
}
