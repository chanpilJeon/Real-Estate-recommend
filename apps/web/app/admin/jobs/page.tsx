'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  NeedsLoginError,
  NeedsPasswordChangeError,
  adminApi,
  type JobRun,
} from '../../lib/admin-api';

const REFRESH_MS = 30_000;
const STATUS_LABEL: Record<JobRun['status'], string> = {
  running: '실행 중',
  success: '성공',
  failed: '실패',
};

const duration = (ms: number | null) => {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
  return `${Math.round(ms / 60_000)}분`;
};

export default function AdminJobsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRuns(await adminApi.jobs(30));
      setError(null);
    } catch (err) {
      if (err instanceof NeedsLoginError) return router.replace('/admin/login');
      if (err instanceof NeedsPasswordChangeError) return router.replace('/admin/password');
      setError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.');
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function run() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await adminApi.runJob('daily-collect');
      setNotice(result.message);
      // 시작 직후에는 아직 기록이 없을 수 있어 잠깐 뒤 한 번 더 읽는다
      setTimeout(() => void load(), 1500);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '실행하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const running = runs.some((r) => r.status === 'running');

  return (
    <div className="container container--wide admin-page stack stack--6">
      <section className="panel stack stack--4">
        <div className="admin-section-head">
          <h2 className="admin-section-title">수집 실행</h2>
          <button className="btn btn--primary" onClick={run} disabled={busy || running}>
            {running ? '실행 중…' : '지금 수집하기'}
          </button>
        </div>
        <p className="text-muted">
          최근 2개월치 실거래를 다시 받아옵니다. 지역이 많으면 수십 분 걸립니다 — 눌러두고 이
          화면을 열어두시면 아래 기록이 30초마다 갱신됩니다.
        </p>
        {notice !== null && <div className="banner banner--info">{notice}</div>}
      </section>

      <section className="panel stack stack--4">
        <h2 className="admin-section-title">최근 기록</h2>
        {error !== null && <div className="banner banner--error">{error}</div>}
        {runs.length === 0 ? (
          <p className="text-muted">아직 실행 기록이 없습니다.</p>
        ) : (
          <ul className="job-list">
            {runs.map((run) => (
              <li key={run.id} className="job-row">
                <span className={`dot dot--${run.status === 'failed' ? 'error' : run.status === 'running' ? 'warn' : 'ok'}`} />
                <span className="job-row__name">{run.jobName}</span>
                <span className="job-row__status text-muted">{STATUS_LABEL[run.status]}</span>
                <span className="job-row__time text-mono text-faint">
                  {new Date(run.startedAt).toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="job-row__rows text-muted">
                  +{run.rowsInserted.toLocaleString('ko-KR')}
                </span>
                <span className="job-row__duration text-faint">{duration(run.durationMs)}</span>
                {run.errorMessage !== null && (
                  <span className="job-row__error">{run.errorMessage.slice(0, 120)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
