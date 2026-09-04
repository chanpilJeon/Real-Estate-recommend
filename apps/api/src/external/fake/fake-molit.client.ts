import type { RawRent, RawTrade } from '../domain/raw-types';
import type { IMolitClient } from '../ports';

import { SAMPLE_COMPLEXES, type SampleComplex } from './sample-data';

/**
 * 국토부 실거래가 API 의 가짜 구현 (ToDo.md 3.6, 7.2).
 *
 * `DEMO_MODE=true` 일 때 주입된다. **API 키 승인 전에도 전체 기능을 확인**하기 위한 것이다.
 *
 * 같은 (시군구, 연월) 요청에는 **항상 같은 결과**를 준다 —
 * 매번 달라지면 "수집이 제대로 됐는지" 판단할 수 없기 때문이다.
 * 그래서 난수 대신 입력값으로 만든 씨앗을 쓴다.
 */
/**
 * ※ `@Injectable()` 을 붙이지 않는다. 생성자에 함수 인자(now)를 받는데
 *   NestJS 는 함수 타입을 주입할 수 없다. 모듈에서 useFactory 로 만든다.
 */
export class FakeMolitClient implements IMolitClient {
  constructor(private readonly now: () => Date = () => new Date()) {}

  fetchTrades(sigunguCode: string, yearMonth: string): Promise<RawTrade[]> {
    const trades: RawTrade[] = [];

    for (const complex of complexesIn(sigunguCode)) {
      for (const [areaIndex, area] of complex.areas.entries()) {
        const count = 1 + seed(`${complex.kaptCode}${yearMonth}${areaIndex}`) % 3; // 면적별 1~3건
        for (let i = 0; i < count; i += 1) {
          const key = `${complex.kaptCode}${yearMonth}${areaIndex}${i}`;
          const day = 1 + (seed(key) % 28);
          trades.push({
            sigunguCode,
            legalDongName: complex.dong,
            apartmentName: complex.name,
            exclusiveSqm: area,
            priceManwon: priceFor(complex, area, key),
            contractedAt: this.dateOf(yearMonth, day),
            floor: 1 + (seed(`${key}floor`) % 20),
            builtYear: complex.builtYear,
            // 20건에 1건꼴로 해제 거래를 섞는다 — 걸러내는 로직을 실제로 시험하려면 필요하다
            isCanceled: seed(`${key}cancel`) % 20 === 0,
            jibun: complex.jibun,
          });
        }
      }
    }

    return Promise.resolve(trades.sort((a, b) => a.contractedAt.getTime() - b.contractedAt.getTime()));
  }

  fetchRents(sigunguCode: string, yearMonth: string): Promise<RawRent[]> {
    const rents: RawRent[] = [];

    for (const complex of complexesIn(sigunguCode)) {
      for (const [areaIndex, area] of complex.areas.entries()) {
        const key = `${complex.kaptCode}${yearMonth}${areaIndex}rent`;
        const salePrice = priceFor(complex, area, key);
        // 전세가율 55~75% 범위로 만든다 (실제 시장과 비슷한 대역)
        const ratio = 0.55 + (seed(`${key}ratio`) % 21) / 100;
        const isJeonse = seed(`${key}type`) % 4 !== 0; // 4건 중 3건은 전세

        rents.push({
          sigunguCode,
          legalDongName: complex.dong,
          apartmentName: complex.name,
          exclusiveSqm: area,
          depositManwon: isJeonse
            ? Math.round((salePrice * ratio) / 100) * 100
            : Math.round((salePrice * 0.1) / 100) * 100,
          monthlyManwon: isJeonse ? 0 : 50 + (seed(`${key}monthly`) % 150),
          contractedAt: this.dateOf(yearMonth, 1 + (seed(key) % 28)),
          floor: 1 + (seed(`${key}floor`) % 20),
          builtYear: complex.builtYear,
          jibun: complex.jibun,
        });
      }
    }

    return Promise.resolve(rents);
  }

  /**
   * 계약일을 만든다.
   *
   * 이번 달을 요청하면 오늘보다 뒤인 날짜가 나올 수 있는데, 그러면
   * "데이터 신선도"(오늘 − 최신 계약일)가 음수가 되어 대시보드가 고장 난 것처럼 보인다.
   * 실제 실거래도 미래 날짜로 신고되지 않으므로 오늘까지로 자른다.
   */
  private dateOf(yearMonth: string, day: number): Date {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    const date = new Date(Date.UTC(year, month - 1, day));

    const today = this.now();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    return date > todayUtc ? todayUtc : date;
  }
}

const complexesIn = (sigunguCode: string): SampleComplex[] =>
  SAMPLE_COMPLEXES.filter((c) => c.sigunguCode === sigunguCode);

/** 문자열 → 0 이상의 정수. 같은 입력이면 항상 같은 값 (재현 가능한 가짜 데이터) */
function seed(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 2_147_483_647;
  }
  return hash;
}

/** 면적에 비례한 가격 + ±5% 흔들림. 100만원 단위로 반올림한다 */
function priceFor(complex: SampleComplex, area: number, key: string): number {
  const base = complex.basePriceManwon * (area / 84);
  const wobble = 0.95 + (seed(`${key}price`) % 101) / 1000;
  return Math.round((base * wobble) / 100) * 100;
}


