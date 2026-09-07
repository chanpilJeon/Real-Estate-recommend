'use client';

import type { ComplexSummaryDto } from '@apt/shared';

import { formatManwon, formatWalk } from '../lib/api-client';

interface Props {
  items: ComplexSummaryDto[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (complex: ComplexSummaryDto) => void;
}

export function ComplexList({ items, total, loading, error, selectedId, onSelect }: Props) {
  if (error !== null) {
    return (
      <div className="list-state">
        <span className="badge badge--error">문제 발생</span>
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  if (loading) {
    return <div className="list-state text-muted">불러오는 중…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="list-state stack stack--2">
        <p style={{ color: 'var(--color-text-primary)' }}>조건에 맞는 단지가 없습니다.</p>
        <p className="text-muted">예산 범위를 넓히거나 면적·세대수 조건을 풀어보세요.</p>
      </div>
    );
  }

  return (
    <>
      <p className="list-count text-muted">
        총 <strong style={{ color: 'var(--color-text-primary)' }}>{total.toLocaleString()}</strong>곳
      </p>
      <ul className="complex-list">
        {items.map((item) => {
          const walk = formatWalk(item.nearestSubwayM);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`complex-card ${selectedId === item.id ? 'complex-card--on' : ''}`}
                onClick={() => onSelect(item)}
              >
                <div className="complex-card__head">
                  <span className="complex-card__name">{item.name}</span>
                  <span className="complex-card__price">{formatManwon(item.medianPriceManwon)}</span>
                </div>
                <div className="complex-card__meta">
                  <span>{item.households.toLocaleString()}세대</span>
                  {item.builtYear !== null && <span>{item.builtYear}년</span>}
                  {walk !== null && <span>역 {walk}</span>}
                </div>
                <div className="complex-card__address">{item.address}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
