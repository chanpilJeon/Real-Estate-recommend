'use client';

import type { ComplexSummaryDto, RecommendationDto } from '@apt/shared';

import { formatManwon, formatWalk } from '../lib/api-client';

interface Props {
  items: (ComplexSummaryDto | RecommendationDto)[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (complex: ComplexSummaryDto) => void;
  /** "왜 결과가 이것뿐인지" 한 문장. 없으면 표시하지 않는다 */
  note?: string;
}

export function ComplexList({ items, total, loading, error, selectedId, onSelect, note }: Props) {
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
        {/* 빈 화면만 보여주지 않는다 — 왜 없는지 알아야 조건을 고칠 수 있다 */}
        {note !== undefined && <p className="text-muted">{note}</p>}
        <p className="text-muted">예산 범위를 넓히거나 면적·세대수 조건을 풀어보세요.</p>
      </div>
    );
  }

  return (
    <>
      <p className="list-count text-muted">
        총 <strong style={{ color: 'var(--color-text-primary)' }}>{total.toLocaleString()}</strong>
        곳
      </p>
      {/*
        자기가 아는 단지가 안 보이면 사용자는 서비스를 의심한다.
        "63곳 중 18곳을 보고 있고, 45곳은 예산을 넘습니다"를 먼저 말해준다.
      */}
      {note !== undefined && <p className="list-note text-muted">{note}</p>}
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
                  <span className="complex-card__price">
                    {formatManwon(item.medianPriceManwon)}
                  </span>
                </div>
                <div className="complex-card__meta">
                  {item.households > 0 && <span>{item.households.toLocaleString()}세대</span>}
                  {item.builtYear !== null && <span>{item.builtYear}년</span>}
                  {walk !== null && <span>역 {walk}</span>}
                </div>
                <div className="complex-card__address">{item.address}</div>
                {'score' in item && (
                  <div className="recommendation-summary">
                    <strong className="recommendation-score">추천 {item.score.toFixed(1)}점</strong>
                    <span className="score-parts">
                      가격 {item.breakdown.price} · 유동성 {item.breakdown.liquidity} · 입지{' '}
                      {item.breakdown.location} · 품질 {item.breakdown.quality}
                    </span>
                    {item.reasons.map((reason) => (
                      <span key={reason} className="recommendation-reason">
                        {reason}
                      </span>
                    ))}
                    {item.missingData?.length > 0 && (
                      <span className="field-hint">미확인: {item.missingData.join(', ')}</span>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
