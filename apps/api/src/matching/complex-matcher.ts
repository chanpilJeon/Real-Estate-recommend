import { normalizeComplexName } from '../complex';

import type { MatchCandidate, MatchResult, RawComplexIdentity } from './domain/match-result';
import { similarity } from './domain/similarity';
import type { CandidateComplex, IMatchRepository } from './match.repository';

/** 이 점수 이상이면 자동으로 이어붙인다 */
export const MATCH_THRESHOLD = 0.85;
/** 1위와 2위 차이가 이보다 작으면 사람이 골라야 한다 */
export const AMBIGUOUS_MARGIN = 0.05;
/** 이 미만은 후보로도 보지 않는다 */
export const MIN_CANDIDATE_SCORE = 0.6;
/**
 * 건축년도 허용 오차.
 * 실거래 API 의 '건축년도' 와 단지정보 API 의 '사용승인일' 연도가
 * 1년 어긋나는 경우가 흔하다 (준공과 사용승인 시점 차이).
 */
export const BUILT_YEAR_TOLERANCE = 1;

/** 건축년도가 맞으면 주는 가산점 */
const BUILT_YEAR_BONUS = 0.05;
/** 건축년도가 크게 어긋나면 주는 감점 */
const BUILT_YEAR_PENALTY = 0.3;

/** 후보 목록을 가져오는 함수 — complex 모듈이 주입한다 */
export interface CandidateSource {
  byRegion(regionCode: string): Promise<CandidateComplex[]>;
  bySigungu(sigunguCode: string): Promise<CandidateComplex[]>;
}

/**
 * 단지명 매칭기 (ToDo.md 3.10) — **이 프로젝트 최대 난관**.
 *
 * 실거래 API 는 `"래미안OO 1차"`, 단지정보 API 는 `"래미안OO(1차)"` 처럼
 * 같은 단지를 다르게 적는다. 여기서 못 이으면 수집한 거래가 단지에 안 붙어
 * 통계도 추천도 쓸모없어진다.
 *
 * **단계**
 * 0. 수동 보정 사전(`match_overrides`) — 있으면 무조건 따른다
 * 1. 같은 법정동 안에서 정규화 완전일치
 * 2. 같은 시군구까지 넓혀 완전일치 (단지가 옆 동으로 등록된 경우)
 * 3. 유사도 + 건축년도로 점수화 → 1위가 충분히 높고 2위와 벌어지면 채택
 * 4. 실패 → `match_failures` 에 남겨 사람이 보정하게 한다
 */
export class ComplexMatcher {
  /** 배치 한 번 안에서 같은 지역을 수천 번 조회하지 않도록 */
  private readonly candidateCache = new Map<string, CandidateComplex[]>();

  constructor(
    private readonly source: CandidateSource,
    private readonly repository: IMatchRepository,
  ) {}

  /** 이름 정규화 — complex 모듈의 규칙을 그대로 쓴다 (단일 출처) */
  static normalize(name: string): string {
    return normalizeComplexName(name);
  }

  static similarity(a: string, b: string): number {
    return similarity(a, b);
  }

  /** 배치 시작 시 호출 — 이전 실행의 후보 목록을 버린다 */
  resetCache(): void {
    this.candidateCache.clear();
  }

  async match(raw: RawComplexIdentity): Promise<MatchResult> {
    const normalized = ComplexMatcher.normalize(raw.rawName);
    if (normalized === '') {
      return { status: 'failed', reason: '단지명이 비어 있습니다', candidates: [] };
    }

    // 0단계 — 사람이 이미 답을 알려준 경우
    const override = await this.repository.findOverride(raw.regionCode, raw.rawName);
    if (override !== null) {
      return { status: 'matched', complexId: override, confidence: 1, via: 'override' };
    }

    // 1단계 — 같은 법정동 안에서 완전일치
    const inRegion = await this.candidatesOf(raw.regionCode, () => this.source.byRegion(raw.regionCode));
    const exact = this.exactMatches(inRegion, normalized, raw.builtYear);
    if (exact.length === 1) {
      return { status: 'matched', complexId: exact[0]!.id, confidence: 1, via: 'exact' };
    }
    if (exact.length > 1) {
      // 같은 동에 같은 이름·같은 연식 단지가 둘? 사람이 봐야 한다
      return { status: 'ambiguous', candidates: exact.map((c) => toCandidate(c, 1)) };
    }

    // 2단계 — 시군구로 넓혀 완전일치 (단지가 옆 동으로 등록된 경우가 있다)
    const sigunguCode = raw.regionCode.slice(0, 5);
    const inSigungu = await this.candidatesOf(`sgg:${sigunguCode}`, () =>
      this.source.bySigungu(sigunguCode),
    );
    const exactWide = this.exactMatches(inSigungu, normalized, raw.builtYear);
    if (exactWide.length === 1) {
      return { status: 'matched', complexId: exactWide[0]!.id, confidence: 0.9, via: 'exact-sigungu' };
    }

    // 3단계 — 유사도 점수화
    const scored = this.scoreAll(inSigungu, normalized, raw.builtYear);
    const best = scored[0];
    const second = scored[1];

    if (best !== undefined && best.score >= MATCH_THRESHOLD) {
      const clearWinner = second === undefined || best.score - second.score >= AMBIGUOUS_MARGIN;
      if (clearWinner) {
        return { status: 'matched', complexId: best.complexId, confidence: best.score, via: 'similarity' };
      }
      return { status: 'ambiguous', candidates: scored.slice(0, 5) };
    }

    // 4단계 — 실패. 후보를 함께 남겨야 사람이 고르기 쉽다
    const candidates = scored.slice(0, 5);
    await this.repository.recordFailure({
      regionCode: raw.regionCode,
      rawName: raw.rawName,
      builtYear: raw.builtYear,
      candidates: candidates.map((c) => ({ complexId: c.complexId, name: c.name, score: c.score })),
    });

    return {
      status: 'failed',
      reason:
        candidates.length === 0
          ? '같은 시군구에 후보 단지가 없습니다'
          : `가장 비슷한 단지도 기준(${MATCH_THRESHOLD})에 못 미칩니다 (최고 ${candidates[0]!.score})`,
      candidates,
    };
  }

