/**
 * admin 모듈 공개 API (ToDo.md 2.1-5).
 * 가장 바깥 계층이라 다른 모듈이 여기를 import 할 일은 없다.
 * 상태 판정 규칙만 내보낸다 — 화면·테스트가 같은 기준을 쓰기 위해서다.
 */
export { AdminModule } from './admin.module';
export {
  judgeStatus,
  providerName,
  MATCH_FAILURE_WARN,
  QUOTA_WARN_RATIO,
  STALE_DAYS,
  type ServiceStatus,
  type StatusCheck,
  type StatusLevel,
  type StatusSignals,
} from './domain/service-status';
