'use client';

import type { ComplexDetailDto } from '@apt/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api, ApiError, formatManwon, formatWalk, type TradeRow } from '../lib/api-client';

interface Props {
  complexId: number;
  onClose: () => void;
}

interface TrendPoint {
  yearMonth: string;
  medianManwon: number;
  count: number;
}

/** 실거래 목록에서 월별 중위가를 만든다 (해제 거래 제외) */
function buildTrend(trades: TradeRow[]): TrendPoint[] {
  const buckets = new Map<string, number[]>();
  for (const trade of trades) {
    if (trade.isCanceled) continue; // 해제된 거래는 추세에서 뺀다
    const key = trade.contractedAt.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [trade.priceManwon]);
    else bucket.push(trade.priceManwon);
  }

  return [...buckets.entries()]
    .map(([yearMonth, prices]) => {
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      return { yearMonth, medianManwon: Math.round(median), count: prices.length };
    })
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/** 거래가 가장 많은 전용면적. 동률이면 작은 쪽(수요가 많은 평형) */
function mostTradedArea(trades: TradeRow[]): number | null {
  const counts = new Map<number, number>();
  for (const trade of trades) {
    if (trade.isCanceled) continue;
    counts.set(trade.exclusiveSqm, (counts.get(trade.exclusiveSqm) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

export function ComplexDetailPanel({ complexId, onClose }: Props) {
  const [detail, setDetail] = useState<ComplexDetailDto | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [areas, setAreas] = useState<number[]>([]);
  const [area, setArea] = useState<number | undefined>(undefined);
  /** 최다 거래 면적 자동 선택은 단지당 한 번만 (사용자가 '전체'로 되돌리면 존중한다) */
  const [autoPicked, setAutoPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 단지를 바꾸면 면적 선택을 초기화한다
  useEffect(() => {
    setArea(undefined);
    setAutoPicked(false);
  }, [complexId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    Promise.all([api.getComplex(complexId), api.getTrades(complexId, area, 200)])
      .then(([complexDetail, tradeResult]) => {
        if (!alive) return;
        setDetail(complexDetail);
        setTrades(tradeResult.items);
        setAreas(tradeResult.areas);

        // 처음 열 때는 **거래가 가장 많은 면적**을 골라 준다.
        // 여러 평형을 한 선에 섞으면 그 달에 어떤 평형이 거래됐느냐에 따라
        // 값이 널뛰어 시세 흐름을 잘못 읽게 된다 (ToDo.md 5.3: 면적 타입별 시계열).
        if (!autoPicked && area === undefined && tradeResult.areas.length > 1) {
          setAutoPicked(true);
          const picked = mostTradedArea(tradeResult.items);
          if (picked !== null) setArea(picked);
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err.message : '단지 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [complexId, area]);

  const trend = useMemo(() => buildTrend(trades), [trades]);

  return (
    <aside className="detail-panel panel-floating">
      <header className="detail-panel__head">
        <div>
          <h2 className="detail-panel__title">{detail?.name ?? '불러오는 중…'}</h2>
          {detail !== null && <p className="text-faint">{detail.address}</p>}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="닫기">
          닫기
        </button>
      </header>

      {error !== null && (
        <div className="list-state">
          <span className="badge badge--error">문제 발생</span>
          <p className="text-muted">{error}</p>
        </div>
      )}

      {detail !== null && (
        <>
          <div className="spec-grid">
            <Spec label="세대수" value={`${detail.households.toLocaleString()}세대`} />
            <Spec label="동수" value={`${detail.buildingCount}개동`} />
            <Spec label="연식" value={detail.ageYears === null ? '미상' : `${detail.ageYears}년차`} />
            <Spec
              label="세대당 주차"
              value={detail.parkingPerHousehold === null ? '미상' : `${detail.parkingPerHousehold}대`}
            />
            <Spec label="난방" value={detail.heatingType ?? '미상'} />
            <Spec
              label="역까지"
              value={formatWalk(detail.nearestSubwayM) ?? '미상'}
            />
          </div>

          {detail.qualityReasons.length > 0 && (
            <div className="reason-row">
              {detail.qualityReasons.map((reason) => (
                <span key={reason} className="badge badge--success">
                  {reason}
                </span>
              ))}
            </div>
          )}

          {areas.length > 0 && (
            <div className="stack stack--2">
              <span className="field-label">전용면적</span>
              <div className="chip-row">
                <button
                  type="button"
                  className={`chip ${area === undefined ? 'chip--on' : ''}`}
                  onClick={() => setArea(undefined)}
                >
                  전체
                </button>
                {areas.map((sqm) => (
                  <button
                    key={sqm}
                    type="button"
                    className={`chip ${area === sqm ? 'chip--on' : ''}`}
                    onClick={() => setArea(sqm)}
                  >
                    {Math.floor(sqm)}㎡
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="stack stack--2">
            <span className="field-label">실거래가 추이 (월별 중위가)</span>
            {area === undefined && areas.length > 1 && (
              <p className="field-hint">
                여러 면적이 섞여 있어 실제 시세 흐름과 다르게 보일 수 있습니다. 면적을 골라 보세요.
              </p>
            )}
            {trend.length < 2 ? (
              <p className="text-muted" style={{ fontSize: 'var(--text-small)' }}>
                거래가 적어 추이를 그릴 수 없습니다.
              </p>
            ) : (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--color-border-translucent-strong)" vertical={false} />
                    <XAxis
                      dataKey="yearMonth"
                      tick={{ fill: 'var(--color-text-quaternary)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-text-quaternary)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={(v: number) => formatManwon(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-bg-floating)',
                        border: '1px solid var(--color-border-translucent-strong)',
                        borderRadius: 'var(--radius-8)',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--color-text-tertiary)' }}
                      formatter={(value: number, _name, entry) => [
                        `${formatManwon(value)}원 (${(entry.payload as TrendPoint).count}건)`,
                        '중위가',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="medianManwon"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={{ r: 2, fill: 'var(--color-accent)' }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="stack stack--2">
            <span className="field-label">최근 실거래</span>
            {loading && <p className="text-muted">불러오는 중…</p>}
            <ul className="trade-list">
              {trades.slice(0, 15).map((trade, index) => (
                <li key={`${trade.contractedAt}-${trade.priceManwon}-${index}`} className="trade-row">
                  <span className="trade-row__date text-mono">{trade.contractedAt}</span>
                  <span className="trade-row__area">{trade.areaLabel}</span>
                  <span className="trade-row__floor text-faint">{trade.floor}층</span>
                  <span className="trade-row__price">{trade.priceText}</span>
                  {trade.isCanceled && <span className="badge badge--error">해제</span>}
                </li>
              ))}
            </ul>
            {trades.length === 0 && !loading && <p className="text-muted">실거래 내역이 없습니다.</p>}
          </div>
        </>
      )}
    </aside>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="spec">
      <span className="spec__label">{label}</span>
      <span className="spec__value">{value}</span>
    </div>
  );
}
