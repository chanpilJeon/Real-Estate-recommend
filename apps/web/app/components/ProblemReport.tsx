'use client';

import { useState } from 'react';

/** 현재 검색조건을 담은 신고 초안. 외부 전송은 사용자가 GitHub에서 제출할 때만 한다. */
export function ProblemReport() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState('');
  function prepare() {
    const current = new URL(window.location.href);
    const allowed = [
      'regionCode',
      'priceMin',
      'priceMax',
      'areaMin',
      'areaMax',
      'builtAfter',
      'minHouseholds',
      'sort',
      'preset',
      'page',
    ];
    const safe = new URLSearchParams();
    for (const key of allowed) {
      const value = current.searchParams.get(key);
      if (value !== null) safe.set(key, value);
    }
    const body = `## 어떤 문제가 있었나요?\n${description.trim() || '(여기에 적어주세요)'}\n\n## 재현할 검색 화면\n${current.origin}${current.pathname}?${safe}\n\n## 화면 캡처\n필요하면 이 글에 이미지를 끌어다 놓아 주세요.\n\n작성 시각: ${new Date().toISOString()}`;
    setDraft(
      `https://github.com/chanpilJeon/Real-Estate-recommend/issues/new?${new URLSearchParams({ title: '서비스 사용 중 문제 신고', body })}`,
    );
  }
  return (
    <div className="problem-report">
      <button className="btn btn--secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
        문제 신고
      </button>
      {open && (
        <section className="panel-floating report-panel" aria-label="문제 신고 초안">
          <label className="field-label" htmlFor="problem-description">
            어떤 문제가 있었나요?
          </label>
          <textarea
            id="problem-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDraft('');
            }}
          />
          <p className="field-hint">
            검색조건을 첨부한 GitHub 신고 초안을 만듭니다. 새 창에서 내용을 확인하고 제출하세요.
            캡처 이미지는 그곳에 끌어다 놓을 수 있습니다.
          </p>
          <button className="btn btn--primary" onClick={prepare}>
            신고 초안 만들기
          </button>
          {draft && (
            <a className="ext-link" href={draft} target="_blank" rel="noopener noreferrer">
              GitHub에서 검토하기 ↗
            </a>
          )}
        </section>
      )}
    </div>
  );
}
