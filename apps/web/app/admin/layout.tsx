import Link from 'next/link';

export const metadata = { title: '관리자 — 아파트 매물 추천' };

/** 관리자 화면 껍데기. 서비스 헤더(“지역을 검색해 보세요”)와 분리한다 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="admin-header">
        <div className="container container--wide admin-header__inner">
          <Link href="/admin" className="admin-header__logo">
            관리자
          </Link>
          <nav className="admin-nav">
            <Link href="/admin">개요</Link>
            <Link href="/admin/jobs">수집 기록</Link>
            <Link href="/admin/matches">매칭 보정</Link>
            <Link href="/" className="text-faint">
              서비스 화면 →
            </Link>
          </nav>
        </div>
      </header>
      <main className="site-main">{children}</main>
    </>
  );
}
