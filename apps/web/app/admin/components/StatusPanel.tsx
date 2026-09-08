'use client';

import type { AdminHealth, StatusLevel } from '../../lib/admin-api';

const LEVEL_LABEL: Record<StatusLevel, string> = {
  ok: '정상',
  warn: '확인 필요',
  error: '문제 발생',
};

/**
 * 대시보드 맨 위. **개발 용어 없이 한 문장으로** 지금 상태를 말한다 (ToDo.md 7절).
 * 판정은 서버(순수 함수)가 하고, 여기서는 보여주기만 한다 — 규칙이 두 곳에 갈라지면 안 된다.
 */
export function StatusPanel({ health }: { health: AdminHealth }) {
  return (
    <section className={`status status--${health.level}`}>
      <div className="status__head">
        <span className={`status__badge status__badge--${health.level}`}>
          {LEVEL_LABEL[health.level]}
        </span>
        <p className="status__headline">{health.headline}</p>
      </div>

      {health.actions.length > 0 && (
        <ol className="status__actions">
          {health.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      )}

      <ul className="status__checks">
        {health.checks.map((check) => (
          <li key={check.label} className="status__check">
            <span className={`dot dot--${check.level}`} aria-hidden="true" />
            <span className="status__check-label">{check.label}</span>
            <span className="status__check-detail text-muted">{check.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
