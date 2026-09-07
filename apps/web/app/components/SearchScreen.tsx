'use client';

import type { ComplexSummaryDto, RegionCandidateDto } from '@apt/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '../lib/api-client';

import { ComplexDetailPanel } from './ComplexDetailPanel';
import { ComplexList } from './ComplexList';
import { ConditionPanel, type Conditions } from './ConditionPanel';
import { KakaoMap } from './KakaoMap';
import { RegionSearchInput } from './RegionSearchInput';

type MobileTab = 'list' | 'map';

const numParam = (params: URLSearchParams, key: string): number | undefined => {
  const raw = params.get(key);
  if (raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * 검색 화면.
 *
 * **조건은 URL 쿼리에 담는다** (ToDo.md Step 6) — 그래야 검색 결과를 링크로 공유하고,
 * 새로고침해도 조건이 남고, 뒤로 가기가 자연스럽게 동작한다.
 */
export function SearchScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const [region, setRegion] = useState<RegionCandidateDto | null>(null);
  const [items, setItems] = useState<ComplexSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<MobileTab>('list');

  const regionCode = params.get('regionCode') ?? '';

  const conditions = useMemo<Conditions>(
    () => ({
      priceMin: numParam(params, 'priceMin'),
      priceMax: numParam(params, 'priceMax'),
      areaMin: numParam(params, 'areaMin'),
      areaMax: numParam(params, 'areaMax'),
      builtAfter: numParam(params, 'builtAfter'),
      minHouseholds: numParam(params, 'minHouseholds'),
      sort: params.get('sort') ?? 'price',
    }),
    [params],
  );

  /** URL 을 바꿔 검색을 다시 돌린다 */
  const updateUrl = useCallback(
    (next: { regionCode?: string } & Partial<Conditions>) => {
      const merged = { regionCode, ...conditions, ...next };
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
      }
      router.replace(`/?${search.toString()}`, { scroll: false });
    },
    [conditions, regionCode, router],
  );

  // 링크로 들어온 경우 지역 이름을 채워 넣는다
  useEffect(() => {
    if (regionCode === '' || region?.code === regionCode) return;
    let alive = true;
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/regions/${regionCode}`)
      .then((r) => (r.ok ? (r.json() as Promise<RegionCandidateDto>) : null))
      .then((found) => {
        if (alive && found !== null) setRegion(found);
      })
      .catch(() => {
        /* 이름을 못 채워도 검색 자체는 코드로 동작한다 */
      });
    return () => {
      alive = false;
    };
  }, [regionCode, region?.code]);

  // 조건이 바뀌면 검색
  useEffect(() => {
    if (regionCode === '') {
      setItems([]);
      setTotal(0);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    api
      .searchComplexes({ regionCode, ...conditions, pageSize: 100 })
      .then((result) => {
        if (!alive) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : '검색 중 문제가 생겼습니다.');
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [regionCode, conditions]);

  const selectComplex = useCallback((complex: ComplexSummaryDto) => {
    setSelectedId(complex.id);
  }, []);

  return (
    <div className="search-screen">
      <section className="search-sidebar">
        <RegionSearchInput
          selected={region}
          onSelect={(next) => {
            setRegion(next);
            setSelectedId(null);
            updateUrl({ regionCode: next.code });
          }}
        />
        <hr className="hairline" />
        <ConditionPanel value={conditions} onChange={(next) => updateUrl(next)} />
      </section>

      <section className={`search-results ${tab === 'map' ? 'search-results--hidden-mobile' : ''}`}>
        {regionCode === '' ? (
          <div className="list-state stack stack--2">
            <p style={{ color: 'var(--color-text-primary)' }}>지역을 먼저 골라주세요.</p>
            <p className="text-muted">
              &lsquo;영통&rsquo;, &lsquo;강남구&rsquo; 처럼 입력하면 후보가 나옵니다.
              <br />
              &lsquo;미사&rsquo; 같은 생활권 이름도 됩니다.
            </p>
          </div>
        ) : (
          <ComplexList
            items={items}
            total={total}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={selectComplex}
          />
        )}
      </section>

      <section className={`search-map ${tab === 'list' ? 'search-map--hidden-mobile' : ''}`}>
        <KakaoMap items={items} selectedId={selectedId} onSelect={selectComplex} />
      </section>

      {/* 모바일에서만 보이는 목록/지도 전환 */}
      <div className="mobile-tabs">
        <button
          type="button"
          className={`btn ${tab === 'list' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setTab('list')}
        >
          목록
        </button>
        <button
          type="button"
          className={`btn ${tab === 'map' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setTab('map')}
        >
          지도
        </button>
      </div>

      {selectedId !== null && (
        <ComplexDetailPanel complexId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
