import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../core';
import { ApiQuotaTracker } from '../../observability';
import { MolitApiError, gatewayErrorFrom } from '../domain/molit-parser';
import type { RawComplexDetail, RawComplexInfo } from '../domain/raw-types';
import type { IComplexInfoClient } from '../ports';

import { RetryingFetch } from './retrying-fetch';

const BASE = 'https://apis.data.go.kr/1613000';

/**
 * ⚠ 버전이 서비스마다 다르다 (목록 V4, 정보 V5). 맞춰 쓰지 말 것 —
 *   2026-09-08 실제 키로 확인한 값이다. 예전 V3 경로는 "해당 오픈API 서비스가 없거나 폐기됨".
 */
const LIST_PATH = `${BASE}/AptListService4/getSigunguAptList4`;
const BASIS_PATH = `${BASE}/AptBasisInfoServiceV5/getAphusBassInfoV5`;
/** 주차 대수는 기본정보에 없고 상세정보에만 있다 — 단지당 호출이 한 번 더 든다 */
const DETAIL_PATH = `${BASE}/AptBasisInfoServiceV5/getAphusDtlInfoV5`;

/**
 * 공동주택 단지정보(K-apt) 클라이언트.
 *
 * ⚠ 실거래가 API 와 달리 **JSON 으로 응답한다.** 다만 게이트웨이 오류일 때는
 *   JSON 엔드포인트도 XML 로 답하므로, 파싱 전에 그것부터 걸러야 한다.
 */
@Injectable()
export class ComplexInfoHttpClient implements IComplexInfoClient {
  private readonly http = new RetryingFetch();

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ApiQuotaTracker,
  ) {}

  async fetchComplexList(sigunguCode: string): Promise<RawComplexInfo[]> {
    const body = await this.getJson(LIST_PATH, {
      sigunguCode,
      pageNo: '1',
      numOfRows: '1000',
    });

    // V4 는 items 가 곧 배열이다. 예전처럼 items.item 로 감싸 오더라도 읽히게 둔다.
    const items = dig(body, 'items');
    return toArray(isObject(items) ? dig(items, 'item') : items).map((node) => ({
      kaptCode: str(node, 'kaptCode'),
      name: str(node, 'kaptName'),
      sido: str(node, 'as1'),
      sigungu: str(node, 'as2'),
      dong: str(node, 'as3'),
    }));
  }

  async fetchComplexDetail(kaptCode: string): Promise<RawComplexDetail | null> {
    const basis = dig(await this.getJson(BASIS_PATH, { kaptCode }), 'item');
    if (!isObject(basis)) return null;

    // 주차 대수만 다른 엔드포인트에 있다. 여기가 실패해도 단지 정보는 살린다 —
    // 주차를 모르면 품질 점수에서 중립으로 처리되므로 부당하게 깎이지 않는다.
    const detail = await this.getJson(DETAIL_PATH, { kaptCode })
      .then((b) => dig(b, 'item'))
      .catch(() => undefined);

    const name = str(basis, 'kaptName');
    const parking = isObject(detail) ? num(detail, 'kaptdPcnt') + num(detail, 'kaptdPcntu') : 0;

    return {
      kaptCode: str(basis, 'kaptCode') || kaptCode,
      name,
      address: stripTrailingName(str(basis, 'kaptAddr'), name) || str(basis, 'doroJuso'),
      households: num(basis, 'kaptdaCnt', 'hoCnt'),
      buildingCount: num(basis, 'kaptDongCnt'),
      approvalDate: parseUseDate(str(basis, 'kaptUsedate')),
      parkingCount: parking,
      heatingType: str(basis, 'codeHeatNm') || null,
    };
  }

  /** 공통 호출 — 게이트웨이 오류와 서비스 오류를 사람이 읽는 문장으로 바꾼다 */
  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${path}?${new URLSearchParams({
      // 공공데이터포털 키는 이미 URL 인코딩된 형태로 발급되기도 한다.
      // URLSearchParams 가 다시 인코딩하면 깨지므로 디코딩 후 넣는다.
      serviceKey: safeDecode(this.config.molitApiKey),
      ...params,
    }).toString()}`;

    const text = await this.http.getText(url);
    await this.quota.increment('molit', 1);

    const gateway = gatewayErrorFrom(text);
    if (gateway !== null) throw gateway;

    let root: unknown;
    try {
      root = JSON.parse(text);
    } catch {
      throw new MolitApiError('PARSE', `공동주택 정보 응답을 읽지 못했습니다: ${text.slice(0, 200)}`);
    }

    const response = dig(root, 'response');
    const header = dig(response, 'header');
    const code = isObject(header) ? str(header, 'resultCode') : '';
    // 정상은 "00" 또는 "000"
    if (code !== '' && code !== '00' && code !== '000') {
      throw new MolitApiError(code, `공동주택 정보 API 오류: ${str(header as Record<string, unknown>, 'resultMsg')} (${code})`);
    }

    return dig(response, 'body');
  }
}

/**
 * kaptAddr 는 "서울특별시 강남구 역삼동 761-10 대림역삼아파트" 처럼 **단지명이 뒤에 붙어 온다.**
 * 그대로 지오코딩에 넣으면 주소로 인식되지 않는 경우가 있어 떼어 낸다.
 */
function stripTrailingName(address: string, name: string): string {
  if (name === '' || !address.endsWith(name)) return address;
  return address.slice(0, -name.length).trim();
}

/** "20051130" → Date */
function parseUseDate(raw: string): Date | null {
  if (!/^\d{8}$/.test(raw)) return null;
  const date = new Date(
    Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dig(root: unknown, ...path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isObject(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function toArray(value: unknown): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).filter(isObject);
}

function str(node: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = node[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
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
