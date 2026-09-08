import { APP_NAME } from '@apt/shared';

/**
 * 서비스 화면(검색·추천)의 껍데기.
 *
 * 관리자 화면과 헤더를 나누려고 라우트 그룹으로 갈랐다.
 * 최상위 layout 에 헤더를 두면 /admin 에서도 "지역을 검색해 보세요"가 뜬다.
 */
export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
