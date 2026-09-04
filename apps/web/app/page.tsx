import { ApiStatus } from './components/ApiStatus';

/** ToDo.md 6절 Step 0 의 결과 화면. Step 6 에서 실제 검색 화면으로 교체된다. */
const ROADMAP: { step: string; title: string; done: boolean }[] = [
  { step: 'Step 0', title: '개발환경·모노레포 셋업', done: true },
  { step: 'Step 1', title: '값 객체(금액·면적·지역코드·좌표)', done: false },
  { step: 'Step 2', title: 'DB 스키마 + 법정동 코드 적재', done: false },
  { step: 'Step 3', title: '지역 검색 · 관측 · 관리자 인증', done: false },
  { step: 'Step 4', title: '외부 API 어댑터 · 단지 · 실거래', done: false },
  { step: 'Step 5', title: '단지명 매칭 · 수집 배치', done: false },
  { step: 'Step 6', title: '조건 검색 + 지도 화면', done: false },
];

export default function HomePage() {
  return (
    <div className="container container--wide">
      <section className="section stack stack--8">
        <div className="stack stack--4 measure-title">
          <span className="eyebrow">Step 0 · 개발환경 준비 완료</span>
          <h1 className="title-hero">
            지역명 하나로
            <br />
            조건에 맞는 아파트를 찾습니다
          </h1>
          <p className="text-muted prose" style={{ fontSize: 'var(--text-large)' }}>
            예산·평형·연식·세대수 조건을 한 번 설정해두면, 실거래가를 기준으로 단지를 랭킹해
            추천합니다. 지금은 개발 초기 단계로, 아래는 프로그램이 정상 실행됐는지 확인하는
            화면입니다.
          </p>
        </div>

        <div className="grid-cards">
          <div className="card">
            <div className="card__title">웹 화면</div>
            <span className="badge badge--success">정상</span>
            <p className="card__meta">이 화면이 보인다면 프론트엔드는 정상입니다</p>
          </div>
          <ApiStatus />
          <div className="card">
            <div className="card__title">현재 단계</div>
            <div className="card__value">Step 0</div>
            <p className="card__meta">전체 12단계 중 1단계 완료</p>
          </div>
        </div>
      </section>

      <hr className="hairline" />

      <section className="section stack stack--6">
        <h2 className="title-section">
          앞으로 만들 것 — <strong>단계별로 하나씩</strong>
        </h2>
        <ol className="stack stack--2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ROADMAP.map((item) => (
            <li
              key={item.step}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
            >
              <span className={`badge ${item.done ? 'badge--success' : 'badge--neutral'}`}>
                {item.done ? '완료' : '예정'}
              </span>
              <span className="text-mono text-faint">{item.step}</span>
              <span style={{ color: item.done ? 'var(--color-text-primary)' : undefined }}>
                {item.title}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
