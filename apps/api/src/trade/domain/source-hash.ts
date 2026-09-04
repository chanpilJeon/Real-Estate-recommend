import { createHash } from 'node:crypto';

/**
 * 실거래 한 건의 지문 (ToDo.md 4.3).
 *
 * `trades.source_hash` 에 UNIQUE 로 걸어 **재수집 시 중복 적재를 DB 레벨에서 차단**한다.
 * 수집 배치는 매달 같은 구간을 다시 훑기 때문에, 애플리케이션 로직에만 기대면
 * 언젠가 중복이 새어 들어온다.
 *
 * ⚠ 여기에 들어가는 항목을 바꾸면 **기존 데이터가 전부 다른 지문을 갖게 되어**
 *   재수집 시 통째로 중복된다. 바꿔야 한다면 마이그레이션으로 재계산할 것.
 */
export interface TradeIdentity {
  regionCode: string;
  /** API 원본 단지명 (정규화 전) */
  rawName: string;
  exclusiveSqm: number;
  priceManwon: number;
  /** 계약일 */
  contractedAt: Date;
  floor: number;
}

export interface RentIdentity {
  regionCode: string;
  rawName: string;
  exclusiveSqm: number;
  depositManwon: number;
  monthlyManwon: number;
  contractedAt: Date;
  floor: number;
}

const ymd = (date: Date): string => date.toISOString().slice(0, 10);

/** 면적은 소수점 둘째 자리까지만 본다 — API 가 "84.97" / "84.970" 처럼 흔들려도 같은 지문이 되도록 */
const sqm = (value: number): string => value.toFixed(2);

export function buildTradeSourceHash(identity: TradeIdentity): string {
  return sha256(
    [
      identity.regionCode,
      identity.rawName.trim(),
      sqm(identity.exclusiveSqm),
      String(identity.priceManwon),
      ymd(identity.contractedAt),
      String(identity.floor),
    ].join('|'),
  );
}

export function buildRentSourceHash(identity: RentIdentity): string {
  return sha256(
    [
      identity.regionCode,
      identity.rawName.trim(),
      sqm(identity.exclusiveSqm),
      String(identity.depositManwon),
      String(identity.monthlyManwon),
      ymd(identity.contractedAt),
      String(identity.floor),
    ].join('|'),
  );
}

/** trades.source_hash 는 CHAR(64) — sha256 hex 길이와 같다 */
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
