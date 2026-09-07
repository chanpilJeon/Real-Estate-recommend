import iconv from 'iconv-lite';

/**
 * 국토부 CSV 는 EUC-KR(CP949)로 내려온다. 그런데 사용자가 엑셀에서 열어 다시 저장하면
 * UTF-8 이 되기도 한다. 어느 쪽이든 읽히게 한다 — 인코딩을 잘못 고르면
 * 단지명이 "�Ｚ" 처럼 깨져 매칭이 통째로 실패하는데, 오류는 안 나서 알아채기 어렵다.
 */
export type KoreanEncoding = 'utf-8' | 'cp949';

export interface DecodedCsv {
  text: string;
  encoding: KoreanEncoding;
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export function decodeKoreanCsv(buffer: Buffer): DecodedCsv {
  // BOM 이 있으면 UTF-8 이라고 명시한 것이다
  if (buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf-8' };
  }

  // 올바른 UTF-8 인지 엄격하게 따져 본다. 아니면 CP949 다.
  // (아스키뿐인 파일은 두 인코딩의 결과가 같으므로 어느 쪽으로 판정해도 안전하다)
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' };
  } catch {
    return { text: iconv.decode(buffer, 'cp949'), encoding: 'cp949' };
  }
}
