import type { PaginatedDto } from '@apt/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { ComplexMatcher, digitsOf, hasPhaseConflict, MATCH_THRESHOLD } from './complex-matcher';
import type { CandidateSource } from './complex-matcher';
import type {
  CandidateComplex,
  IMatchRepository,
  MatchFailureRecord,
  RecordFailureInput,
} from './match.repository';

const 역삼동 = '1168010100';
const 대치동 = '1168010600';

const complex = (
  id: number,
  name: string,
  regionCode: string,
  builtYear: number | null,
): CandidateComplex => ({
  id,
  name,
  nameNormalized: ComplexMatcher.normalize(name),
  regionCode,
  builtYear,
});

/** 강남구에 있다고 가정하는 단지 마스터 */
const MASTER: CandidateComplex[] = [
  complex(1, '래미안역삼(1차)', 역삼동, 2005),
  complex(2, '래미안역삼(2차)', 역삼동, 2008),
  complex(3, '역삼e편한세상', 역삼동, 2012),
  complex(4, '대치푸르지오', 대치동, 2012),
  complex(5, '개포자이', 대치동, 1994),
];

class FakeSource implements CandidateSource {
  constructor(private readonly pool: CandidateComplex[] = MASTER) {}
  byRegion(regionCode: string): Promise<CandidateComplex[]> {
    return Promise.resolve(this.pool.filter((c) => c.regionCode === regionCode));
  }
  bySigungu(sigunguCode: string): Promise<CandidateComplex[]> {
    return Promise.resolve(this.pool.filter((c) => c.regionCode.startsWith(sigunguCode)));
  }
}

class FakeMatchRepository implements IMatchRepository {
  readonly overrides = new Map<string, number>();
  readonly failures: RecordFailureInput[] = [];

  findOverride(regionCode: string, rawName: string): Promise<number | null> {
    return Promise.resolve(this.overrides.get(`${regionCode}|${rawName}`) ?? null);
  }
  saveOverride(regionCode: string, rawName: string, complexId: number): Promise<void> {
    this.overrides.set(`${regionCode}|${rawName}`, complexId);
    return Promise.resolve();
  }
  recordFailure(input: RecordFailureInput): Promise<void> {
    this.failures.push(input);
    return Promise.resolve();
  }
  listPendingFailures(): Promise<PaginatedDto<MatchFailureRecord>> {
    return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
  }
  findFailure(): Promise<MatchFailureRecord | null> {
    return Promise.resolve(null);
  }
  markResolved(): Promise<void> {
    return Promise.resolve();
  }
  closeAlreadyMatched(): Promise<number> {
    return Promise.resolve(0);
  }

  countPending(): Promise<number> {
    return Promise.resolve(this.failures.length);
  }
}

