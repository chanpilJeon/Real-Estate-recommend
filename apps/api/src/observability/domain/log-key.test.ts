import { describe, expect, it } from 'vitest';

import { buildMessageKey, normalizeMessage, truncateMessage } from './log-key';

describe('로그 그룹핑 키', () => {
  describe('normalizeMessage — 변하는 부분을 지운다', () => {
    it('숫자를 # 로 바꾼다', () => {
      expect(normalizeMessage('타임아웃 (3회 재시도)')).toBe('타임아웃 (#회 재시도)');
    });

    it('공백을 하나로 줄인다', () => {
      expect(normalizeMessage('  단지명   매칭   실패  ')).toBe('단지명 매칭 실패');
    });
  });

  describe('buildMessageKey', () => {
    it('숫자만 다른 메시지는 같은 그룹으로 묶는다', () => {
      const a = buildMessageKey('collector', '국토부 API 타임아웃 (3회 재시도)');
      const b = buildMessageKey('collector', '국토부 API 타임아웃 (5회 재시도)');
      expect(a).toBe(b);
    });

    it('지역명 같은 단어가 다르면 다른 그룹이다', () => {
      // 강남구만 계속 실패하는 상황은 따로 보여야 한다
      const a = buildMessageKey('collector', '수집 실패 (강남구)');
      const b = buildMessageKey('collector', '수집 실패 (서초구)');
      expect(a).not.toBe(b);
    });

    it('메시지가 같아도 발생 모듈이 다르면 다른 그룹이다', () => {
      const a = buildMessageKey('collector', '실패');
      const b = buildMessageKey('matcher', '실패');
      expect(a).not.toBe(b);
    });

    it('DB 컬럼 길이(CHAR(32))에 맞는다', () => {
      expect(buildMessageKey('collector', '아무 메시지')).toHaveLength(32);
    });
  });

  describe('truncateMessage', () => {
    it('짧은 메시지는 그대로 둔다', () => {
      expect(truncateMessage('짧음')).toBe('짧음');
    });

    it('긴 메시지는 자르고 원래 길이를 알려준다', () => {
      const long = 'x'.repeat(3000);
      const cut = truncateMessage(long);
      expect(cut.length).toBeLessThan(long.length);
      expect(cut).toContain('3000자 중 일부');
    });
  });
});
