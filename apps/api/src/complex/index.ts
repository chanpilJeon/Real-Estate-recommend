/**
 * complex 모듈 공개 API (ToDo.md 2.1-5).
 * Prisma 구현체와 컨트롤러는 내보내지 않는다.
 */
export { ComplexModule } from './complex.module';
export { ComplexService } from './complex.service';
export { Complex, LARGE_SCALE_HOUSEHOLDS, QUALITY_WEIGHTS, type ComplexProps } from './domain/complex';
export { normalizeComplexName } from './domain/normalize-name';
/** 검색 모듈(L4)도 단지를 직접 조회하므로 변환 규칙을 공유한다 */
export { toComplexDomain, type ComplexRow } from './prisma-complex.mapper';
export {
  COMPLEX_REPOSITORY,
  type ComplexUpsertInput,
  type IComplexRepository,
  type UpsertResult,
} from './complex.repository';
