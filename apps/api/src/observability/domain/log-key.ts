import { createHash } from 'node:crypto';

/** app_logs.message_key 는 CHAR(32) — md5 hex 길이와 같다 */
const KEY_LENGTH = 32;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * 그룹핑용으로 메시지에서 변하는 부분을 지운다.
 *
 * "국토부 API 타임아웃 (3회 재시도)" 와 "국토부 API 타임아웃 (5회 재시도)" 는
 * 같은 문제다. 숫자를 빼고 비교해야 대시보드에서 하나로 묶인다.
 * 지역명 같은 단어는 남긴다 — 강남구만 실패하는 상황은 따로 보여야 하기 때문.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\d+/g, '#') // 숫자 → #
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 같은 종류의 로그를 묶는 키.
 * context 를 함께 넣어, 메시지가 같아도 발생 모듈이 다르면 구분한다.
 */
export function buildMessageKey(context: string, message: string): string {
  return createHash('md5')
    .update(`${context}|${normalizeMessage(message)}`)
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

/** DB 컬럼 길이를 넘지 않도록 자른다 (스택트레이스가 통째로 들어오는 경우 대비) */
export function truncateMessage(message: string, max = MAX_MESSAGE_LENGTH): string {
  return message.length <= max ? message : `${message.slice(0, max)}… (${message.length}자 중 일부)`;
}
