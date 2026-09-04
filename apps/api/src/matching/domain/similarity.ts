/**
 * 문자열 유사도 (순수 함수).
 *
 * 단지명 매칭의 2단계에서 쓴다. 정규화해도 남는 표기 차이
 * (`"래미안역삼2차"` vs `"래미안역삼제2차"`)를 잡기 위함이다.
 */

/**
 * 편집 거리 (Levenshtein).
 * 한 문자열을 다른 문자열로 바꾸는 데 필요한 최소 편집(삽입·삭제·치환) 횟수.
 *
 * 두 줄만 들고 계산해 메모리를 O(min(n,m)) 로 쓴다 —
 * 수집 배치가 수천 건을 돌리므로 낭비하지 않는다.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 짧은 쪽을 열로 두어 배열 크기를 줄인다
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];

  let previous = Array.from({ length: short.length + 1 }, (_, i) => i);
  let current = new Array<number>(short.length + 1);

  for (let i = 1; i <= long.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= short.length; j += 1) {
      const cost = long[i - 1] === short[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1, // 삽입
        previous[j]! + 1, // 삭제
        previous[j - 1]! + cost, // 치환
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[short.length]!;
}

/**
 * 0~1 유사도. 1이면 완전히 같다.
 * 편집 거리를 긴 쪽 길이로 나눠 정규화한다.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 && b.length === 0) return 1;

  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;

  return round4(1 - levenshtein(a, b) / longest);
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
