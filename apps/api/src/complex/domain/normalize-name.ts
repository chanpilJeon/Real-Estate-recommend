/**
 * 단지명 정규화 (순수 함수).
 *
 * 같은 단지인데 API 마다 표기가 다르다 — `"래미안OO 1차"` vs `"래미안OO(1차)"`.
 * 이 함수를 거친 값을 `complexes.name_normalized` 에 저장해 두고,
 * 매칭(Step 5)과 중복 방지에 쓴다.
 *
 * ⚠ 이 함수는 계층 L2(complex)에 둔다. 매칭 모듈(L3)이 이것을 가져다 쓴다 —
 *   반대 방향이면 의존성 규칙 위반이다 (ToDo.md 2.3).
 *
 * **일부러 하지 않는 것**: 브랜드명 축약("래미안"→"래"), 동/단지번호 제거.
 * 과하게 지우면 서로 다른 단지가 같은 이름이 되어 잘못 합쳐진다.
 */

/** 괄호·대괄호는 지운다 — "(1차)" 와 " 1차" 를 같게 만들기 위함 */
const BRACKETS = /[()[\]{}<>]/g;
/** 이름 구분에 의미가 없는 기호 */
const PUNCTUATION = /[·・.,_\-–—/\\'"`~!@#$%^&*+=|:;?]/g;
/** 뒤에 붙는 "아파트"는 있으나 없으나 같은 단지다 */
const TRAILING_APT = /아파트$/;

export function normalizeComplexName(name: string): string {
  if (typeof name !== 'string') return '';

  return name
    .normalize('NFC') // 한글 자모 분리(NFD) 입력을 합쳐 준다 — macOS 파일·일부 API 대비
    .replace(BRACKETS, '')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(TRAILING_APT, '')
    .trim();
}
