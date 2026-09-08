'use client';

import type { ComplexSummaryDto, RecommendationDto, RegionCandidateDto } from '@apt/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '../lib/api-client';

import { CollectedRegionHint } from './CollectedRegionHint';
import { ComplexDetailPanel } from './ComplexDetailPanel';
import { ComplexList } from './ComplexList';
import { ConditionPanel, type Conditions } from './ConditionPanel';
import { KakaoMap } from './KakaoMap';
import { ProblemReport } from './ProblemReport';
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
  const [items, setItems] = useState<(ComplexSummaryDto | RecommendationDto)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<MobileTab>('list');

  const regionCode = params.get('regionCode') ?? '';
  const preset = params.get('preset') ?? '';
  const page = Math.max(1, Math.floor(numParam(params, 'page') ?? 1));

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
    (next: { regionCode?: string; preset?: string; page?: number } & Partial<Conditions>) => {
      const merged = { regionCode, preset, page: 1, ...conditions, ...next };
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
      }
      router.replace(`/?${search.toString()}`, { scroll: false });
    },
    [conditions, regionCode, preset, router],
  );

  // 링크로 들어온 경우 지역 이름을 채워 넣는다
  useEffect(() => {
    if (regionCode === '' || region?.code === regionCode) return;
    let alive = true;
    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/regions/${regionCode}`,
    )
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

    const request =
      preset === ''
        ? api.searchComplexes({ regionCode, ...conditions, page, pageSize: 100 })
        : api.recommend({ regionCode, ...conditions, preset, page, pageSize: 100 });
    setSelectedId(null);
    request
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
  }, [regionCode, conditions, preset, page]);

  const selectComplex = useCallback((complex: ComplexSummaryDto) => {
    setSelectedId(complex.id);
  }, []);

  return (
    <div className="search-screen">
      <ProblemReport />
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
        <div className="stack stack--2">
          <label className="field-label" htmlFor="recommend-preset">
            추천 기준
          </label>
          <select
            id="recommend-preset"
            className="input"
            value={preset}
            onChange={(e) => updateUrl({ preset: e.target.value })}
          >
            <option value="">조건 검색</option>
            <option value="value">가성비형</option>
            <option value="location">입지우선형</option>
            <option value="newbuild">신축선호형</option>
          </select>
          {preset !== '' && (
            <p className="field-hint">
              조건에 맞는 전체 단지를 점수순으로 추천합니다. 미확인 항목은 중립 점수입니다. 가격은
              최근 6개월 실거래 기준이며 현재 호가와 다릅니다. 수집되지 않은 거래는 점수에 반영되지
              않습니다.
            </p>
          )}
          {preset !== '' && conditions.priceMax === undefined && (
            <p className="field-hint">예산 상한을 입력하면 가격 여유도를 비교할 수 있습니다.</p>
          )}
        </div>
        <hr className="hairline" />
        <ConditionPanel
          value={conditions}
          onChange={(next) => updateUrl(next)}
          recommendation={preset !== ''}
        />
      </section>

      <section className={`search-results ${tab === 'map' ? 'search-results--hidden-mobile' : ''}`}>
        {regionCode === '' ? (
          <div className="list-state stack stack--4">
            <div className="stack stack--2">
              <p style={{ color: 'var(--color-text-primary)' }}>
                왼쪽 <strong>지역</strong> 칸에 지역명을 입력해 주세요.
              </p>
              <p className="text-muted">
                &lsquo;강남구&rsquo;, &lsquo;역삼동&rsquo; 처럼 입력하면 후보가 나오고,
                <br />
                후보를 <strong>클릭해서 골라야</strong> 검색이 시작됩니다.
                <br />
                &lsquo;미사&rsquo; 같은 생활권 이름도 됩니다.
              </p>
            </div>
            <CollectedRegionHint
              searched={false}
              onPick={(code) => updateUrl({ regionCode: code })}
            />
          </div>
        ) : (
          <>
            <ComplexList
              items={items}
              total={total}
              loading={loading}
              error={error}
              selectedId={selectedId}
              onSelect={selectComplex}
            />
            {!loading && error === null && total > 100 && (
              <nav className="pagination" aria-label="결과 페이지">
                <button
                  className="btn btn--ghost"
                  disabled={page <= 1}
                  onClick={() => updateUrl({ page: page - 1 })}
                >
                  이전
                </button>
                <span>
                  {page} / {Math.ceil(total / 100)}
                </span>
                <button
                  className="btn btn--ghost"
                  disabled={page >= Math.ceil(total / 100)}
                  onClick={() => updateUrl({ page: page + 1 })}
                >
                  다음
                </button>
              </nav>
            )}
            {!loading && error === null && items.length === 0 && (
              <CollectedRegionHint searched onPick={(code) => updateUrl({ regionCode: code })} />
            )}
          </>
        )}
      </section>

      <section className={`search-map ${tab === 'list' ? 'search-map--hidden-mobile' : ''}`}>
        <KakaoMap items={items} selectedId={selectedId} onSelect={selectComplex} />
      </section>

      {/* 모바일에서만 보이는 목록/지도 전환 */}
      <div className="mobile-tabs" style={selectedId !== null ? { display: 'none' } : undefined}>
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
        <ComplexDetailPanel
          key={selectedId}
          complexId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
