import { Injectable } from '@nestjs/common';

import { AppConfig, InjectLogger, type ILogger } from '../../core';
import { ApiQuotaTracker } from '../../observability';
import { parseRentXml, parseTradeXml, type MolitPage } from '../domain/molit-parser';
import type { RawRent, RawTrade } from '../domain/raw-types';
import type { IMolitClient } from '../ports';

import { RetryingFetch } from './retrying-fetch';

const BASE = 'https://apis.data.go.kr/1613000';
// 2026-09 실제 키로 확인: 예전 'Dev' 접미사 경로는 없어졌다 (등록되지 않은 서비스키로 응답)
const TRADE_PATH = `${BASE}/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`;
const RENT_PATH = `${BASE}/RTMSDataSvcAptRent/getRTMSDataSvcAptRent`;

const ROWS_PER_PAGE = 1000;
/** 한 달치가 이보다 많은 지역은 없다고 보고 무한루프를 막는다 */
const MAX_PAGES = 20;
const CTX = 'molit-client';

/**
 * 국토교통부 실거래가 API 클라이언트 (ToDo.md 3.6).
 *
 * 2026-09-08 실제 키로 매매·전월세 응답을 확인했다 (docs/API-VERIFICATION.md).
 * 파서는 신·구 필드명을 모두 받아들이도록 방어적으로 둔다 — 국토부가 필드명을 바꾼 이력이 있다.
 */
@Injectable()
export class MolitHttpClient implements IMolitClient {
  private readonly http = new RetryingFetch();

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ApiQuotaTracker,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  fetchTrades(sigunguCode: string, yearMonth: string): Promise<RawTrade[]> {
    return this.fetchAllPages(TRADE_PATH, sigunguCode, yearMonth, parseTradeXml);
  }

  fetchRents(sigunguCode: string, yearMonth: string): Promise<RawRent[]> {
    return this.fetchAllPages(RENT_PATH, sigunguCode, yearMonth, parseRentXml);
  }

  /** 결과가 여러 장이면 끝까지 받아온다 */
  private async fetchAllPages<T>(
    path: string,
    sigunguCode: string,
    yearMonth: string,
    parse: (xml: string, sigunguCode: string) => MolitPage<T>,
  ): Promise<T[]> {
    const collected: T[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const xml = await this.http.getText(this.buildUrl(path, sigunguCode, yearMonth, page));
      // 호출 한 번마다 사용량을 센다 — 한도에 닿기 전에 대시보드에서 보이도록
      await this.quota.increment('molit', 1);

      const result = parse(xml, sigunguCode);
      collected.push(...result.items);

      if (result.items.length === 0 || collected.length >= result.totalCount) break;

      if (page === MAX_PAGES) {
        this.logger.warn(CTX, `페이지 상한(${MAX_PAGES})에 도달했습니다`, { sigunguCode, yearMonth });
      }
    }

    return collected;
  }

  private buildUrl(path: string, sigunguCode: string, yearMonth: string, page: number): string {
    const params = new URLSearchParams({
      // 공공데이터포털 키는 이미 URL 인코딩된 형태로 발급되기도 한다.
      // URLSearchParams 가 다시 인코딩하면 깨지므로 디코딩 후 넣는다.
      serviceKey: safeDecode(this.config.molitApiKey),
      LAWD_CD: sigunguCode,
      DEAL_YMD: yearMonth,
      pageNo: String(page),
      numOfRows: String(ROWS_PER_PAGE),
    });
    return `${path}?${params.toString()}`;
  }
}

function safeDecode(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}
