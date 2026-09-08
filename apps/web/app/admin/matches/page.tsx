'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  NeedsLoginError,
  NeedsPasswordChangeError,
  adminApi,
  type MatchFailureRow,
} from '../../lib/admin-api';

export default function AdminMatchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchFailureRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await adminApi.matches(1);
      setRows(page.items);
      setTotal(page.total);
      setError(null);
    } catch (err) {
      if (err instanceof NeedsLoginError) return router.replace('/admin/login');
      if (err instanceof NeedsPasswordChangeError) return router.replace('/admin/password');
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(failure: MatchFailureRow, complexId: number) {
    setBusyId(failure.id);
    setNotice(null);
    try {
      const result = await adminApi.resolveMatch(failure.id, complexId);
      const moved = result.relinkedTrades + result.relinkedRents;
      setNotice(
        `"${failure.rawName}" 을 연결했습니다. 과거 거래 ${moved.toLocaleString('ko-KR')}건이 함께 되살아났습니다.`,
      );
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '연결하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container container--wide admin-page stack stack--6">
      <section className="panel stack stack--4">
        <h2 className="admin-section-title">매칭 보정</h2>
        <p className="text-muted">
          실거래에는 나왔지만 어느 단지인지 확정하지 못한 이름들입니다. 골라 주면{' '}
          <strong>그 이름의 과거 거래까지 함께 단지에 붙습니다.</strong>
        </p>
        {notice !== null && <div className="banner banner--info">{notice}</div>}
        {error !== null && <div className="banner banner--error">{error}</div>}

        {total === 0 ? (
          <p className="text-muted">처리할 것이 없습니다. 모든 거래가 단지에 연결됐습니다.</p>
        ) : (
          <>
            <span className="field-label">처리할 것 {total.toLocaleString('ko-KR')}건</span>
            <ul className="match-list">
              {rows.map((row) => (
                <li key={row.id} className="match-row">
                  <div className="match-row__head">
                    <span className="match-row__name">{row.rawName}</span>
                    <span className="text-faint">
                      {row.builtYear === null ? '연식 미상' : `${row.builtYear}년`} ·{' '}
                      {row.occurrences.toLocaleString('ko-KR')}건
                    </span>
                  </div>
                  {row.candidates.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: 'var(--text-mini)' }}>
                      비슷한 단지를 찾지 못했습니다. 이 이름의 단지가 아직 없다는 뜻일 수 있습니다.
                    </p>
                  ) : (
                    <div className="chip-row">
                      {row.candidates.map((candidate) => (
                        <button
                          key={candidate.complexId}
                          type="button"
                          className="chip"
                          disabled={busyId === row.id}
                          onClick={() => void resolve(row, candidate.complexId)}
                        >
                          {candidate.name}
                          <span className="text-faint"> {Math.round(candidate.score * 100)}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