  private exactMatches(
    pool: CandidateComplex[],
    normalized: string,
    builtYear: number | null,
  ): CandidateComplex[] {
    const sameName = pool.filter((c) => c.nameNormalized === normalized);
    if (sameName.length <= 1) return sameName;

    // 이름이 같은 게 여럿이면 건축년도로 좁힌다
    const byYear = sameName.filter((c) => yearsAgree(c.builtYear, builtYear));
    return byYear.length > 0 ? byYear : sameName;
  }

  /**
   * 후보 점수화.
   *
   * **거르는 기준과 줄 세우는 기준이 다르다.**
   * - 거를 때는 **이름 유사도**만 본다. 건축년도 감점까지 반영해 걸러버리면
   *   매칭 실패 기록에 사람이 참고할 후보가 하나도 안 남는다.
   *   (연식 자료 자체가 틀린 경우도 있어서 이름이 비슷하면 보여줘야 한다)
   * - 줄 세울 때는 건축년도를 반영한 점수를 쓴다. 자동 채택 판단이 이 값이다.
   */
  private scoreAll(
    pool: CandidateComplex[],
    normalized: string,
    builtYear: number | null,
  ): MatchCandidate[] {
    return pool
      .map((c) => ({
        complexId: c.id,
        name: c.name,
        nameScore: similarity(c.nameNormalized, normalized),
        score: scoreOf(c, normalized, builtYear),
      }))
      .filter((c) => c.nameScore >= MIN_CANDIDATE_SCORE)
      .sort((a, b) => b.score - a.score)
      .map(({ complexId, name, score }) => ({ complexId, name, score }));
  }

  private async candidatesOf(
    key: string,
    load: () => Promise<CandidateComplex[]>,
  ): Promise<CandidateComplex[]> {
    const cached = this.candidateCache.get(key);
    if (cached !== undefined) return cached;

    const loaded = await load();
    this.candidateCache.set(key, loaded);
    return loaded;
  }
}

/**
 * 이름에서 숫자만 뽑는다. "래미안역삼1차" → "1"
 *
 * 차수·단지번호를 가려내기 위한 것이다.
 */
export function digitsOf(normalized: string): string {
  return normalized.replace(/\D/g, '');
}

/**
 * 차수·단지번호가 어긋나는가 — **가장 위험한 오매칭을 막는 규칙**.
 *
 * `"래미안역삼1차"` 와 `"래미안역삼9차"` 는 8글자 중 1글자 차이라
 * 유사도가 0.875 로 자동 채택 기준(0.85)을 넘어버린다. 하지만 이 둘은 명백히 다른 단지다.
 * 거래 데이터가 엉뚱한 단지에 붙으면 시세가 통째로 오염되므로, 이름에 숫자가
 * **둘 다 있는데 다르면** 아예 후보에서 뺀다.
 *
 * 한쪽에만 숫자가 있는 경우(`"자이"` vs `"자이1"`)는 같은 단지일 수 있으므로
 * 여기서 자르지 않고 유사도 판단에 맡긴다.
 */
export function hasPhaseConflict(a: string, b: string): boolean {
  const digitsA = digitsOf(a);
  const digitsB = digitsOf(b);
  return digitsA !== '' && digitsB !== '' && digitsA !== digitsB;
}

/** 이름 유사도에 건축년도 일치 여부를 반영한 점수 */
function scoreOf(candidate: CandidateComplex, normalized: string, builtYear: number | null): number {
  // 차수가 어긋나면 이름이 아무리 비슷해도 다른 단지다
  if (hasPhaseConflict(candidate.nameNormalized, normalized)) return 0;

  const base = similarity(candidate.nameNormalized, normalized);

  // 한쪽이라도 건축년도를 모르면 가감 없이 이름만 본다
  if (builtYear === null || candidate.builtYear === null) return round4(base);

  const adjusted = yearsAgree(candidate.builtYear, builtYear)
    ? base + BUILT_YEAR_BONUS
    : base - BUILT_YEAR_PENALTY;

  return round4(Math.min(Math.max(adjusted, 0), 1));
}

function yearsAgree(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true; // 모르면 어긋난다고 보지 않는다
  return Math.abs(a - b) <= BUILT_YEAR_TOLERANCE;
}

const toCandidate = (c: CandidateComplex, score: number): MatchCandidate => ({
  complexId: c.id,
  name: c.name,
  score,
});

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
