import { describe, expect, it } from 'vitest';

import * as shared from './index';

/**
 * 공개 API 표면 테스트 (ToDo.md 2.1-5 캡슐화 규칙).
 * 배럴에서 export 가 빠지면 web/api 빌드가 깨지므로 여기서 먼저 잡는다.
 */
describe('@apt/shared 공개 API', () => {
  it('값 객체 4종을 내보낸다', () => {
    expect(typeof shared.Money.fromManwon).toBe('function');
    expect(typeof shared.Area.fromSqm).toBe('function');
    expect(typeof shared.RegionCode.parse).toBe('function');
    expect(typeof shared.Coordinate).toBe('function');
  });

  it('오류 타입을 내보낸다', () => {
    expect(new shared.InvalidValueError('필드', '메시지')).toBeInstanceOf(Error);
  });

  it('추천 프리셋 3종에 모두 한국어 라벨이 있다', () => {
    expect(shared.PRESET_NAMES).toHaveLength(3);
    for (const name of shared.PRESET_NAMES) {
      expect(shared.PRESET_LABELS[name]).toBeTruthy();
    }
  });

  it('앱 이름이 정의되어 있다', () => {
    expect(shared.APP_NAME).toBe('아파트 매물 추천');
  });
});
