import type { RawRent, RawTrade } from '../domain/raw-types';
import type { IMolitClient } from '../ports';

/**
 * 이미 읽어 둔 CSV 내용을 국토부 API 인 척 돌려주는 어댑터.
 *
 * 왜 이렇게 하나: 수집 오케스트레이터는 `IMolitClient` 만 안다. 여기에 맞춰 두면
 * 단지 매칭·중복 차단(sourceHash)·매칭 실패 기록·시세 캐시 무효화를
 * **API 로 받을 때와 똑같이** 거치게 된다. CSV 전용 적재 경로를 따로 만들면
 * 그 과정을 전부 다시 구현해야 하고, 두 경로의 동작이 갈라진다.
 *
 * 네트워크를 타지 않으므로 호출 한도도, 실패도 없다.
 */
export class CsvMolitClient implements IMolitClient {
  private readonly trades = new Map<string, RawTrade[]>();
  private readonly rents = new Map<string, RawRent[]>();

  constructor(trades: RawTrade[], rents: RawRent[]) {
    for (const trade of trades) push(this.trades, trade.sigunguCode, trade.contractedAt, trade);
    for (const rent of rents) push(this.rents, rent.sigunguCode, rent.contractedAt, rent);
  }

  fetchTrades(sigunguCode: string, yearMonth: string): Promise<RawTrade[]> {
    return Promise.resolve(this.trades.get(`${sigunguCode}:${yearMonth}`) ?? []);
  }

  fetchRents(sigunguCode: string, yearMonth: string): Promise<RawRent[]> {
    return Promise.resolve(this.rents.get(`${sigunguCode}:${yearMonth}`) ?? []);
  }

  /** 파일에 실제로 들어 있던 시군구 코드 — 이 지역만 수집하면 된다 */
  sigunguCodes(): string[] {
    const codes = new Set<string>();
    for (const key of [...this.trades.keys(), ...this.rents.keys()]) {
      codes.add(key.slice(0, key.indexOf(':')));
    }
    return [...codes].sort();
  }

  /**
   * 파일에 들어 있던 가장 이른/늦은 계약월 ('YYYYMM').
   * 없는 달까지 훑으면 시간만 버리므로 실제 범위만 돌린다.
   */
  monthRange(): { from: string; to: string } | null {
    const months = [...this.trades.keys(), ...this.rents.keys()].map((key) =>
      key.slice(key.indexOf(':') + 1),
    );
    if (months.length === 0) return null;
    months.sort();
    return { from: months[0]!, to: months[months.length - 1]! };
  }

  /** 담고 있는 건수 (보고용) */
  counts(): { trades: number; rents: number } {
    const sum = (map: Map<string, unknown[]>): number =>
      [...map.values()].reduce((total, list) => total + list.length, 0);
    return { trades: sum(this.trades), rents: sum(this.rents) };
  }
}

/** 계약일에서 'YYYYMM' 을 만들어 (시군구, 월) 로 묶는다 */
function push<T>(index: Map<string, T[]>, sigunguCode: string, contractedAt: Date, item: T): void {
  const yearMonth =
    String(contractedAt.getUTCFullYear()) +
    String(contractedAt.getUTCMonth() + 1).padStart(2, '0');
  const key = `${sigunguCode}:${yearMonth}`;

  const bucket = index.get(key);
  if (bucket === undefined) index.set(key, [item]);
  else bucket.push(item);
}
