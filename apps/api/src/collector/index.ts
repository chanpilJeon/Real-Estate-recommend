/**
 * collector 모듈 공개 API (ToDo.md 3.11).
 * 외부에는 이 두 가지 실행 메서드만 노출한다.
 */
export { CollectorModule } from './collector.module';
export { CollectionOrchestrator, INCREMENTAL_MONTHS, JOB_DAILY, JOB_BACKFILL } from './collection-orchestrator';
export { YearMonth } from './domain/year-month';
export type { CollectionReport } from './domain/collection-report';
