'use client';

import { useEffect, useState } from 'react';

type Status =
  | { kind: 'checking' }
  | { kind: 'ok'; uptimeSec: number }
  | { kind: 'down'; reason: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * M1 테스트(ToDo.md 7.1)용 연결 확인 카드.
 * 비기술자가 "지금 잘 돌아가는지"를 터미널 없이 화면에서 판단할 수 있어야 한다.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    let alive = true;

    void fetch(`${API_BASE}/api/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`서버가 ${res.status} 응답을 보냈습니다`);
        return (await res.json()) as { uptimeSec: number };
      })
      .then((data) => {
        if (alive) setStatus({ kind: 'ok', uptimeSec: data.uptimeSec });
      })
      .catch((err: unknown) => {
        if (alive) {
          setStatus({ kind: 'down', reason: err instanceof Error ? err.message : '연결 실패' });
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="card">
      <div className="card__title">API 서버 연결</div>
      {status.kind === 'checking' && <span className="badge badge--neutral">확인 중…</span>}
      {status.kind === 'ok' && (
        <>
          <span className="badge badge--success">정상</span>
          <p className="card__meta">가동 {status.uptimeSec}초 · {API_BASE}</p>
        </>
      )}
      {status.kind === 'down' && (
        <>
          <span className="badge badge--error">연결 안 됨</span>
          <p className="card__meta">{status.reason}</p>
        </>
      )}
    </div>
  );
}
