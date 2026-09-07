import { APP_NAME } from '@apt/shared';
import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: `${APP_NAME} — 지역명만 넣으면 조건에 맞는 아파트를 찾아드립니다`,
  description:
    '예산·평형·연식 조건을 저장해두면, 지역명 하나로 실거래가 기반 아파트 단지를 랭킹해 추천합니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Design.md 6절: 서비스 화면은 다크 전용. data-theme 으로 토큰을 재바인딩한다.
    <html lang="ko" data-theme="dark">
      <head>
        {/* 한글 본문용 Pretendard (Inter 와 같은 계열의 기하학적 산세리프) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="container container--wide site-header__inner">
            <span className="site-header__logo">{APP_NAME}</span>
            {/*
              Step 0 에서 뼈대용으로 넣었던 '사용 방법'·'검색 시작' 버튼을 제거했다.
              누르면 아무 일도 일어나지 않아, 사용자가 "왜 안 되지?" 하고 막히는 원인이었다.
              이 화면 자체가 검색이므로 별도 진입 버튼이 필요 없다.
            */}
            <span className="site-header__hint text-faint">
              지역을 검색해 조건에 맞는 아파트를 찾아보세요
            </span>
          </div>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
