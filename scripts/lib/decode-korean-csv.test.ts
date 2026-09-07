import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import { decodeKoreanCsv } from './decode-korean-csv';

const SAMPLE = '"NO","시군구","단지명"\n"1","서울특별시 강남구 수서동","삼익"';

describe('decodeKoreanCsv — 국토부 CSV 인코딩 자동 판별', () => {
  it('국토부가 주는 원본(CP949)을 읽는다', () => {
    const result = decodeKoreanCsv(iconv.encode(SAMPLE, 'cp949'));
    expect(result.encoding).toBe('cp949');
    expect(result.text).toBe(SAMPLE);
  });

  it('엑셀에서 다시 저장한 UTF-8 도 읽는다', () => {
    const result = decodeKoreanCsv(Buffer.from(SAMPLE, 'utf8'));
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(SAMPLE);
  });

  it('UTF-8 BOM 을 본문에 남기지 않는다', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SAMPLE, 'utf8')]);
    const result = decodeKoreanCsv(withBom);
    expect(result.encoding).toBe('utf-8');
    expect(result.text.startsWith('"NO"')).toBe(true);
  });

  it('한글이 깨지지 않는다 — 깨져도 오류가 안 나므로 값으로 확인한다', () => {
    for (const buffer of [iconv.encode(SAMPLE, 'cp949'), Buffer.from(SAMPLE, 'utf8')]) {
      expect(decodeKoreanCsv(buffer).text).toContain('서울특별시 강남구 수서동');
      expect(decodeKoreanCsv(buffer).text).not.toContain('�');
    }
  });

  it('아스키뿐인 파일은 어느 쪽으로 읽어도 같다', () => {
    expect(decodeKoreanCsv(Buffer.from('"NO","A"', 'utf8')).text).toBe('"NO","A"');
  });

  it('빈 파일도 터지지 않는다', () => {
    expect(decodeKoreanCsv(Buffer.alloc(0)).text).toBe('');
  });
});
