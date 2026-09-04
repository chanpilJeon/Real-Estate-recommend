/** 매칭 입력 — 실거래 API 가 준 단지 식별 정보 (ToDo.md 3.10) */
export interface RawComplexIdentity {
  /** 법정동코드 10자리 (수집기가 법정동명 → 코드로 이미 바꿔서 넘긴다) */
  regionCode: string;
  /** API 원본 단지명 (정규화 전) */
  rawName: string;
  builtYear: number | null;
}

export interface MatchCandidate {
  complexId: number;
  name: string;
  score: number;
}

export type MatchResult =
  | {
      status: 'matched';
      complexId: number;
      /** 0~1. 어떤 단계에서 붙었는지에 따라 달라진다 */
      confidence: number;
      /** 'override' | 'exact' | 'exact-sigungu' | 'similarity' */
      via: MatchVia;
    }
  /** 후보가 여럿인데 우열을 가릴 수 없다 — 사람이 골라야 한다 */
  | { status: 'ambiguous'; candidates: MatchCandidate[] }
  | { status: 'failed'; reason: string; candidates: MatchCandidate[] };

export type MatchVia = 'override' | 'exact' | 'exact-sigungu' | 'similarity';
