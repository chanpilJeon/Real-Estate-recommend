'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi } from '../../lib/admin-api';

/** 최소 10자, 문자 종류 2종 이상 (ToDo.md 8절 비밀번호 정책) */
function localCheck(password: string): string | null {
  if (password.length < 10) return '10자 이상이어야 합니다.';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (kinds < 2) return '영문·숫자·기호 중 두 종류 이상을 섞어 주세요.';
  return null;
}

export default function AdminPasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const localError = next === '' ? null : localCheck(next);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (localError !== null) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.changePassword(current, next);
      setDone(true);
    } catch (err) {
      // 서버는 정책 위반을 배열로 준다
      setError(err instanceof Error ? err.message : '변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="container admin-narrow">
        <h1 className="admin-title">비밀번호를 바꿨습니다</h1>
        <div className="panel stack stack--4">
          <p className="text-muted">
            안전을 위해 기존 로그인은 모두 해제했습니다. 새 비밀번호로 다시 들어와 주세요.
          </p>
          <button className="btn btn--primary" onClick={() => router.replace('/admin/login')}>
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container admin-narrow">
      <h1 className="admin-title">비밀번호 변경</h1>
      <div className="banner banner--warn">
        처음 들어오셨네요. <strong>기본 비밀번호는 로컬에서만 안전합니다.</strong> 바꾸기 전에는
        대시보드가 열리지 않습니다.
      </div>

      <form className="panel stack stack--4" onSubmit={submit}>
        <label className="stack stack--2">
          <span className="field-label">현재 비밀번호</span>
          <input
            className="input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="stack stack--2">
          <span className="field-label">새 비밀번호</span>
          <input
            className="input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <span className="field-hint">
            10자 이상, 영문·숫자·기호 중 두 종류 이상. 잊어버리면 되돌릴 방법이 없으니 적어두세요.
          </span>
        </label>

        {localError !== null && <p className="admin-error">{localError}</p>}
        {error !== null && <p className="admin-error">{error}</p>}

        <button
          className="btn btn--primary btn--lg"
          type="submit"
          disabled={busy || localError !== null || current === '' || next === ''}
        >
          {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
      </form>
    </div>
  );
}
