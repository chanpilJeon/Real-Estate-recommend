/**
 * @apt/shared — 공유 커널 (ToDo.md 3.1, 계층 L0)
 *
 * 웹(프론트)과 API(백엔드)가 함께 쓰는 값 객체·DTO·상수의 단일 출처.
 * 이 패키지는 NestJS·Prisma·React 를 절대 import 하지 않는다 (순수 TypeScript).
 *
 * 실제 값 객체(Money·Area·RegionCode·Coordinate) 구현은 Step 1 에서 채운다.
 */

/** 프로젝트 표시 이름 — 화면 타이틀 등에서 공용으로 쓴다. */
export const APP_NAME = '아파트 매물 추천';

/** 추천 가중치 프리셋 (ToDo.md 3.13) */
export const PRESET_NAMES = ['value', 'location', 'newbuild'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export const PRESET_LABELS: Record<PresetName, string> = {
  value: '가성비형',
  location: '입지우선형',
  newbuild: '신축선호형',
};
