import { Coordinate } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { CATEGORY_SCHOOL, CATEGORY_SUBWAY } from '../ports';

import { FakeComplexInfoClient } from './fake-complex-info.client';
import { FakeGeocodeClient } from './fake-geocode.client';
import { FakeMolitClient } from './fake-molit.client';
import { SAMPLE_COMPLEXES } from './sample-data';

const 강남구 = '11680';
const 하남시 = '41450';

describe('데모 모드 가짜 클라이언트', () => {
  describe('FakeMolitClient — 실거래', () => {
    const client = new FakeMolitClient();

    it('같은 요청은 항상 같은 결과를 준다 (수집 검증이 가능하려면 필수)', async () => {
      const a = await client.fetchTrades(강남구, '202608');
      const b = await client.fetchTrades(강남구, '202608');
      expect(a).toEqual(b);
    });

    it('달이 다르면 다른 결과를 준다', async () => {
      const aug = await client.fetchTrades(강남구, '202608');
      const jul = await client.fetchTrades(강남구, '202607');
      expect(aug).not.toEqual(jul);
    });

    it('요청한 시군구의 단지만 나온다', async () => {
      const trades = await client.fetchTrades(하남시, '202608');
      const names = new Set(trades.map((t) => t.apartmentName));
      const 하남단지 = SAMPLE_COMPLEXES.filter((c) => c.sigunguCode === 하남시).map((c) => c.name);

      expect(trades.length).toBeGreaterThan(0);
      expect([...names].every((n) => 하남단지.includes(n))).toBe(true);
    });

    it('없는 지역은 빈 배열 (오류가 아니다)', async () => {
      expect(await client.fetchTrades('99999', '202608')).toEqual([]);
    });

    it('오늘보다 미래인 계약일을 만들지 않는다 (신선도 지표가 음수가 되면 안 된다)', async () => {
      const today = new Date('2026-09-04T00:00:00Z');
      const clamped = new FakeMolitClient(() => today);
      const trades = await clamped.fetchTrades(강남구, '202609'); // 이번 달

      expect(trades.length).toBeGreaterThan(0);
      for (const trade of trades) {
        expect(trade.contractedAt.getTime()).toBeLessThanOrEqual(today.getTime());
      }
    });

    it('지난 달 데이터는 그대로 그 달 안에 있다', async () => {
      const clamped = new FakeMolitClient(() => new Date('2026-09-04T00:00:00Z'));
      for (const trade of await clamped.fetchTrades(강남구, '202607')) {
        expect(trade.contractedAt.getUTCMonth()).toBe(6);
      }
    });

    it('계약일이 요청한 달 안에 있다', async () => {
      for (const trade of await client.fetchTrades(강남구, '202608')) {
        expect(trade.contractedAt.getUTCFullYear()).toBe(2026);
        expect(trade.contractedAt.getUTCMonth()).toBe(7); // 0-based
      }
    });

    it('계약일 순으로 정렬해 준다', async () => {
      const trades = await client.fetchTrades(강남구, '202608');
      const times = trades.map((t) => t.contractedAt.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('해제된 거래가 섞여 있다 (걸러내는 로직을 시험할 수 있어야 한다)', async () => {
      const months = ['202601', '202602', '202603', '202604', '202605', '202606'];
      const all = (await Promise.all(months.map((m) => client.fetchTrades(강남구, m)))).flat();
      expect(all.some((t) => t.isCanceled)).toBe(true);
    });

    it('면적이 클수록 대체로 비싸다', async () => {
      const trades = await client.fetchTrades(강남구, '202608');
      const 역삼 = trades.filter((t) => t.apartmentName === '데모래미안역삼');
      const small = 역삼.filter((t) => t.exclusiveSqm === 59.94)[0];
      const large = 역삼.filter((t) => t.exclusiveSqm === 114.87)[0];

      expect(large!.priceManwon).toBeGreaterThan(small!.priceManwon);
    });
  });

  describe('FakeMolitClient — 전월세', () => {
    const client = new FakeMolitClient();

    it('전세(월세 0)와 월세가 모두 나온다', async () => {
      const months = ['202601', '202602', '202603', '202604'];
      const all = (await Promise.all(months.map((m) => client.fetchRents(강남구, m)))).flat();

      expect(all.some((r) => r.monthlyManwon === 0)).toBe(true);
      expect(all.some((r) => r.monthlyManwon > 0)).toBe(true);
    });

    it('전세 보증금이 매매가보다 낮다 (전세가율 계산이 말이 되게)', async () => {
      const [rents, trades] = await Promise.all([
        client.fetchRents(강남구, '202608'),
        client.fetchTrades(강남구, '202608'),
      ]);
      const jeonse = rents.find((r) => r.monthlyManwon === 0 && r.apartmentName === '데모래미안역삼');
      const sale = trades.find(
        (t) => t.apartmentName === '데모래미안역삼' && t.exclusiveSqm === jeonse!.exclusiveSqm,
      );

      expect(jeonse!.depositManwon).toBeLessThan(sale!.priceManwon);
    });
  });

  describe('FakeComplexInfoClient — 단지 정보', () => {
    const client = new FakeComplexInfoClient();

    it('시군구별 단지 목록을 준다', async () => {
      expect((await client.fetchComplexList(강남구)).length).toBeGreaterThan(0);
      expect(await client.fetchComplexList('99999')).toEqual([]);
    });

    it('상세 정보에 세대수·주차대수·사용승인일이 있다', async () => {
      const detail = await client.fetchComplexDetail('DEMO-A0001');
      expect(detail).toMatchObject({ households: 1284, parkingCount: 1650 });
      expect(detail?.approvalDate?.getUTCFullYear()).toBe(2005);
    });

    it('없는 코드는 null', async () => {
      expect(await client.fetchComplexDetail('없는코드')).toBeNull();
    });
  });

  describe('FakeGeocodeClient — 좌표·주변시설', () => {
    const client = new FakeGeocodeClient();

    it('샘플 단지 주소를 좌표로 바꾼다', async () => {
      const coordinate = await client.addressToCoordinate('서울특별시 강남구 역삼동 736-1');
      expect(coordinate?.lat).toBeCloseTo(37.4998, 3);
    });

    it('모르는 주소는 null', async () => {
      expect(await client.addressToCoordinate('존재하지않는동 1-1')).toBeNull();
    });

    it('반경 안의 지하철역만 준다', async () => {
      const 역삼단지 = new Coordinate(37.4998, 127.0374);
      const near = await client.searchPlaces(CATEGORY_SUBWAY, 역삼단지, 1000);
      const far = await client.searchPlaces(CATEGORY_SUBWAY, 역삼단지, 100);

      expect(near.length).toBeGreaterThan(0);
      expect(far.length).toBeLessThan(near.length);
    });

    it('가까운 순으로 정렬해 준다 (최근접 계산에 바로 쓴다)', async () => {
      const 역삼단지 = new Coordinate(37.4998, 127.0374);
      const places = await client.searchPlaces(CATEGORY_SUBWAY, 역삼단지, 100_000);
      const distances = places.map((p) => 역삼단지.distanceTo(p.coordinate));

      expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    });

    it('학교와 지하철역을 구분해 준다', async () => {
      const center = new Coordinate(37.4998, 127.0374);
      const schools = await client.searchPlaces(CATEGORY_SCHOOL, center, 100_000);
      expect(schools.every((p) => p.categoryCode === CATEGORY_SCHOOL)).toBe(true);
    });
  });
});
