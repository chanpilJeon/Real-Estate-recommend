import { describe, expect, it } from 'vitest';

import { APP_NAME, PRESET_LABELS, PRESET_NAMES } from './index';

/**
 * Step 0 연기(smoke) 테스트.
 * 목적: 테스트 러너가 DB·네트워크 없이 도는지 확인 (ToDo.md 2.1-3 원칙).
 * 실제 값 객체 테스트는 Step 1 에서 여기에 추가된다.
 */
describe('공유 커널(@apt/shared)', () => {
  it('앱 이름이 정의되어 있다', () => {
    expect(APP_NAME).toBe('아파트 매물 추천');
  });

  it('추천 프리셋 3종에 모두 한국어 라벨이 있다', () => {
    expect(PRESET_NAMES).toHaveLength(3);
    for (const name of PRESET_NAMES) {
      expect(PRESET_LABELS[name]).toBeTruthy();
    }
  });
});
