import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

import { AppConfig } from '../../core';
import { ApiQuotaTracker } from '../../observability';
import type { RawComplexDetail, RawComplexInfo } from '../domain/raw-types';
import type { IComplexInfoClient } from '../ports';

import { RetryingFetch } from './retrying-fetch';

const BASE = 'https://apis.data.go.kr/1613000';
const LIST_PATH = `${BASE}/AptListService3/getSigunguAptList3`;
const DETAIL_PATH = `${BASE}/AptBasisInfoServiceV3/getAphusBassInfoV3`;

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });

/**
 * 공동주택 단지정보(K-apt) 클라이언트.
 *
 * ⚠ 실제 키로 검증하지 못했다 — `docs/API-VERIFICATION.md` 참조.
 */
@Injectable()
export class ComplexInfoHttpClient implements IComplexInfoClient {
  private readonly http = new RetryingFetch();

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ApiQuotaTracker,
  ) {}

  async fetchComplexList(sigunguCode: string): Promise<RawComplexInfo[]> {
    const xml = await this.http.getText(
      `${LIST_PATH}?${new URLSearchParams({
        serviceKey: safeDecode(this.config.molitApiKey),
        sigunguCode,
        pageNo: '1',
        numOfRows: '1000',
      }).toString()}`,
    );
    await this.quota.increment('molit', 1);

    return toArray(dig(parser.parse(xml), 'response', 'body', 'items', 'item')).map((node) => ({
      kaptCode: str(node, 'kaptCode'),
      name: str(node, 'kaptName'),
      sido: str(node, 'as1'),
      sigungu: str(node, 'as2'),
      dong: str(node, 'as3'),
    }));
  }

  async fetchComplexDetail(kaptCode: string): Promise<RawComplexDetail | null> {
    const xml = await this.http.getText(
      `${DETAIL_PATH}?${new URLSearchParams({
        serviceKey: safeDecode(this.config.molitApiKey),
        kaptCode,
      }).toString()}`,
    );
    await this.quota.increment('molit', 1);

    const node = dig(parser.parse(xml), 'response', 'body', 'item');
    if (node === undefined || node === null) return null;

    const row = node as Record<string, unknown>;
    return {
      kaptCode: str(row, 'kaptCode') || kaptCode,
      name: str(row, 'kaptName'),
      address: str(row, 'kaptAddr', 'doroJuso'),
      households: num(row, 'kaptdaCnt'),
      buildingCount: num(row, 'kaptDongCnt'),
      approvalDate: parseUseDate(str(row, 'kaptUsedate')),
      parkingCount: num(row, 'kaptdPcntu') + num(row, 'kaptdPcnt'),
      heatingType: str(row, 'codeHeatNm') || null,
    };
  }
}

/** "20051130" → Date */
function parseUseDate(raw: string): Date | null {
  if (!/^\d{8}$/.test(raw)) return null;
  const date = new Date(
    Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function dig(root: unknown, ...path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function toArray(value: unknown): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
}

function str(node: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = node[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function num(node: Record<string, unknown>, ...names: string[]): number {
  const value = Number(str(node, ...names).replace(/[,\s]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function safeDecode(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}
