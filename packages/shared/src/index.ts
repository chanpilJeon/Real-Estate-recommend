/**
 * @apt/shared — 공유 커널 (ToDo.md 3.1, 계층 L0)
 *
 * 웹(프론트)과 API(백엔드)가 함께 쓰는 값 객체·DTO·상수의 단일 출처.
 * 이 패키지는 NestJS·Prisma·React 를 절대 import 하지 않는다 (순수 TypeScript).
 *
 * 이 배럴에 없는 것은 외부에서 쓰지 않는다.
 */

export { InvalidValueError } from './errors';

export { Money } from './value-objects/money';
export { Area } from './value-objects/area';
export { RegionCode } from './value-objects/region-code';
export { Coordinate } from './value-objects/coordinate';

export type {
  PaginatedDto,
  SearchConditionDto,
  ComplexSummaryDto,
  RecommendationDto,
  RegionCandidateDto,
} from './dto';

export { APP_NAME, PRESET_NAMES, PRESET_LABELS } from './constants';
export type { PresetName } from './constants';
