# Design.md — linear.app 디자인 분석

> 2026-09-02 기준, https://linear.app (마케팅 홈페이지)을 브라우저에서 직접 열어 실제 렌더링된 CSS 변수·computed style을 추출해 정리한 문서.
> 모든 HEX/수치는 사이트 CSS에서 실측한 값이다.

---

## 1. 전체 레이아웃 구조

Linear 홈페이지는 **사이드바 없는 단일 컬럼 세로 스크롤 구조**다. (사이드바는 제품 앱 UI에만 존재하고, 마케팅 사이트에는 `<aside>` 요소가 없다.)

```
┌─────────────────────────────────────────────┐
│ 헤더 (fixed, h:72px, blur 배경)              │  로고 | Product Resources Customers
│                                             │  Pricing Now Contact | Log in [Sign up]
├─────────────────────────────────────────────┤
│ 히어로 섹션 (H1 + 서브카피 + CTA + 제품 UI 목업) │
├─────────────────────────────────────────────┤
│ 기능 섹션 × N (풀블리드 비주얼 + 카드 그리드)    │  총 본문 높이 약 9,000px
├─────────────────────────────────────────────┤
│ 푸터 (6컬럼 링크 그리드, 42개 링크)            │  Product / Features / Company /
│                                             │  Resources / Connect / Legal
└─────────────────────────────────────────────┘
```

### 헤더
- `position: fixed`, 높이 `72px` (`--header-height`), `z-index: 100`
- 배경: 반투명 검정 `#0b0b0bcc` + `backdrop-filter: blur(20px)` — 스크롤 시 콘텐츠가 비쳐 보이는 유리 효과
- 하단 경계: `1px solid rgba(255,255,255,0.08)` 헤어라인
- 구성: 좌측 로고 → 중앙 내비게이션(텍스트 링크) → 우측 유틸리티(Log in 고스트 + Sign up 필 버튼)

### 콘텐츠 폭 시스템
- 일반 페이지 최대폭: `--page-max-width: 1024px`, 좌우 패딩 `24px`
- 홈페이지 전용 최대폭: `--homepage-max-width: 1344px + 10px×2`
- 본문(산문) 최대폭: `--prose-max-width: 624px` — 문단은 좁게, 비주얼은 넓게 쓰는 이원 구조
- 섹션 수직 패딩: `--page-padding-block: 64px`

### 푸터
- 6개 컬럼(Product / Features / Company / Resources / Connect / Legal)의 링크 그리드
- 배경은 본문과 동일한 검정 계열로 경계를 최소화

---

## 2. 컬러 팔레트

