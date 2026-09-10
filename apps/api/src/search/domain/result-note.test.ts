import { describe, expect, it } from 'vitest';

import { buildResultNote, toKoreanMoney } from './result-note';

const base = {
  totalCandidates: 63,
  shown: 18,
  overBudget: 45,
  nearestOverBudget: { name: '광교아이파크', medianPriceManwon: 107_000 },
  budgetMaxManwon: 100_000,
};

describe('toKoreanMoney', () => {
  it.each([
    [107_000, '10억 7,000만원'],
    [100_000, '10억원'],
    [9_500, '9,500만원'],
    [0, '0만원'],
  ])('%s만원 → %s', (manwon, expected) => {
    expect(toKoreanMoney(manwon)).toBe(expected);
  });
});

describe('buildResultNote — 왜 결과가 이것뿐인지', () => {
  it('몇 곳 중 몇 곳인지, 왜 빠졌는지, 무엇이 가장 가까운지 말한다', () => {
    const note = buildResultNote(base);
    expect(note).toContain('63곳 중 18곳');
    expect(note).toContain('45곳은 예산을 넘습니다');
    expect(note).toContain('광교아이파크 10억 7,000만원');
  });

  it('예산 때문에 빠진 것이 없으면 문장을 만들지 않는다', () => {
    // 굳이 "63곳 중 63곳을 보고 있습니다" 같은 말로 화면을 채우지 않는다
    expect(buildResultNote({ ...base, overBudget: 0 })).toBeNull();
  });

  it('예산을 넘긴 단지가 있어도 가장 가까운 것을 모르면 그 부분은 뺀다', () => {
    const note = buildResultNote({ ...base, nearestOverBudget: null });
    expect(note).toContain('45곳은 예산을 넘습니다');
    expect(note).not.toContain('가장 가까운');
  });

  it('결과가 0곳이어도 이유를 말한다 — 빈 화면만 보여주지 않는다', () => {
    const note = buildResultNote({ ...base, shown: 0, overBudget: 63 });
    expect(note).toContain('0곳');
    expect(note).toContain('63곳은 예산을 넘습니다');
  });
});
