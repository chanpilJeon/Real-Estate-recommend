'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi } from '../../lib/admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.login(username, password);
      // 처음 로그인이면 비밀번호부터 바꿔야 대시보드가 열린다
      router.replace(result.mustChangePassword ? '/admin/password' : '/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container admin-narrow">
      <h1 className="admin-title">관리자 로그인</h1>
      <form className="panel stack stack--4" onSubmit={submit}>
        <label className="stack stack--2">
          <span className="field-label">아이디</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="stack stack--2">
          <span className="field-label">비밀번호</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error !== null && <p className="admin-error">{error}</p>}

        <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
