import type { Coordinate, RegionCode } from '@apt/shared';

/** 대단지 기준 세대수 (ToDo.md 3.7) */
export const LARGE_SCALE_HOUSEHOLDS = 500;

/**
 * 단지 품질 점수의 구성 요소와 가중치.
 *
 * 상수로 빼둔 이유: 추천 엔진(Step 7)이 이 값을 튜닝 대상으로 삼는다.
 * 숫자를 코드 안에 흩뿌려 두면 어디를 고쳐야 할지 알 수 없다.
 */
export const QUALITY_WEIGHTS = { scale: 0.35, age: 0.4, parking: 0.25 } as const;

/** 이 세대수를 넘으면 규모 점수 만점 */
const FULL_SCORE_HOUSEHOLDS = 1_500;
/** 이 연식을 넘으면 연식 점수 0점 */
const OLD_AGE_YEARS = 30;
/** 세대당 이 대수를 넘으면 주차 점수 만점 */
const ENOUGH_PARKING_PER_HOUSEHOLD = 1.0;
/** 자료가 없을 때 쓰는 중립값 — 모른다고 0점을 주면 부당하게 불리해진다 */
const NEUTRAL = 0.5;

export interface ComplexProps {
  id: number;
  kaptCode: string | null;
  name: string;
  nameNormalized: string;
  regionCode: RegionCode;
  address: string;
  /** 지오코딩에 실패했을 수 있다 */
  coordinate: Coordinate | null;
  households: number;
  buildingCount: number;
  /** 사용승인일. 공공 데이터에 빠져 있는 단지가 있다 */
  approvalDate: Date | null;
  builtYear: number | null;
  parkingCount: number;
  heatingType: string | null;
  /** 배치가 미리 계산해 둔 최근접 거리 (m) */
  nearestSubwayM: number | null;
  nearestSchoolM: number | null;
}

/**
 * 아파트 단지 도메인 모델 (ToDo.md 3.7).
 *
 * 순수 TypeScript — NestJS·Prisma 를 모른다.
 *
 * **판단 로직(`qualityScore` 등)을 서비스가 아니라 여기에 둔다.**
 * 추천 모듈이 같은 규칙을 복제하지 않게 하려는 것이 목적이다 (ToDo.md 3.7 캡슐화).
 */
export class Complex {
  constructor(private readonly props: ComplexProps) {}

  get id(): number {
    return this.props.id;
  }
  get kaptCode(): string | null {
    return this.props.kaptCode;
  }
  get name(): string {
    return this.props.name;
  }
  get nameNormalized(): string {
    return this.props.nameNormalized;
  }
  get regionCode(): RegionCode {
    return this.props.regionCode;
  }
  get address(): string {
    return this.props.address;
  }
  get coordinate(): Coordinate | null {
    return this.props.coordinate;
  }
  get households(): number {
    return this.props.households;
  }
  get buildingCount(): number {
    return this.props.buildingCount;
  }
  get approvalDate(): Date | null {
    return this.props.approvalDate;
  }
  get builtYear(): number | null {
    return this.props.builtYear;
  }
  get parkingCount(): number {
    return this.props.parkingCount;
  }
  get heatingType(): string | null {
    return this.props.heatingType;
  }
  get nearestSubwayM(): number | null {
    return this.props.nearestSubwayM;
  }
  get nearestSchoolM(): number | null {
    return this.props.nearestSchoolM;
  }

  /**
   * 연식 (년). 사용승인일이 있으면 그것을, 없으면 건축년도를 쓴다.
   * 둘 다 없으면 null — 0 으로 채우면 신축으로 오인된다.
   */
  ageYears(asOf: Date): number | null {
    const { approvalDate, builtYear } = this.props;

    if (approvalDate !== null) {
      // 일수를 365.25 로 나누면 "정확히 30년"이 29년으로 떨어지는 오차가 난다.
      // 생일 세듯 달력 기준으로 센다.
      const years = asOf.getUTCFullYear() - approvalDate.getUTCFullYear();
      const beforeAnniversary =
        asOf.getUTCMonth() < approvalDate.getUTCMonth() ||
        (asOf.getUTCMonth() === approvalDate.getUTCMonth() &&
          asOf.getUTCDate() < approvalDate.getUTCDate());
      return Math.max(0, years - (beforeAnniversary ? 1 : 0));
    }
    if (builtYear !== null) {
      return Math.max(0, asOf.getUTCFullYear() - builtYear);
    }
    return null;
  }

  /** 대단지인가 — 거래가 활발하고 관리비가 낮은 편이라 선호된다 */
  isLargeScale(): boolean {
    return this.props.households >= LARGE_SCALE_HOUSEHOLDS;
  }

  /** 세대당 주차 대수. 세대수를 모르면 null */
  parkingPerHousehold(): number | null {
    if (this.props.households <= 0 || this.props.parkingCount <= 0) return null;
    return this.props.parkingCount / this.props.households;
  }

  /**
   * 단지 품질 점수 0~1 (순수 계산).
   *
   * 세대수·연식·주차 세 가지를 각각 0~1 로 정규화한 뒤 가중 평균한다.
   * **연식은 새 것일수록 높다** — 재건축 기대는 여기가 아니라
   * 추천 프리셋에서 따로 다룬다 (ToDo.md 5.2).
   *
   * 자료가 없는 항목은 0점이 아니라 중립값(0.5)을 준다.
   * 정보가 빠졌다는 이유로 부당하게 밀려나면 안 되기 때문이다.
   */
  qualityScore(asOf: Date = new Date()): number {
    const age = this.ageYears(asOf);

    const scaleScore =
      this.props.households <= 0 ? NEUTRAL : clamp01(this.props.households / FULL_SCORE_HOUSEHOLDS);
    const ageScore = age === null ? NEUTRAL : clamp01(1 - age / OLD_AGE_YEARS);
    const parking = this.parkingPerHousehold();
    const parkingScore =
      parking === null ? NEUTRAL : clamp01(parking / ENOUGH_PARKING_PER_HOUSEHOLD);

    return round3(
      scaleScore * QUALITY_WEIGHTS.scale +
        ageScore * QUALITY_WEIGHTS.age +
        parkingScore * QUALITY_WEIGHTS.parking,
    );
  }

  /** 점수의 근거를 사람이 읽는 문장으로 (추천 근거 표시에 쓴다) */
  qualityReasons(asOf: Date = new Date()): string[] {
    const reasons: string[] = [];
    const age = this.ageYears(asOf);
    const parking = this.parkingPerHousehold();

    if (this.isLargeScale()) reasons.push(`${this.props.households.toLocaleString()}세대 대단지`);
    if (age !== null && age <= 10) reasons.push(`준공 ${age}년차 신축급`);
    if (parking !== null && parking >= ENOUGH_PARKING_PER_HOUSEHOLD) {
      reasons.push(`세대당 주차 ${parking.toFixed(1)}대`);
    }
    return reasons;
  }
}

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