describe('ComplexMatcher — 단지명 매칭 (ToDo.md 최대 난관)', () => {
  let repo: FakeMatchRepository;
  let matcher: ComplexMatcher;

  beforeEach(() => {
    repo = new FakeMatchRepository();
    matcher = new ComplexMatcher(new FakeSource(), repo);
  });

  describe('실제 표기 변형 — 같은 단지로 이어져야 한다', () => {
    // 공공 API 사이에서 실제로 관찰되는 표기 흔들림 유형들
    it.each([
      ['래미안역삼(1차)', '괄호 그대로'],
      ['래미안역삼 1차', '괄호 대신 공백'],
      ['래미안역삼1차', '붙여쓰기'],
      ['래미안역삼  1차', '공백 여러 개'],
      ['래미안역삼(1차)아파트', '뒤에 아파트'],
      ['래미안역삼-1차', '하이픈'],
      ['래미안역삼·1차', '가운뎃점'],
      ['래미안역삼[1차]', '대괄호'],
      [' 래미안역삼(1차) ', '앞뒤 공백'],
      ['래미안역삼(1차)아파트 ', '복합'],
    ])('"%s" (%s) → 1번 단지', async (rawName) => {
      const result = await matcher.match({ regionCode: 역삼동, rawName, builtYear: 2005 });

      expect(result.status).toBe('matched');
      if (result.status === 'matched') expect(result.complexId).toBe(1);
    });

    it.each([
      ['역삼e편한세상', '그대로'],
      ['역삼E편한세상', '대문자'],
      ['역삼e편한세상아파트', '아파트 접미'],
      ['역삼 e편한세상', '공백'],
      ['역삼e편한세상 ', '뒤 공백'],
    ])('"%s" (%s) → 3번 단지', async (rawName) => {
      const result = await matcher.match({ regionCode: 역삼동, rawName, builtYear: 2012 });

      expect(result.status).toBe('matched');
      if (result.status === 'matched') expect(result.complexId).toBe(3);
    });

    it.each([
      ['대치푸르지오', 대치동, 2012, 4],
      ['대치푸르지오아파트', 대치동, 2012, 4],
      ['대치 푸르지오', 대치동, 2012, 4],
      ['개포자이', 대치동, 1994, 5],
      ['개포자이아파트', 대치동, 1994, 5],
      ['개포자이 ', 대치동, 1994, 5],
    ])('"%s" → %i번 단지', async (rawName, regionCode, builtYear, expectedId) => {
      const result = await matcher.match({ regionCode, rawName, builtYear });

      expect(result.status).toBe('matched');
      if (result.status === 'matched') expect(result.complexId).toBe(expectedId);
    });
  });

  describe('차수가 다르면 다른 단지다 (가장 위험한 오매칭)', () => {
    it.each([
      ['래미안역삼(1차)', 2005, 1],
      ['래미안역삼 1차', 2005, 1],
      ['래미안역삼(2차)', 2008, 2],
      ['래미안역삼 2차', 2008, 2],
      ['래미안역삼2차', 2008, 2],
    ])('"%s" (건축 %i) → %i번', async (rawName, builtYear, expectedId) => {
      const result = await matcher.match({ regionCode: 역삼동, rawName, builtYear });

      expect(result.status).toBe('matched');
      if (result.status === 'matched') expect(result.complexId).toBe(expectedId);
    });

    it('한 글자 차이라도 차수가 다르면 자동 매칭하지 않는다 ★', async () => {
      // "래미안역삼1차" vs "래미안역삼9차" 는 유사도 0.875 로 기준(0.85)을 넘지만
      // 명백히 다른 단지다. 여기서 잘못 붙으면 시세가 통째로 오염된다.
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '래미안역삼9차',
        builtYear: 2005,
      });

      expect(result.status).not.toBe('matched');
    });

    it('1차를 2차로 잘못 붙이지 않는다', async () => {
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '래미안역삼 1차',
        builtYear: 2005,
      });
      if (result.status === 'matched') expect(result.complexId).not.toBe(2);
    });
  });

  describe('수동 보정 사전이 가장 먼저다', () => {
    it('사전에 있으면 무조건 그대로 따른다', async () => {
      await repo.saveOverride(역삼동, '이상한이름', 3);
      const result = await matcher.match({ regionCode: 역삼동, rawName: '이상한이름', builtYear: null });

      expect(result).toEqual({ status: 'matched', complexId: 3, confidence: 1, via: 'override' });
    });

    it('사전이 이름 일치보다 우선한다 (사람의 판단이 규칙을 이긴다)', async () => {
      await repo.saveOverride(역삼동, '래미안역삼(1차)', 2);
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '래미안역삼(1차)',
        builtYear: 2005,
      });

      if (result.status === 'matched') expect(result.complexId).toBe(2);
    });
  });

  describe('건축년도', () => {
    it('1년 차이는 같은 것으로 본다 (준공과 사용승인 시점 차이)', async () => {
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '래미안역삼(1차)',
        builtYear: 2006,
      });
      expect(result.status).toBe('matched');
    });

    it('건축년도를 몰라도 이름이 정확하면 이어붙인다', async () => {
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '래미안역삼(1차)',
        builtYear: null,
      });
      expect(result.status).toBe('matched');
    });
  });

  describe('시군구로 넓혀 찾기', () => {
    it('옆 동으로 등록된 단지도 찾아준다 (신뢰도는 낮춰서)', async () => {
      // 대치푸르지오는 대치동에 있는데 실거래가 역삼동으로 들어온 경우
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '대치푸르지오',
        builtYear: 2012,
      });

      expect(result.status).toBe('matched');
      if (result.status === 'matched') {
        expect(result.complexId).toBe(4);
        expect(result.via).toBe('exact-sigungu');
        expect(result.confidence).toBeLessThan(1);
      }
    });
  });

  describe('매칭 실패', () => {
    it('아예 모르는 단지는 실패로 남긴다', async () => {
      const result = await matcher.match({
        regionCode: 역삼동,
        rawName: '존재하지않는아파트',
        builtYear: 2020,
      });

      expect(result.status).toBe('failed');
      expect(repo.failures).toHaveLength(1);
      expect(repo.failures[0]?.rawName).toBe('존재하지않는아파트');
    });

    it('실패 기록에 후보를 함께 남긴다 (사람이 고르기 쉽게)', async () => {
      await matcher.match({ regionCode: 역삼동, rawName: '래미안역삼9차', builtYear: 2005 });
      expect(repo.failures[0]?.candidates.length).toBeGreaterThan(0);
    });

    it('건축년도가 크게 어긋나도 이름이 비슷하면 후보로 보여준다', async () => {
      // 연식 자료 자체가 틀린 경우가 있다. 후보를 다 지워버리면 사람이 보정할 수 없다.
      await matcher.match({ regionCode: 역삼동, rawName: '래미안역삼9차', builtYear: 1900 });

      const candidates = repo.failures.at(-1)?.candidates ?? [];
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((c) => c.name.includes('래미안역삼'))).toBe(true);
    });

    it('빈 단지명은 조회조차 하지 않는다', async () => {
      const result = await matcher.match({ regionCode: 역삼동, rawName: '   ', builtYear: null });

      expect(result.status).toBe('failed');
      expect(repo.failures).toHaveLength(0);
    });

    it('후보가 하나도 없으면 이유를 명확히 남긴다', async () => {
      const empty = new ComplexMatcher(new FakeSource([]), repo);
      const result = await empty.match({ regionCode: 역삼동, rawName: '아무단지', builtYear: 2020 });

      if (result.status === 'failed') expect(result.reason).toContain('후보 단지가 없습니다');
    });
  });

  describe('애매한 경우는 사람에게 넘긴다', () => {
    it('같은 동에 같은 이름·비슷한 연식 단지가 둘이면 ambiguous', async () => {
      const twins = new ComplexMatcher(
        new FakeSource([
          complex(10, '한빛아파트', 역삼동, 2000),
          complex(11, '한빛아파트', 역삼동, 2000),
        ]),
        repo,
      );
      const result = await twins.match({ regionCode: 역삼동, rawName: '한빛', builtYear: 2000 });

      expect(result.status).toBe('ambiguous');
      if (result.status === 'ambiguous') expect(result.candidates).toHaveLength(2);
    });

    it('1·2위 점수가 붙어 있으면 자동 채택하지 않는다', async () => {
      const close = new ComplexMatcher(
        new FakeSource([
          complex(20, '한빛마을1단지', 역삼동, 2000),
          complex(21, '한빛마을2단지', 역삼동, 2000),
        ]),
        repo,
      );
      const result = await close.match({ regionCode: 역삼동, rawName: '한빛마을O단지', builtYear: 2000 });

      expect(result.status).not.toBe('matched');
    });
  });

  describe('차수 충돌 규칙 (순수 함수)', () => {
    it.each([
      ['래미안역삼1차', '래미안역삼9차'],
      ['힐스테이트3단지', '힐스테이트4단지'],
      ['주공1단지', '주공12단지'],
    ])('"%s" 와 "%s" 는 충돌 (다른 단지)', (a, b) => {
      expect(hasPhaseConflict(a, b)).toBe(true);
    });

    it.each([
      ['래미안역삼1차', '래미안역삼1차'],
      ['개포자이', '반포자이'],
      ['자이', '자이1'],
    ])('"%s" 와 "%s" 는 충돌 아님', (a, b) => {
      expect(hasPhaseConflict(a, b)).toBe(false);
    });

    it('한쪽에만 숫자가 있으면 자르지 않는다 ("자이" vs "자이1" 은 같을 수 있다)', () => {
      expect(hasPhaseConflict('자이', '자이1')).toBe(false);
    });

    it('digitsOf 는 숫자만 이어붙인다', () => {
      expect(digitsOf('래미안역삼1차')).toBe('1');
      expect(digitsOf('e편한세상3단지2블록')).toBe('32');
      expect(digitsOf('개포자이')).toBe('');
    });
  });

  describe('정적 순수 함수', () => {
    it('normalize 는 complex 모듈 규칙을 그대로 쓴다 (단일 출처)', () => {
      expect(ComplexMatcher.normalize('래미안역삼 1차')).toBe(
        ComplexMatcher.normalize('래미안역삼(1차)'),
      );
    });

    it('similarity 는 0~1 을 낸다', () => {
      expect(ComplexMatcher.similarity('가나다', '가나다')).toBe(1);
      expect(ComplexMatcher.similarity('가나다', '라마바')).toBe(0);
    });

    it(`자동 채택 기준은 ${MATCH_THRESHOLD} 이다`, () => {
      expect(MATCH_THRESHOLD).toBeGreaterThan(0.8);
      expect(MATCH_THRESHOLD).toBeLessThan(1);
    });
  });

  describe('후보 캐시', () => {
    it('같은 지역을 반복 조회하지 않는다 (배치가 수천 건을 돌린다)', async () => {
      let calls = 0;
      const counting: CandidateSource = {
        byRegion: (code) => {
          calls += 1;
          return Promise.resolve(MASTER.filter((c) => c.regionCode === code));
        },
        bySigungu: (code) => Promise.resolve(MASTER.filter((c) => c.regionCode.startsWith(code))),
      };
      const cached = new ComplexMatcher(counting, repo);

      await cached.match({ regionCode: 역삼동, rawName: '래미안역삼(1차)', builtYear: 2005 });
      await cached.match({ regionCode: 역삼동, rawName: '래미안역삼(2차)', builtYear: 2008 });

      expect(calls).toBe(1);
    });

    it('resetCache 후에는 다시 읽는다', async () => {
      let calls = 0;
      const counting: CandidateSource = {
        byRegion: (code) => {
          calls += 1;
          return Promise.resolve(MASTER.filter((c) => c.regionCode === code));
        },
        bySigungu: (code) => Promise.resolve(MASTER.filter((c) => c.regionCode.startsWith(code))),
      };
      const cached = new ComplexMatcher(counting, repo);

      await cached.match({ regionCode: 역삼동, rawName: '래미안역삼(1차)', builtYear: 2005 });
      cached.resetCache();
      await cached.match({ regionCode: 역삼동, rawName: '래미안역삼(1차)', builtYear: 2005 });

      expect(calls).toBe(2);
    });
  });
});