전면 다크 테마. 순수 검정(#000)이 아니라 **미세하게 밝은 근사 검정**을 배경으로 쓰고, 텍스트는 순백이 아닌 **살짝 톤 다운된 흰색**을 쓴다.

### Primary (브랜드/액센트)
| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-brand-bg` / `--color-indigo` | `#5E6AD2` | Linear 브랜드 인디고 (로고, 브랜드 요소, 포커스 링 `#5E69D1`) |
| `--color-accent` | `#7170FF` | 액센트 (인터랙티브 강조) |
| `--color-accent-hover` | `#828FFF` | 액센트 hover, 링크 색상(`--color-link-primary`)과 동일 |
| `--color-accent-tint` | `#18182F` | 액센트의 어두운 틴트 배경 |

### Secondary (기능색)
| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-red` | `#EB5757` | 오류/삭제 |
| `--color-green` | `#27A644` | 성공 |
| `--color-orange` | `#FC7840` | 경고/강조 |
| `--color-yellow` | `#F0BF00` | 주의 |
| `--color-teal` | `#00B8CC` | 보조 액센트 |

### Background (레이어 시스템)
배경을 단일색이 아닌 **표고(elevation) 레벨**로 관리한다. 위로 뜰수록 밝아진다.

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-bg-marketing` | `#010102` | 홈페이지 최심부 배경 |
| `--color-bg-primary` (`bg-level-0`) | `#08090A` | 기본 페이지 배경 (body) |
| `--color-bg-level-1` / `bg-panel` | `#0F1011` | 카드/패널 1단계 |
| `--color-bg-level-2` | `#141516` | 2단계 표면 |
| `--color-bg-level-3` | `#191A1B` | 3단계 표면 |
| `--color-bg-secondary` | `#1C1C1F` | 보조 배경 |
| `--color-bg-tertiary` | `#232326` | 3차 배경 (hover 등) |
| `--color-bg-quaternary` | `#28282C` | 4차 배경 |
| `--color-bg-translucent` | `#FFFFFF0D` | 흰색 5% 오버레이 (유리 표면) |

### Text (4단계 위계)
| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-text-primary` | `#F7F8F8` | 제목·본문 주 텍스트 (순백 아님) |
| `--color-text-secondary` | `#D0D6E0` | 보조 텍스트 (미세한 블루 틴트) |
| `--color-text-tertiary` | `#8A8F98` | 설명문·서브카피 (H2, 문단에 실사용 확인) |
| `--color-text-quaternary` | `#62666D` | 비활성/미세 정보 |

### Border
| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-border-primary` | `#23252A` | 기본 경계 |
| `--color-border-secondary` | `#34343A` | 강조 경계 |
| `--color-border-translucent` | `#FFFFFF0D` (흰색 5%) | 카드 헤어라인 — 실제 카드에 가장 많이 쓰임 |
| `--color-border-translucent-strong` | `#FFFFFF14` (흰색 8%) | 헤더 하단선 등 |

**핵심 패턴**: 다크 UI의 경계선을 불투명 회색이 아니라 **흰색 알파(5~12%)**로 처리해, 어떤 배경 레벨 위에서도 자연스럽게 보이게 한다.

---

## 3. 타이포그래피

### 폰트 패밀리
| 역할 | 스택 |
|---|---|
| 본문/UI | `"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, … sans-serif` |
| 모노스페이스 | `"Berkeley Mono", ui-monospace, "SF Mono", Menlo, monospace` |
| 세리프 디스플레이 | `"Tiempos Headline", ui-serif, Georgia, … serif` (일부 에디토리얼 용) |

Inter **Variable** 폰트를 쓰기 때문에 굵기가 100 단위가 아닌 소수점 값이다. OpenType 피처 `"cv01", "ss03"` 활성화(대체 글리프).

### 굵기 체계 (Variable 커스텀 웨이트)
| 토큰 | 값 |
|---|---|
| `--font-weight-light` | 300 |
| `--font-weight-normal` | 400 |
| `--font-weight-medium` | **510** |
| `--font-weight-semibold` | **590** |
| `--font-weight-bold` | **680** |

### 크기 체계 — Title 스케일 (제목, 모두 weight 590 기준)
| 토큰 | 크기 | 행간 | 자간 |
|---|---|---|---|
| title-1 | 17px (1.0625rem) | 1.4 | -0.012em |
| title-2 | 20px | 1.33 | -0.012em |
| title-3 | 24px | 1.33 | -0.012em |
| title-4 | 32px | 1.125 | -0.022em |
| title-5 | 40px | 1.1 | -0.022em |
| title-6 | 48px | 1.0 | -0.022em |
| title-7 | 56px | 1.1 | -0.022em |
| title-8 | 64px | 1.06 | -0.022em |
| title-9 | 72px | 1.0 | -0.022em |

### 크기 체계 — Text 스케일 (본문)
| 토큰 | 크기 | 행간 |
|---|---|---|
| text-tiny | 10px | 1.5 |
| text-micro | 12px | 1.4 |
| text-mini | 13px | 1.5 |
| text-small | 14px | 1.5 |
| text-regular | **15px** | 1.6 |
| text-large | 17px | 1.6 |

### 실측 사용례
- **H1 (히어로)**: 64px / 행간 64px(1.0) / weight 510 / 자간 -1.4px / `#F7F8F8`
- **H2 (섹션 제목)**: 40px / 행간 44px / weight 510 / **색상 `#8A8F98`(tertiary)** — 섹션 제목을 회색으로 두고 뒤 문장만 흰색으로 강조하는 Linear 특유의 패턴
- **본문 문단**: 15px / 행간 24px / `#8A8F98`
- 큰 제목일수록 자간을 강하게 좁히고(-0.022em) 행간을 1.0까지 조인다.

---

## 4. 여백과 간격 규칙 (Spacing Scale)

명시적인 `--space-*` 스케일 변수는 없고, **4px 배수 그리드** 위에서 용도별 토큰으로 관리한다.

### 실측된 간격 토큰
| 토큰 | 값 | 용도 |
|---|---|---|
| `--block-spacing-small` | 8px | 블록 내 소간격 |
| `--block-spacing` | 16px | 기본 블록 간격 |
| `--padding` | 16px | 기본 패딩 |
| `--list-inset` | 24px | 리스트 들여쓰기 |
| `--page-padding-inline` | 24px | 페이지 좌우 패딩 |
| `--page-inset` / `--homepage-padding-inset` | 32px | 콘텐츠 인셋 |
| `--figure-margin` | 32px | 그림 요소 마진 |
| `--image-figure-margin` | 48px (태블릿 32px) | 이미지 마진 |
| `--page-padding-block` | 64px | 섹션 수직 패딩 |
| `--header-height` | 72px | 헤더 높이 |

### 정리하면 사실상의 스케일
```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (px)
```
- 컴포넌트 내부: 8~16px
- 컴포넌트 사이: 16~32px
- 섹션 사이: 48~64px 이상 (히어로·대형 섹션은 그 이상)
- 반응형에서 한 단계씩 줄임 (48 → 32 등)

### Border Radius 스케일
```
--radius-4: 4px | --radius-6: 6px | --radius-8: 8px | --radius-12: 12px
--radius-16: 16px | --radius-24: 24px | --radius-32: 32px
--radius-rounded: 9999px (필/pill) | --radius-circle: 50%
```

### 모션 속도
```
--speed-quickTransition: 0.1s | --speed-highlightFadeOut: 0.15s | --speed-regularTransition: 0.25s
```

---

## 5. 주요 컴포넌트 스타일

### 버튼
Linear 홈페이지 버튼은 **작고(32px), 완전한 필(pill) 형태**가 기본이다.

**Primary (Sign up — 반전 버튼)**
```css
height: 32px;
padding: 0 12px;
border-radius: 9999px;              /* 완전한 필 */
background: #E5E5E6;                /* --color-button-invert-bg: 다크 위의 밝은 반전 */
color: #08090A;                     /* 배경색을 글자색으로 반전 */
border: 1px solid #E5E5E6;
font-size: 13px;
font-weight: 510;                   /* medium */
/* hover: background #FFFFFF (--color-button-invert-bg-hover) */
```

**Secondary/Ghost (Log in)**
```css
height: 32px;
padding: 0 12px;
border-radius: 9999px;
background: transparent;
color: #8A8F98;                     /* text-tertiary, hover 시 밝아짐 */
font-size: 13px;
```

**브랜드 버튼(앱/CTA 계열)**: `background: #5E6AD2; color: #fff;`

### 카드
```css
background: #0F1011;                        /* bg-level-1: 배경보다 한 단계 밝게 */
border: 0.5px solid rgba(255,255,255,0.08); /* 헤어라인 — 0.5px 사용이 특징 */
border-radius: 9px~12px;
padding: 12px 16px;
box-shadow: rgba(0,0,0,0.2) 0 0 0 1px;      /* 그림자 대신 1px 링으로 윤곽 보강 */
```
- 떠 있는 패널(모달·팝오버급): `background: #161718; radius: 12px; box-shadow: 0 2px 32px rgba(0,0,0,0.25)`
- 그림자 토큰: `--shadow-low: 0 2px 4px #0000001a` / `--shadow-medium: 0 4px 24px #0003` / `--shadow-high: 0 7px 32px #00000059`
- **핵심 패턴**: 다크 테마에서 그림자 대신 ①배경 레벨 상승 ②흰색 알파 헤어라인 ③에지 하이라이트(`edgeHighlightRing`, 상단 모서리에 밝은 선)로 입체감을 만든다.

### 입력폼
홈페이지에는 노출 폼이 거의 없다(제품 UI 목업 내부에만 존재). 제품 스타일 기준:
```css
background: #232326 또는 rgba(255,255,255,0.05);  /* bg-tertiary/translucent */
border: 1px solid rgba(255,255,255,0.08);
border-radius: 6~8px;
font-size: 13~14px;
/* focus: */
outline: 1px solid #5E69D1;         /* --focus-ring-outline */
outline-offset: 2px;                /* --focus-ring-offset */
```

### 링크
- 기본: `#828FFF` (`--color-link-primary`), hover 시 `#FFFFFF`
- 본문 내 링크는 색상보다 명도 변화로 처리하는 경우가 많음

### 상태(토스트/알림) 색상
| 상태 | 배경 | 경계 | 텍스트 |
|---|---|---|---|
| error | `hsl(358,76%,10%)` | `hsl(357,89%,16%)` | `hsl(358,100%,81%)` |
| success | `hsl(150,100%,6%)` | `hsl(147,100%,12%)` | `hsl(150,86%,65%)` |
| warning | `hsl(64,100%,6%)` | `hsl(60,100%,9%)` | `hsl(46,87%,65%)` |
| info | `hsl(215,100%,6%)` | `hsl(223,43%,17%)` | `hsl(216,87%,65%)` |

패턴: 같은 색상(hue)에서 배경은 명도 6~10%, 텍스트는 65~81%로 뽑는 톤온톤 구성.

---

## 6. 다크모드 지원

### 결론: **홈페이지는 다크 전용, 사이트 전체는 3테마 시스템**
- 홈페이지 `<html>`에 `data-theme="dark"` + `color-scheme: dark`가 **하드코딩**되어 있고, `prefers-color-scheme: light` 미디어쿼리가 0건 — 즉 마케팅 홈은 OS 설정과 무관하게 항상 다크다.
- 그러나 CSS에는 `[data-theme="light"]`, `[data-theme="dark"]`, `[data-theme="glass"]` 셀렉터가 존재 — Docs·Changelog 등 서브페이지와 제품 앱은 **속성 기반 테마 전환**을 지원한다.

### 테마 아키텍처
색상을 컴포넌트에 직접 쓰지 않고 **시맨틱 토큰 계층**으로 분리해, 테마 전환 시 `:root[data-theme=…]`에서 토큰 값만 갈아끼운다:

```
원시 팔레트 (--gray1~12, --color-indigo …)
        ↓
시맨틱 토큰 (--color-bg-primary, --color-text-tertiary, --color-border-translucent …)
        ↓
컴포넌트 (background: var(--color-bg-level-1))
```

### 다크 ↔ 라이트 매핑 (추출된 토큰 기준)
| 시맨틱 토큰 | 다크 (실측) | 라이트 (그레이 스케일 대응) |
|---|---|---|
| bg-primary | `#08090A` | `--gray1: hsl(0,0%,99%)` ≈ `#FCFCFC` |
| bg-secondary/tertiary | `#1C1C1F` / `#232326` | `--gray2~3: hsl(0,0%,97.3%/95.1%)` |
| text-primary | `#F7F8F8` | `--gray12: hsl(0,0%,9%)` ≈ `#171717` |
| text-tertiary | `#8A8F98` | `--gray10~11: hsl(0,0%,52.3%/43.5%)` |
| border | `#FFFFFF0D~14` (흰색 알파) | `--gray5~6: hsl(0,0%,90.9%/88.7%)` |
| accent | `#7170FF` / `#5E6AD2` | 동일 (브랜드색은 테마 불변) |

CSS에는 라이트 모드용 12단계 그레이 램프(`--gray1`~`--gray12`, Radix Colors 방식)가 함께 정의되어 있어, 라이트 테마는 이 램프를 시맨틱 토큰에 재바인딩하는 방식이다.

---

## 부록: 이 스타일을 재현할 때의 체크리스트

1. 배경은 `#000`이 아닌 `#08090A`, 텍스트는 `#FFF`가 아닌 `#F7F8F8`.
2. 경계선은 회색이 아니라 **흰색 5~8% 알파 + 0.5px 헤어라인**.
3. 표면 위계는 그림자보다 **배경 레벨(level-0~3) 상승**으로.
4. 제목은 자간을 -0.012~-0.022em으로 좁히고, 대형 제목 행간은 1.0~1.1.
5. 버튼은 32px 높이의 필(9999px) + 13px/weight 510 텍스트, Primary는 밝은 반전색.
6. 색은 전부 시맨틱 CSS 변수로 — 다크/라이트는 토큰 재바인딩으로 해결.
7. 섹션 제목(H2)조차 tertiary 회색으로 낮추고, 강조 문장만 primary 흰색으로 — 위계를 색으로 만드는 것이 Linear 룩의 핵심.