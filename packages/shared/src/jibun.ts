/**
 * 지번 정규화 (순수 함수).
 *
 * 왜 필요한가: 실거래 API 와 공동주택 정보(K-apt) 는 **같은 아파트를 다른 이름으로 부른다**
 * (실거래 '한보미도맨션2' ↔ K-apt '대치미도맨션'). 이름으로는 이어붙일 수 없다.
 * 하지만 번지는 같다 — 이름과 달리 사람이 붙이는 별칭이 아니라 주소이기 때문이다.
 *
 * 표기가 흔들릴 수 있어("0761-0010" / "761-10" / "761 - 10") 비교 전에 형태를 맞춘다.
 */

/** 본번[-부번] 형태만 지번으로 본다. "산 12" 같은 임야 표기는 아파트에 쓰이지 않는다 */
const JIBUN = /^(\d+)(?:-(\d+))?$/;

/**
 * "0761-0010" → "761-10", "708" → "708".
 * 지번 형태가 아니면 null (조용히 이상한 값으로 대조하지 않도록).
 */
export function normalizeJibun(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const compact = raw.replace(/\s+/g, '');
  const matched = JIBUN.exec(compact);
  if (matched === null) return null;

  const bonbun = String(Number(matched[1]));
  // 부번 0 은 부번이 없다는 뜻이다 ("708-0" 과 "708" 은 같은 곳)
  const bubun = matched[2] === undefined ? 0 : Number(matched[2]);
  return bubun === 0 ? bonbun : `${bonbun}-${bubun}`;
}

/** 도로명주소의 표식. "테헤란로48길 10" 의 10 은 지번이 아니라 건물번호다 */
const ROAD_NAME = /(로|길|대로)\d*번?길?$/;

/**
 * "서울특별시 강남구 역삼동 761-10" 처럼 주소 끝에 붙은 지번을 떼어 낸다.
 * K-apt 는 지번을 따로 주지 않고 주소 안에만 넣어 준다.
 *
 * ⚠ 도로명주소는 건물번호가 지번과 똑같이 생겨서("테헤란로48길 10") 구별해야 한다.
 *   잘못 읽으면 엉뚱한 단지끼리 같은 번지로 묶인다.
 */
export function jibunFromAddress(address: string): string | null {
  const tokens = address.trim().split(/\s+/).filter((token) => token !== '');
  if (tokens.length < 2) return null;
  if (ROAD_NAME.test(tokens[tokens.length - 2]!)) return null;

  return normalizeJibun(tokens[tokens.length - 1]!);
}
