import { Area, Money } from '@apt/shared';

import { isOutlier, OUTLIER_THRESHOLD } from './price-stats';

export interface TradeProps {
  id: string;
  complexId: number | null;
  regionCode: string;
  /** API 원본 단지명 — 매칭 규칙을 개선하면 이 값으로 다시 이어붙인다 */
  rawName: string;
  price: Money;
  area: Area;
  contractedAt: Date;
  floor: number;
  builtYear: number | null;
  /** 해제(취소)된 거래. 통계에서 반드시 빼야 한다 (ToDo.md 7.3) */
  isCanceled: boolean;
}

/**
 * 실거래 한 건 (ToDo.md 3.8).
 * 순수 도메인 모델 — 계산만 하고 부수효과가 없다.
 */
export class Trade {
  constructor(private readonly props: TradeProps) {}

  get id(): string {
    return this.props.id;
  }
  get complexId(): number | null {
    return this.props.complexId;
  }
  get rawName(): string {
    return this.props.rawName;
  }
  get price(): Money {
    return this.props.price;
  }
  get area(): Area {
    return this.props.area;
  }
  get contractedAt(): Date {
    return this.props.contractedAt;
  }
  get floor(): number {
    return this.props.floor;
  }
  get builtYear(): number | null {
    return this.props.builtYear;
  }
  get isCanceled(): boolean {
    return this.props.isCanceled;
  }

  /** 평당가 — 면적이 다른 단지를 견줄 때 쓴다 */
  pricePerPyeong(): Money {
    return Money.fromManwon(this.props.price.toManwon() / this.props.area.toPyeong());
  }

  /** 중위가 대비 ±40% 밖인가 (직거래·증여성 거래 의심) */
  isOutlier(medianPrice: Money, threshold = OUTLIER_THRESHOLD): boolean {
    return isOutlier(this.props.price.toManwon(), medianPrice.toManwon(), threshold);
  }

  /** 통계에 넣어도 되는 거래인가 */
  isUsableForStats(): boolean {
    return !this.props.isCanceled;
  }
}

export interface RentProps {
  id: string;
  complexId: number | null;
  rawName: string;
  deposit: Money;
  /** 0이면 전세 */
  monthly: Money;
  area: Area;
  contractedAt: Date;
  floor: number;
}

/** 전월세 한 건 — 전세가율 계산에 쓴다 */
export class Rent {
  constructor(private readonly props: RentProps) {}

  get complexId(): number | null {
    return this.props.complexId;
  }
  get deposit(): Money {
    return this.props.deposit;
  }
  get monthly(): Money {
    return this.props.monthly;
  }
  get area(): Area {
    return this.props.area;
  }
  get contractedAt(): Date {
    return this.props.contractedAt;
  }

  /** 월세가 없으면 전세 */
  isJeonse(): boolean {
    return this.props.monthly.toManwon() === 0;
  }
}
