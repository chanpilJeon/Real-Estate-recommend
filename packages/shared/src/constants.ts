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
