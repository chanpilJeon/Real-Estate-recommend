import { describe, expect, it } from 'vitest';

import {
  MATCH_FAILURE_WARN,
  QUOTA_WARN_RATIO,
  STALE_DAYS,
  judgeStatus,
  type StatusSignals,
} from './service-status';

/** 아무 문제 없는 상태 */
const healthy: StatusSignals = {
  databaseOk: true,
  freshnessDays: 1,
  lastCollect: { status: 'success', finishedAt: new Date('2026-09-08T06:03:00Z') },
  quotas: [{ provider: 'molit', used: 1_000, limit: 10_000, ratio: 0.1 }],
  unresolvedMatchFailures: 0,
  usingDefaultPassword: false,
  hasCollectRegions: true,
};

const check = (signals: Partial<StatusSignals>, label: string) =>
  judgeStatus({ ...healthy, ...signals }).checks.find((c) => c.label === label);

describe('judgeStatus — "지금 정상인가"를 한 문장으로', () => {
  it('아무 문제 없으면 할 일이 없다고 말한다', () => {
    const status = judgeStatus(healthy);
    expect(status.level).toBe('ok');
    expect(status.headline).toContain('정상');
    expect(status.actions).toEqual([]);
  });

  it('가장 나쁜 항목이 전체 등급을 정한다', () => {
    // 경고 하나 + 오류 하나 → 전체는 오류
    const status = judgeStatus({
      ...healthy,
      usingDefaultPassword: true,
      lastCollect: { status: 'failed', finishedAt: new Date() },
    });
    expect(status.level).toBe('error');
  });

  describe('데이터베이스', () => {
    it('연결이 안 되면 오류이고, 무엇을 하면 되는지 알려준다', () => {
      const status = judgeStatus({ ...healthy, databaseOk: false });
      expect(status.level).toBe('error');
      expect(status.actions.join(' ')).toContain('Docker');
    });
  });

  describe('데이터 신선도', () => {
    it(`${STALE_DAYS}일 이상 밀리면 경고한다`, () => {
      expect(check({ freshnessDays: STALE_DAYS }, '데이터 신선도')?.level).toBe('warn');
    });

    it(`${STALE_DAYS - 1}일까지는 정상이다`, () => {
      expect(check({ freshnessDays: STALE_DAYS - 1 }, '데이터 신선도')?.level).toBe('ok');
    });

    it('오늘 계약분이 있으면 "0일 전"이 아니라 "오늘"이라고 말한다', () => {
      expect(check({ freshnessDays: 0 }, '데이터 신선도')?.detail).toContain('오늘');
    });

    it('데이터가 아예 없으면 수집부터 하라고 한다', () => {
      const status = judgeStatus({ ...healthy, freshnessDays: null });
      expect(status.level).toBe('warn');
      expect(status.actions.join(' ')).toContain('collect');
    });
  });

  describe('수집 배치', () => {
    it('한 번이라도 실패했으면 오류로 본다 (ToDo.md 8절)', () => {
      const level = check({ lastCollect: { status: 'failed', finishedAt: new Date() } }, '수집 배치')?.level;
      expect(level).toBe('error');
    });

    it('실행 중은 정상이다', () => {
      expect(check({ lastCollect: { status: 'running', finishedAt: null } }, '수집 배치')?.level).toBe('ok');
    });

    it('아직 한 번도 안 돌았으면 경고', () => {
      expect(check({ lastCollect: null }, '수집 배치')?.level).toBe('warn');
    });
  });

  describe('공공 API 한도', () => {
    it(`${QUOTA_WARN_RATIO * 100}% 를 넘으면 경고`, () => {
      const signals = { quotas: [{ provider: 'molit', used: 8_500, limit: 10_000, ratio: 0.85 }] };
      expect(check(signals, '국토부 API')?.level).toBe('warn');
    });

    it('다 써도 오류가 아니라 경고다 — 자정에 저절로 풀리기 때문', () => {
      // 여기서 빨간불을 켜면 정말 고장났을 때와 구분이 안 된다
      const signals = { quotas: [{ provider: 'molit', used: 10_000, limit: 10_000, ratio: 1 }] };
      const status = judgeStatus({ ...healthy, ...signals });
      expect(status.level).toBe('warn');
      expect(status.actions.join(' ')).toContain('자정');
    });

    it('79.6% 를 80% 로 보여주면서 경고를 안 띄우지 않는다 (표시와 판정이 어긋나지 않게)', () => {
      const signals = { quotas: [{ provider: 'molit', used: 7_960, limit: 10_000, ratio: 0.796 }] };
      const check = judgeStatus({ ...healthy, ...signals }).checks.find((c) => c.label === '국토부 API');
      expect(check?.level).toBe('ok');
      expect(check?.detail).toContain('79%');
    });

    it('카카오는 카카오라고 부른다 (provider 코드를 그대로 보여주지 않는다)', () => {
      const signals = { quotas: [{ provider: 'kakao', used: 10, limit: 100_000, ratio: 0.0001 }] };
      expect(check(signals, '카카오 API')).toBeDefined();
    });
  });

  describe('단지 매칭', () => {
    it(`${MATCH_FAILURE_WARN}건 이상 쌓이면 경고하고 보정을 권한다`, () => {
      const status = judgeStatus({ ...healthy, unresolvedMatchFailures: MATCH_FAILURE_WARN });
      expect(status.level).toBe('warn');
      expect(status.actions.join(' ')).toContain('매칭 보정');
    });

    it('조금 있는 정도는 정상으로 두되 건수는 알려준다', () => {
      const detail = check({ unresolvedMatchFailures: 3 }, '단지 매칭')?.detail;
      expect(detail).toContain('3건');
    });
  });

  describe('관리자 비밀번호', () => {
    it('기본값이면 경고하고 바꾸라고 한다', () => {
      const status = judgeStatus({ ...healthy, usingDefaultPassword: true });
      expect(status.level).toBe('warn');
      expect(status.actions.join(' ')).toContain('비밀번호');
    });

    it('바꿨으면 아예 목록에 나오지 않는다 (할 일이 아니므로)', () => {
      expect(check({ usingDefaultPassword: false }, '관리자 비밀번호')).toBeUndefined();
    });
  });

  it('수집 지역이 없으면 어디에 무엇을 넣어야 하는지 알려준다', () => {
    const status = judgeStatus({ ...healthy, hasCollectRegions: false });
    expect(status.actions.join(' ')).toContain('COLLECT_SIGUNGU_CODES');
  });

  it('모든 문장이 한국어이고 개발 용어를 그대로 노출하지 않는다', () => {
    const status = judgeStatus({ ...healthy, databaseOk: false, freshnessDays: null });
    for (const text of [status.headline, ...status.actions]) {
      expect(text).toMatch(/[가-힣]/);
      expect(text).not.toMatch(/null|undefined|Error:/);
    }
  });
});
