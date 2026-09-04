/**
 * 법정동코드 전체자료(code.go.kr) 파서 — 순수 함수라 DB 없이 테스트한다.
 *
 * 파일 형식: 탭 구분, 첫 줄은 헤더
 *   법정동코드	법정동명	폐지여부
 *   1111010100	서울특별시 종로구 청운동	존재
 *
 * 법정동코드 10자리 구조:
 *   [0:2] 시도  [2:5] 시군구  [5:8] 읍면동  [8:10] 리
 */

export interface ParsedRegion {
  code: string;
  sigunguCode: string;
  sido: string;
  sigungu: string;
  dong: string | null;
  isActive: boolean;
}

export type RegionLevel = 'sido' | 'sigungu' | 'dong' | 'ri';

export function levelOf(code: string): RegionLevel {
  if (code.slice(8, 10) !== '00') return 'ri';
  if (code.slice(2, 5) === '000') return 'sido';
  if (code.slice(5, 8) === '000') return 'sigungu';
  return 'dong';
}

/**
 * 법정동명을 시도/시군구/읍면동으로 쪼갠다.
 *
 * 까다로운 경우를 코드 구조로 판별해 처리한다:
 *  · "경기도 수원시 영통구 영통동" → 시군구가 두 단어 (수원시 영통구)
 *  · "세종특별자치시 반곡동"       → 시군구 단계가 없음 → 시도명으로 채운다
 */
export function splitName(fullName: string, level: RegionLevel): Omit<ParsedRegion, 'code' | 'sigunguCode' | 'isActive'> {
  const tokens = fullName.trim().split(/\s+/);
  const sido = tokens[0] ?? '';

  if (level === 'sido') {
    return { sido, sigungu: '', dong: null };
  }

  if (level === 'sigungu') {
    return { sido, sigungu: tokens.slice(1).join(' '), dong: null };
  }

  // 읍면동 단위: 마지막 토큰이 동, 그 사이가 시군구
  const dong = tokens[tokens.length - 1] ?? '';
  const middle = tokens.slice(1, -1).join(' ');
  return { sido, sigungu: middle === '' ? sido : middle, dong };
}

/**
 * 파일 전체 텍스트를 파싱한다.
 * 리(里) 단위는 제외한다 — 아파트 단지 검색에 필요 없고, 데이터만 5배로 불어난다.
 */
export function parseLegalDongFile(text: string): ParsedRegion[] {
  const results: ParsedRegion[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const [code, fullName, status] = line.split('\t');
    if (code === undefined || fullName === undefined) continue;
    if (!/^\d{10}$/.test(code)) continue; // 헤더 줄과 깨진 줄을 걸러낸다

    const level = levelOf(code);
    if (level === 'ri') continue;

    results.push({
      code,
      sigunguCode: code.slice(0, 5),
      ...splitName(fullName, level),
      isActive: (status ?? '존재').trim() === '존재',
    });
  }

  return results;
}
