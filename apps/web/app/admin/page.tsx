'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  NeedsLoginError,
  NeedsPasswordChangeError,
  adminApi,
  type AdminHealth,
  type AdminMetrics,
  type LogRow,
} from '../lib/admin-api';

import { StatusPanel } from './components/StatusPanel';

/** 화면을 열어두고 지켜볼 수 있게 (ToDo.md 8절) */
const REFRESH_MS = 30_000;

const number = (n: number) => n.toLocaleString('ko-KR');

/** 한도는 API 마다 따로다 — 코드가 아니라 사람이 아는 이름으로 */
const PROVIDER_NAME: Record<string, string> = {
  molit: '국토부 실거래',
  'molit-apt': '국토부 단지정보',
  kakao: '카카오',
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, m, l] = await Promise.all([
        adminApi.health(),
        adminApi.metrics(),
        adminApi.logs({ level: 'error', page: 1 }),
      ]);
      setHealth(h);
      setMetrics(m);
      setLogs(l.items.slice(0, 8));
      setError(null);
      setRefreshedAt(new Date());
    } catch (err) {
      if (err instanceof NeedsLoginError) return router.replace('/admin/login');
      if (err instanceof NeedsPasswordChangeError) return router.replace('/admin/password');
      setError(err instanceof Error ? err.message : '상태를 불러오지 못했습니다.');
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (error !== null) {
    return (
      <div className="container container--wide admin-page">
        <div className="banner banner--error">{error}</div>
      </div>
    );
  }

  if (health === null || metrics === null) {
    return (
      <div className="container container--wide admin-page">
        <p className="text-muted">상태를 확인하는 중…</p>
      </div>
    );
  }

  const data = metrics.data;

  return (
    <div className="container container--wide admin-page stack stack--6">
      <StatusPanel health={health} />

      <section className="panel stack stack--4">
        <div className="admin-section-head">
          <h2 className="admin-section-title">핵심 지표</h2>
          <span className="text-faint" style={{ fontSize: 'var(--text-micro)' }}>
            {refreshedAt === null ? '' : `${refreshedAt.toLocaleTimeString('ko-KR')} 기준 · 30초마다 갱신`}
          </span>
        </div>

        <div className="metric-grid">
          <Metric label="단지" value={number(data.complexCount)} />
          <Metric label="실거래" value={number(data.tradeCount)} />
          <Metric label="전월세" value={number(data.rentCount)} />
          <Metric
            label="최신 계약일"
            value={data.latestContractDate === null ? '없음' : data.latestContractDate.slice(0, 10)}
            hint={data.freshnessDays === null ? undefined : `${data.freshnessDays}일 전`}
          />
          <Metric
            label="연결 안 된 거래"
            value={number(data.unresolvedMatchFailures)}
            hint={data.unresolvedMatchFailures > 0 ? '매칭 보정에서 처리' : undefined}
          />
          <Metric label="최근 7일 검색" value={number(metrics.service.searchCount)} />
        </div>

        <div className="stack stack--2">
          <span className="field-label">오늘 공공 API 사용량</span>
          {metrics.quotas.map((quota) => (
            <div key={quota.provider} className="quota">
              <span className="quota__name">
                {PROVIDER_NAME[quota.provider] ?? quota.provider}
              </span>
              <span className="quota__bar" aria-hidden="true">
                <span
                  className={`quota__fill ${quota.ratio >= 0.8 ? 'quota__fill--warn' : ''}`}
                  style={{ width: `${Math.min(quota.ratio * 100, 100)}%` }}
                />
              </span>
              <span className="quota__text text-muted">
                {number(quota.used)} / {number(quota.limit)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack stack--4">
        <div className="admin-section-head">
          <h2 className="admin-section-title">최근 오류</h2>
          <a className="btn btn--ghost" href="/admin/jobs">
            수집 기록 보기
          </a>
        </div>
        {logs.length === 0 ? (
          <p className="text-muted">최근 오류가 없습니다.</p>
        ) : (
          <ul className="log-list">
            {logs.map((log) => (
              <li key={log.id} className="log-row">
                <span className="log-row__time text-mono text-faint">
                  {new Date(log.createdAt).toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="badge badge--error">{log.context}</span>
                <span className="log-row__message">{log.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      {hint !== undefined && <span className="metric__hint text-faint">{hint}</span>}
    </div>
  );
}
