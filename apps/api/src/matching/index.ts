/**
 * matching 모듈 공개 API (ToDo.md 2.1-5).
 * Prisma 구현체와 내부 점수 규칙은 내보내지 않는다.
 */
export { MatchingModule } from './matching.module';
export {
  ComplexMatcher,
  MATCH_THRESHOLD,
  digitsOf,
  hasPhaseConflict,
  type CandidateSource,
} from './complex-matcher';
export { MatchFailureService, MatchFailureNotFoundError, type ResolveResult } from './match-failure.service';
export type { MatchResult, MatchCandidate, RawComplexIdentity, MatchVia } from './domain/match-result';
export { MATCH_REPOSITORY, type IMatchRepository, type MatchFailureRecord } from './match.repository';
