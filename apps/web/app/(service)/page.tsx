import { Suspense } from 'react';

import { SearchScreen } from '../components/SearchScreen';

/** 검색 화면. URL 쿼리를 읽으므로 Suspense 로 감싼다 (Next.js App Router 요구사항) */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="list-state text-muted">불러오는 중…</div>}>
      <SearchScreen />
    </Suspense>
  );
}
