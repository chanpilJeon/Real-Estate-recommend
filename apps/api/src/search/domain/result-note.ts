/**
 * "왜 결과가 이것뿐인가"를 한 문장으로 설명한다 (순수 함수).
 *
 * 광교를 예산 10억으로 찾으면 63곳 중 18곳만 남는다. 이유를 말해주지 않으면
 * 사용자는 "광교에 아파트가 18개뿐인가?" 하고 오해하거나, 자기가 아는 대장 단지가
 * 안 보이는 것을 보고 서비스를 믿지 않는다.
 *
 * **적은 결과는 그 자체가 답일 수 있다.** 다만 이유를 함께 말해야 답이 된다.
 */

export interface ResultNoteInput {
  /** 지역·연식·세대수 조건까지 통과한 단지 수 */
  totalCandidates: number;
  /** 그중 화면에 남은 수 */
  shown: number;
  /** 예산을 넘겨 빠진 수 */
  overBudget: number;
  /** 예산 바로 위에 있는 가장 싼 단지 */
  nearestOverBudget: { name: string; medianPriceManwon: number } | null;
  /** 사용자가 넣은 예산 상한 (만원). 없으면 null */
  budgetMaxManwon: number | null;
}

/** 12,345만원 → "1억 2,345만원" */
export function toKoreanMoney(manwon: number): string {
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만원`;
  if (rest === 0) return `${eok}억원`;
  return `${eok}억 ${rest.toLocaleString('ko-KR')}만원`;
}

/** 설명할 것이 없으면 null — 굳이 문장을 만들어 화면을 채우지 않는다 */
export function buildResultNote(input: ResultNoteInput): string | null {
  if (input.overBudget === 0) return null;

  const parts = [
    `조건에 맞는 단지 ${input.totalCandidates.toLocaleString('ko-KR')}곳 중 ${input.shown.toLocaleString('ko-KR')}곳을 보고 있습니다.`,
    `${input.overBudget.toLocaleString('ko-KR')}곳은 예산을 넘습니다.`,
  ];

  if (input.nearestOverBudget !== null) {
    parts.push(
      `가장 가까운 것은 ${input.nearestOverBudget.name} ${toKoreanMoney(input.nearestOverBudget.medianPriceManwon)}입니다.`,
    );
  }

  return parts.join(' ');
}
