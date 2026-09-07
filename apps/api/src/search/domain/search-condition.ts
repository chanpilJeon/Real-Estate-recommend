import { Area, InvalidValueError, Money, Range, RegionCode, type SearchConditionDto } from '@apt/shared';

/** 한 번에 돌려줄 최대 건수 — 지도에 찍을 마커 수와도 직결된다 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** 아파트 실거래가 공개 시작 연도. 이보다 이른 연식 조건은 의미가 없다 */
const MIN_BUILT_YEAR = 1950;

/**
 * 검색 조건 값 객체 (ToDo.md 3.12).
 *
 * **컨트롤러는 쿼리스트링을 이 클래스에 넘길 뿐, 필터 규칙을 알지 못한다.**
 * 잘못된 조합(하한>상한 등)은 여기서 걸러져 서비스까지 내려가지 않는다.
 */
export class SearchCondition {
  private constructor(
    readonly regionCodes: RegionCode[],
    readonly priceRange: Range<Money>,
    readonly areaRange: Range<Area>,
    readonly minBuiltYear: number | null,
    readonly minHouseholds: number | null,
    readonly page: number,
    readonly pageSize: number,
  ) {}

  static from(dto: SearchConditionDto & { page?: number; pageSize?: number }): SearchCondition {
    const regionCodes = parseRegionCodes(dto.regionCode);
    if (regionCodes.length === 0) {
      throw new InvalidValueError('지역', '검색할 지역을 하나 이상 지정해야 합니다');
    }

    const priceRange = Range.of(
      optionalMoney(dto.priceMin, '예산 하한'),
      optionalMoney(dto.priceMax, '예산 상한'),
      '예산',
    );
    const areaRange = Range.of(
      optionalArea(dto.areaMin, '면적 하한'),
      optionalArea(dto.areaMax, '면적 상한'),
      '면적',
    );

    return new SearchCondition(
      regionCodes,
      priceRange,
      areaRange,
      parseBuiltYear(dto.builtAfter),
      parseMinHouseholds(dto.minHouseholds),
      Math.max(1, Math.floor(dto.page ?? 1)),
      Math.min(Math.max(1, Math.floor(dto.pageSize ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE),
    );
  }

  /**
   * 시군구 단위로 지정된 코드들 (뒤 5자리가 00000).
   * 이 경우 그 아래 모든 동을 훑어야 한다 — "강남구"를 골랐는데
   * 강남구라는 이름의 동만 찾으면 결과가 0건이 된다.
   */
  sigunguPrefixes(): string[] {
    return this.regionCodes
      .filter((code) => !code.isDongLevel())
      .map((code) => code.toSigunguCode());
  }

  /** 읍면동 단위로 지정된 코드들 */
  dongCodes(): string[] {
    return this.regionCodes.filter((code) => code.isDongLevel()).map((code) => code.toString());
  }

  /** 조건이 같으면 같은 문자열 — 캐시 키로 쓴다 */
  toCacheKey(): string {
    return [
      this.regionCodes.map((c) => c.toString()).sort().join(','),
      this.priceRange.min?.toManwon() ?? '',
      this.priceRange.max?.toManwon() ?? '',
      this.areaRange.min?.toSqm() ?? '',
      this.areaRange.max?.toSqm() ?? '',
      this.minBuiltYear ?? '',
      this.minHouseholds ?? '',
      this.page,
      this.pageSize,
    ].join('|');
  }

  /** search_events 에 남길 조건 요약 */
  toLogPayload(): Record<string, unknown> {
    return {
      regionCodes: this.regionCodes.map((c) => c.toString()),
      priceMin: this.priceRange.min?.toManwon() ?? null,
      priceMax: this.priceRange.max?.toManwon() ?? null,
      areaMin: this.areaRange.min?.toSqm() ?? null,
      areaMax: this.areaRange.max?.toSqm() ?? null,
      builtAfter: this.minBuiltYear,
      minHouseholds: this.minHouseholds,
    };
  }
}

/** 쉼표로 여러 지역을 받을 수 있다 (생활권 별칭이 여러 동으로 풀리는 경우) */
function parseRegionCodes(raw: string): RegionCode[] {
  if (typeof raw !== 'string') return [];
  const unique = [...new Set(raw.split(',').map((c) => c.trim()).filter((c) => c !== ''))];
  return unique.map((code) => RegionCode.parse(code));
}

function optionalMoney(value: number | undefined, label: string): Money | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) throw new InvalidValueError(label, `숫자여야 합니다 (받은 값: ${value})`);
  return Money.fromManwon(value);
}

function optionalArea(value: number | undefined, label: string): Area | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) throw new InvalidValueError(label, `숫자여야 합니다 (받은 값: ${value})`);
  return Area.fromSqm(value);
}

function parseBuiltYear(value: number | undefined): number | null {
  if (value === undefined || value === null) return null;

  const year = Math.floor(value);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < MIN_BUILT_YEAR || year > thisYear + 5) {
    throw new InvalidValueError('사용승인 연도', `${MIN_BUILT_YEAR}~${thisYear + 5} 사이여야 합니다 (받은 값: ${value})`);
  }
  return year;
}

function parseMinHouseholds(value: number | undefined): number | null {
  if (value === undefined || value === null) return null;

  const households = Math.floor(value);
  if (!Number.isInteger(households) || households < 0) {
    throw new InvalidValueError('최소 세대수', `0 이상이어야 합니다 (받은 값: ${value})`);
  }
  return households === 0 ? null : households;
}
