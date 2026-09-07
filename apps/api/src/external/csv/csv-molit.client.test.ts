import { describe, expect, it } from 'vitest';

import type { RawRent, RawTrade } from '../domain/raw-types';

import { CsvMolitClient } from './csv-molit.client';

const trade = (sigunguCode: string, iso: string, name = '삼익'): RawTrade => ({
  sigunguCode,
  legalDongName: '수서동',
  apartmentName: name,
  exclusiveSqm: 49.2,
  priceManwon: 212000,
  contractedAt: new Date(iso),
  floor: 8,
  builtYear: 1992,
  isCanceled: false,
  jibun: '708',
});

const rent = (sigunguCode: string, iso: string): RawRent => ({
  sigunguCode,
  legalDongName: '수서동',
  apartmentName: '강남데시앙포레',
  exclusiveSqm: 84.86,
  depositManwon: 90000,
  monthlyManwon: 0,
  contractedAt: new Date(iso),
  floor: 8,
  builtYear: 2014,
  jibun: '795',
});

describe('CsvMolitClient — 읽어 둔 CSV 를 국토부 API 처럼 돌려준다', () => {
  it('시군구와 계약월로 갈라서 준다', async () => {
    const client = new CsvMolitClient(
      [
        trade('11680', '2026-08-07T00:00:00Z', '삼익'),
        trade('11680', '2026-08-01T00:00:00Z', '역삼아이파크'),
        trade('11680', '2026-07-30T00:00:00Z', '지난달'),
        trade('41450', '2026-08-05T00:00:00Z', '다른지역'),
      ],
      [],
    );

    const august = await client.fetchTrades('11680', '202608');
    expect(august.map((t) => t.apartmentName)).toEqual(['삼익', '역삼아이파크']);

    expect(await client.fetchTrades('11680', '202607')).toHaveLength(1);
    expect(await client.fetchTrades('41450', '202608')).toHaveLength(1);
  });

  it('없는 지역·달은 빈 배열 (API 가 0건을 주는 것과 같다)', async () => {
    const client = new CsvMolitClient([trade('11680', '2026-08-07T00:00:00Z')], []);
    expect(await client.fetchTrades('99999', '202608')).toEqual([]);
    expect(await client.fetchTrades('11680', '202001')).toEqual([]);
    expect(await client.fetchRents('11680', '202608')).toEqual([]);
  });

  it('월 경계를 UTC 로 계산한다 (한국시간으로 밀리면 달이 어긋난다)', async () => {
    // 2026-09-01T00:00:00Z 는 한국시간으로는 9월 1일 오전 9시 — 어느 쪽이든 9월이어야 한다
    const client = new CsvMolitClient([trade('11680', '2026-09-01T00:00:00Z')], []);
    expect(await client.fetchTrades('11680', '202609')).toHaveLength(1);
    expect(await client.fetchTrades('11680', '202608')).toHaveLength(0);
  });

  it('한 자리 달을 두 자리로 채운다', async () => {
    const client = new CsvMolitClient([trade('11680', '2026-01-15T00:00:00Z')], []);
    expect(await client.fetchTrades('11680', '202601')).toHaveLength(1);
  });

  it('매매와 전월세를 섞지 않는다', async () => {
    const client = new CsvMolitClient(
      [trade('11680', '2026-08-07T00:00:00Z')],
      [rent('11680', '2026-08-03T00:00:00Z')],
    );
    expect(await client.fetchTrades('11680', '202608')).toHaveLength(1);
    expect(await client.fetchRents('11680', '202608')).toHaveLength(1);
  });

  it('파일에 들어 있던 지역 코드를 알려 준다 (전월세에만 있는 지역도 포함)', () => {
    const client = new CsvMolitClient(
      [trade('11680', '2026-08-07T00:00:00Z')],
      [rent('41450', '2026-08-03T00:00:00Z')],
    );
    expect(client.sigunguCodes()).toEqual(['11680', '41450']);
  });

  it('실제로 데이터가 있는 달 범위만 알려 준다', () => {
    const client = new CsvMolitClient(
      [trade('11680', '2025-03-04T00:00:00Z'), trade('11680', '2026-08-07T00:00:00Z')],
      [rent('11680', '2024-12-31T00:00:00Z')],
    );
    expect(client.monthRange()).toEqual({ from: '202412', to: '202608' });
  });

  it('비어 있으면 달 범위는 null', () => {
    expect(new CsvMolitClient([], []).monthRange()).toBeNull();
    expect(new CsvMolitClient([], []).sigunguCodes()).toEqual([]);
  });

  it('담고 있는 건수를 센다', () => {
    const client = new CsvMolitClient(
      [trade('11680', '2026-08-07T00:00:00Z'), trade('11680', '2026-07-01T00:00:00Z')],
      [rent('11680', '2026-08-03T00:00:00Z')],
    );
    expect(client.counts()).toEqual({ trades: 2, rents: 1 });
  });
});
