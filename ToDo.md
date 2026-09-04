# ToDo.md — 아파트 매물 추천 서비스 설계·구현 명세

> [Concept.md](Concept.md)의 서비스 기획을 기반으로 플랫폼·기술 스택을 확정하고,
> **객체지향 모듈 설계 → DB 스키마 → 의존성 순 구현 체크리스트 → 테스트 방법**까지 정리한 실행 문서.
> 작성일: 2026-09-02

## 목차
| 절 | 내용 |
|---|---|
| [0](#0-플랫폼-결정-웹-반응형-웹앱) | 플랫폼 결정과 근거 |
| [1](#1-확정-기술-스택) | 확정 기술 스택 |
| [2](#2-시스템-아키텍처--객체지향-모듈-설계) | **시스템 아키텍처 / 객체지향 모듈 설계** |
| [3](#3-모듈별-상세-명세) | **모듈별 역할·입출력·데이터구조·캡슐화** |
| [4](#4-db-스키마-설계) | **DB 스키마 설계 (Prisma)** |
| [5](#5-배포-아키텍처) | 배포 아키텍처 |
| [6](#6-구현-순서-체크리스트-의존성-없는-모듈부터) | **구현 순서 체크리스트 (의존성 순)** |
| [7](#7-비기술자-테스트-가이드) | **비기술자 테스트 가이드** |
| [8](#8-관리자-대시보드-상세-설계) | 관리자 대시보드 상세 설계 |
| [9](#9-리스크-메모) | 리스크 메모 |
| [10](#10-지금-바로-할-일-top-3) | 지금 바로 할 일 |

---

## 0. 플랫폼 결정: **웹 (반응형 웹앱)**

### 결정 근거

| 방식 | 판단 | 이유 |
|---|---|---|
| **웹 ✅** | **채택** | ① 지도+검색+목록 중심 서비스는 웹 UX가 표준 ② 링크 공유로 초기 사용자 확보 용이(설치 장벽 0) ③ 개발 확인이 가장 편함 — 코드 저장 즉시 브라우저 핫리로드, DevTools로 디버깅 ④ 반응형으로 만들면 모바일 브라우저까지 커버 ⑤ **비기술자 테스트가 URL 하나로 끝남** (7절) |
| 모바일 앱 (Flutter) | 보류 | 스토어 심사·빌드 파이프라인 비용이 MVP 검증 속도를 죽임. 알림(P2)이 중요해지는 시점에 재검토. 그 전엔 웹 푸시(PWA)로 대체 |
| 로컬 설치 (npm/uv CLI) | 부적합 | 서버가 수집·적재한 데이터를 조회하는 구조라 개인 설치형과 맞지 않음. 수집기만 CLI 성격이지만 서버 내부 배치로 충분 |

→ 사용자 규칙에 따라 **Frontend는 React**로 확정.

### Backend 필요 여부: **필요함**
- 공공 API 키를 브라우저에 노출할 수 없음 (프록시 필수)
- 실거래 데이터를 매일 배치 수집해 DB에 적재하는 서버 프로세스가 핵심 (Concept.md 4.1)
- 추천 점수 계산·필터링 쿼리는 서버 사이드가 맞음

→ 사용자 규칙에 따라 **Node.js**로 확정.

### 관리자 대시보드: **필요함**
매일 도는 배치가 있는 구조의 최대 운영 리스크는 **"수집이 조용히 실패한 걸 며칠 뒤에 아는 것"**이다.
공공 API는 키 만료·스펙 변경·일시 장애가 잦고, 그 결과가 "낡은 데이터로 추천하는" 품질 문제로 직결된다.
SSH 로그 확인은 지속 불가능하므로 **웹 관리자 대시보드를 Step 9에 정식 포함**한다. (8절 상세)

### DB: **관계형 → MariaDB**
- 단지 ↔ 면적타입 ↔ 실거래(시계열) 조인 + 범위 필터(가격·면적·연식) + 정렬 → 전형적 관계형 워크로드
- DynamoDB(키-값)는 이 데이터 모양과 맞지 않아 **미사용**. (추후 알림 큐·세션 캐시 생기면 재검토)

---

## 1. 확정 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| Frontend | **React 18 + Next.js 14 (App Router) + TypeScript** | 지도: 카카오맵 JS SDK, 차트: Recharts |
| 관리자 대시보드 | 동일 Next.js 앱의 `/admin` 라우트 그룹 | 서버사이드 세션 가드로 보호 |
| Backend API | **Node.js 20 LTS + NestJS + TypeScript** | DI 컨테이너가 2절 모듈 설계와 직결 |
| 배치 수집기 | NestJS 내 `@nestjs/schedule` cron | 별도 프로세스 분리 없이 시작 |
| 로깅 | Pino + DB 영속화 | 대시보드 조회용 |
| ORM | Prisma | MariaDB 지원, 마이그레이션 관리 |
| DB | **MariaDB 11 LTS** | 로컬: Docker, 운영: AWS RDS |
| 테스트 | Vitest(단위) + Supertest(API) + Playwright(E2E) | 7절 비기술자 테스트와 연결 |
| 모노레포 | pnpm workspace + Turborepo | |
| 로컬 환경 | Docker Compose + `setup.sh` 원커맨드 | |

### 프로젝트 구조

```
apt-finder/
├── apps/
│   ├── web/                       # Next.js 프론트엔드
│   │   └── app/
│   │       ├── (public)/          # 일반 사용자 서비스
│   │       └── admin/             # 관리자 대시보드
│   └── api/                       # NestJS 백엔드
│       └── src/
│           ├── core/              # Config·Logger·Prisma (L0)
│           ├── region/            # 지역 (L1)
│           ├── observability/     # 로그·잡이력·지표 (L1)
│           ├── admin-auth/        # 관리자 인증 (L1)
│           ├── external/          # 외부 API 어댑터 (L2)
│           ├── complex/           # 단지 도메인 (L2)
│           ├── trade/             # 실거래 도메인 (L2)
│           ├── poi/               # 입지 (L2)
│           ├── matching/          # 단지명 매칭 (L3)
│           ├── collector/         # 수집 오케스트레이션 (L3)
│           ├── search/            # 조건 검색 (L4)
│           ├── recommendation/    # 추천 엔진 (L5)
│           └── admin/             # 대시보드 API (L6)
├── packages/
│   └── shared/                    # 값 객체·DTO·상수 (L0, web+api 공용)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── scripts/
│   ├── setup.sh                   # 로컬 원커맨드 셋업
│   ├── start.command              # 비기술자용 더블클릭 실행 (macOS)
│   ├── seed-region.ts             # 법정동 코드 적재
│   ├── seed-admin.ts              # 관리자 계정
│   └── seed-demo.ts               # 데모 데이터 (API 키 없이 화면 확인)
├── docs/
│   └── TEST-CHECKLIST.md          # 비기술자 테스트 체크리스트 (7절)
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

---

## 2. 시스템 아키텍처 / 객체지향 모듈 설계

### 2.1 설계 원칙 (전 모듈 공통 규약)

| # | 원칙 | 구체적 규칙 |
|---|---|---|
| 1 | **계층 분리** | `Controller → Service → Repository → Prisma`. 역방향 참조 금지. Controller는 Prisma를 직접 알지 못한다. |
| 2 | **의존성 역전 (DIP)** | Service는 구현체가 아니라 **추상 인터페이스**(`ITradeRepository`, `IMolitClient`)에 의존. 구현은 DI로 주입. |
| 3 | **도메인 모델 순수성** | `domain/` 하위 엔티티·값 객체는 NestJS·Prisma를 import 하지 않는 **순수 TypeScript**. 단위 테스트가 DB 없이 돈다. |
| 4 | **값 객체로 원시타입 집착 제거** | 금액·면적·지역코드를 `number`/`string`로 굴리지 않고 `Money`·`Area`·`RegionCode`로 감싼다. 단위 실수(만원↔원, m²↔평)를 타입으로 차단. |
| 5 | **모듈 공개 API 최소화 (캡슐화)** | 각 모듈은 `index.ts` 배럴로 **공개할 것만** 내보낸다. Repository 구현·내부 헬퍼·Prisma 모델은 절대 노출 금지. |
| 6 | **외부 시스템 격리 (Adapter)** | 국토부·카카오 API는 인터페이스 뒤에 숨긴다 → 테스트/데모에서 `Fake` 구현으로 교체 (7절 데모 모드의 기반). |
| 7 | **부수효과 명시** | DB 쓰기·외부 호출을 하는 메서드는 Service에만 존재. 도메인 객체 메서드는 순수 계산만. |

### 2.2 계층 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│  apps/web (React)                                       │
│  ├─ (public) 검색·단지상세   ├─ admin 대시보드            │
│  └─ lib/api-client.ts  ← packages/shared 의 DTO 타입 사용 │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (REST, JSON)
┌───────────────────────────▼─────────────────────────────┐
│  apps/api (NestJS)                                      │
│                                                          │
│  [Controller]  HTTP 경계 · DTO 검증만 담당                │
│        ↓ 도메인 타입으로 변환                              │
│  [Service]     유스케이스 조합 · 트랜잭션 경계              │
│        ↓ 인터페이스 호출                                   │
│  [Repository]  ← 인터페이스(추상) / Prisma구현(구체)        │
│        ↓                                                 │
│  [Prisma]      SQL                                       │
│                                                          │
│  [Domain]  Complex, Trade, Money, Area … (순수 TS)        │
│  [Adapter] MolitClient, KakaoClient (인터페이스 뒤)        │
└───────────────────────────┬─────────────────────────────┘
                            ▼
                    MariaDB / 외부 공공 API
```

### 2.3 모듈 의존성 그래프 (위상 순서 = 구현 순서)

```
L0  packages/shared ────┐         core (Config·Logger·Prisma)
    (값 객체·DTO)       │              │
                        ▼              ▼
L1                 region        observability      admin-auth
                        │              │
                        ├──────────────┤
                        ▼              ▼
L2      external(어댑터)   complex     trade      poi
                        │      │        │          │
                        └──┬───┴────┬───┘          │
                           ▼        ▼              │
L3                    matching   collector         │
                                     │             │
                                     ▼             │
L4                              search ◄───────────┘
                                     │
                                     ▼
L5                            recommendation
                                     │
                                     ▼
L6                              admin (대시보드 API)
```

**핵심**: 화살표를 거슬러 올라가는 import는 금지. `complex`가 `search`를 알면 안 된다.
이 규칙은 ESLint `import/no-restricted-paths`로 강제한다 (Step 0에 포함).

### 2.4 모듈 목록 요약

| 계층 | 모듈 | 한 줄 역할 | 의존 |
|---|---|---|---|
| L0 | `shared` | 값 객체·DTO·상수 (web/api 공용) | 없음 |
| L0 | `core` | 설정 로딩, 로거, Prisma 연결 | 없음 |
| L1 | `region` | 지역명 → 법정동 코드 변환·검색 | core |
| L1 | `observability` | 잡 실행 이력·로그 적재·지표 집계 | core |
| L1 | `admin-auth` | 관리자 인증·세션·비밀번호 정책 | core |
| L2 | `external` | 국토부·카카오 API 어댑터 | core, shared |
| L2 | `complex` | 단지 마스터 데이터 CRUD | core, region |
| L2 | `trade` | 실거래·전월세 저장/집계 | core, complex |
| L2 | `poi` | 지하철역·학교 좌표, 거리 계산 | core, external |
| L3 | `matching` | 실거래 단지명 ↔ 단지 마스터 매칭 | complex, trade |
| L3 | `collector` | 수집 배치 오케스트레이션 | external, complex, trade, matching, observability |
| L4 | `search` | 조건 필터링 검색 | region, complex, trade |
| L5 | `recommendation` | 점수화·랭킹·추천 근거 생성 | search, trade, poi |
| L6 | `admin` | 대시보드 API (상태·지표·로그) | admin-auth, observability, collector, matching |

---

## 3. 모듈별 상세 명세

> 각 모듈은 **역할 / 공개 인터페이스 / 입력·출력 / 내부 데이터 구조 / 캡슐화(비공개) / 의존**을 명시한다.
> 공개 인터페이스에 없는 것은 모듈 외부에서 사용 금지.

---

### 3.1 `packages/shared` — 공유 커널 (L0)

**역할**: 프론트·백엔드가 공유하는 값 객체·DTO·상수. 도메인 언어의 단일 출처.

```ts
// ── 값 객체 (불변, 순수 계산만) ──────────────────────────
export class Money {                       // 금액: 내부 표현은 '만원' 정수
  private constructor(private readonly manwon: number) {}
  static fromManwon(v: number): Money;
  static fromWon(v: number): Money;
  toManwon(): number;
  toKoreanText(): string;                  // 85000 → "8억 5,000만원"
  isWithin(min: Money, max: Money): boolean;
  compare(other: Money): -1 | 0 | 1;
}

export class Area {                        // 면적: 내부 표현은 m²
  private constructor(private readonly sqm: number);
  static fromSqm(v: number): Area;
  static fromPyeong(v: number): Area;
  toSqm(): number;
  toPyeong(): number;                      // 84.97 → 25.7
  toTypeLabel(): string;                   // "84㎡ (25평)"
}

export class RegionCode {                  // 법정동코드 10자리
  private constructor(private readonly value: string);
  static parse(v: string): RegionCode;     // 형식 검증 실패 시 throw
  toString(): string;
  toSigunguCode(): string;                 // 앞 5자리 = 국토부 API 조회키
}

export class Coordinate {
  constructor(readonly lat: number, readonly lng: number);
  distanceTo(other: Coordinate): number;   // Haversine, 미터
  walkingMinutes(other: Coordinate): number; // 도보 분 (80m/분)
}

// ── DTO (API 계약, web/api 공용) ─────────────────────────
export interface SearchConditionDto {
  regionCode: string;
  priceMin?: number; priceMax?: number;    // 만원
  areaMin?: number;  areaMax?: number;     // m²
  builtAfter?: number;                     // 사용승인 연도
  minHouseholds?: number;
}
export interface ComplexSummaryDto { /* id, name, address, lat, lng, households, ... */ }
export interface RecommendationDto extends ComplexSummaryDto {
  score: number;
  reasons: string[];                       // "예산 대비 상위 15%", "역 도보 7분"
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 원시 값 (number, string) |
| 출력 | 검증된 불변 값 객체 / DTO 타입 |
| 내부 구조 | 값 객체는 `private readonly` 단일 필드 + 정적 팩토리 |
| **캡슐화** | 생성자 `private` — 반드시 `from*()` 팩토리 경유 (검증 우회 차단). 내부 단위(만원/m²)는 외부에 노출하지 않고 변환 메서드로만 제공 |
| 의존 | **없음** (프레임워크·DB 무관 순수 TS) |

---

### 3.2 `core` — 기반 인프라 (L0)

**역할**: 환경설정 검증, 로거, DB 연결. 모든 모듈이 쓰는 횡단 관심사.

```ts
export class AppConfig {                   // 기동 시 1회 검증, 실패하면 서버 시작 중단
  readonly databaseUrl: string;
  readonly molitApiKey: string;
  readonly kakaoRestKey: string;
  readonly adminSessionSecret: string;     // 미설정 시 throw
  readonly demoMode: boolean;              // true면 Fake 어댑터 사용 (7절)
  static load(env: NodeJS.ProcessEnv): AppConfig;
}

export interface ILogger {                 // Pino 래핑 — 구현 교체 가능
  info(ctx: string, msg: string, meta?: object): void;
  warn(ctx: string, msg: string, meta?: object): void;
  error(ctx: string, msg: string, err?: Error, meta?: object): void;
}

export class PrismaService extends PrismaClient implements OnModuleInit {
  onModuleInit(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 환경변수 |
| 출력 | 검증된 설정 객체 / 로거 / DB 커넥션 |
| **캡슐화** | 다른 모듈은 `process.env`를 **직접 읽지 않는다** — 반드시 `AppConfig` 경유. 이 규칙이 있어야 설정 누락을 기동 시점에 잡을 수 있다 |
| 의존 | 없음 |

---

### 3.3 `region` — 지역 (L1)

**역할**: 사용자가 입력한 지역명 문자열을 법정동 코드로 정규화한다. (Concept.md 5.1)

```ts
export interface IRegionRepository {
  findByCode(code: RegionCode): Promise<Region | null>;
  searchByKeyword(keyword: string, limit: number): Promise<Region[]>;
  findAliases(keyword: string): Promise<RegionAlias[]>;
}

export class RegionSearchService {
  /** "영통" → [수원시 영통구, 영통동] 후보 목록 (모호하면 복수 반환) */
  search(keyword: string): Promise<RegionCandidate[]>;
  /** 생활권 별칭 해석: "미사" → 하남시 망월동·풍산동·선동 */
  resolveAlias(keyword: string): Promise<RegionCode[]>;
}

// 도메인 모델 (순수)
export class Region {
  readonly code: RegionCode;
  readonly sido: string; readonly sigungu: string; readonly dong: string | null;
  fullName(): string;                      // "경기도 수원시 영통구 영통동"
  isDongLevel(): boolean;
}
export interface RegionCandidate { code: string; fullName: string; matchType: 'exact'|'partial'|'alias'; }
```

| 항목 | 내용 |
|---|---|
| 입력 | 검색어 문자열 (`"영통"`, `"미사"`) |
| 출력 | `RegionCandidate[]` — 동음이의 지역은 복수 반환해 UI에서 선택 |
| 내부 구조 | `regions` 테이블 + `region_aliases` 테이블 (별칭 → 코드 N:M) |
| **캡슐화** | `IRegionRepository` 구현체와 Prisma 모델은 비공개. 외부에는 `RegionSearchService`와 도메인 `Region`만 노출 |
| 의존 | core |

---

### 3.4 `observability` — 관측 (L1)

**역할**: 배치 실행 이력·애플리케이션 로그·운영 지표를 **DB에 남기고 조회**한다. 대시보드의 데이터 공급원.

```ts
export class JobRunRecorder {
  /** 배치를 감싸 실행: 시작·종료·건수·에러를 job_runs에 자동 기록 */
  run<T>(jobName: string, fn: (ctx: JobContext) => Promise<T>): Promise<T>;
}
export interface JobContext {
  addInserted(n: number): void;
  addUpdated(n: number): void;
  log(msg: string): void;
}

export class LogStore {                    // warn 이상만 DB 적재 (비동기 배치 flush)
  query(filter: LogFilter): Promise<Paginated<AppLog>>;
  groupedErrors(since: Date, limit: number): Promise<ErrorGroup[]>;  // 동일 메시지 그룹핑
  purgeOlderThan(days: number): Promise<number>;
}

export class ApiQuotaTracker {             // 공공 API 호출량 추적
  increment(provider: 'molit'|'kakao', count: number): Promise<void>;
  todayUsage(provider: string): Promise<{ used: number; limit: number; ratio: number }>;
}

export class MetricsService {
  dataMetrics(): Promise<DataMetrics>;     // 단지수·거래수·데이터신선도·매칭실패수
  serviceMetrics(days: number): Promise<ServiceMetrics>;  // 검색수·인기지역
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 잡 실행 콜백 / 로그 이벤트 / 집계 요청 |
| 출력 | `job_runs`·`app_logs` 레코드, 집계 지표 객체 |
| 내부 구조 | 로그는 메모리 버퍼 → 5초/100건마다 배치 INSERT (요청 지연 방지) |
| **캡슐화** | 테이블 직접 접근 금지 — 모든 기록은 `JobRunRecorder.run()`으로 감싸야 함. 이 강제가 "기록 누락된 배치"를 원천 차단 |
| 의존 | core |

---

### 3.5 `admin-auth` — 관리자 인증 (L1)

**역할**: 관리자 로그인·세션·비밀번호 정책. 서비스 사용자 인증(Phase 4 `user`)과 **완전히 분리**.

```ts
export class AdminAuthService {
  login(username: string, password: string, ip: string): Promise<LoginResult>;
  changePassword(adminId: number, current: string, next: string): Promise<void>;
  validateSession(token: string): Promise<AdminSession | null>;
  logout(token: string): Promise<void>;
}
export type LoginResult =
  | { status: 'ok'; token: string; mustChangePassword: boolean }
  | { status: 'invalid' }
  | { status: 'locked'; until: Date };

export class PasswordPolicy {               // 순수 함수 — DB 무관
  static validate(pw: string): { ok: boolean; errors: string[] };  // 10자↑, 2종↑ 문자
  static isDefaultPassword(pw: string): boolean;                   // '12345' 경고용
}
export class AdminGuard implements CanActivate { /* 모든 /admin/* 에 적용 */ }
```

| 항목 | 내용 |
|---|---|
| 입력 | username/password, 세션 토큰 |
| 출력 | 세션 토큰(httpOnly 쿠키), 인증 결과 |
| 내부 구조 | `admin_users`(bcrypt cost 12) + `admin_sessions`(토큰 해시·만료) |
| **캡슐화** | `passwordHash`는 어떤 DTO에도 포함하지 않는다. 로그인 실패 사유를 클라이언트에 세분화해 알려주지 않음(계정 존재 여부 노출 방지) |
| 의존 | core |

---

### 3.6 `external` — 외부 API 어댑터 (L2)

**역할**: 공공 API의 지저분함(XML, 인코딩, 재시도, 쿼터)을 **한 겹 안에 가둔다**. 상위 모듈은 깨끗한 타입만 본다.

```ts
export interface IMolitClient {            // 국토부 실거래가
  fetchTrades(sigunguCode: string, yearMonth: string): Promise<RawTrade[]>;
  fetchRents(sigunguCode: string, yearMonth: string): Promise<RawRent[]>;
}
export interface IComplexInfoClient {      // 공동주택 단지 정보
  fetchComplexList(sigunguCode: string): Promise<RawComplexInfo[]>;
  fetchComplexDetail(kaptCode: string): Promise<RawComplexDetail>;
}
export interface IGeocodeClient {          // 카카오 로컬
  addressToCoordinate(address: string): Promise<Coordinate | null>;
  searchPlaces(category: 'SW8'|'SC4', center: Coordinate, radiusM: number): Promise<RawPlace[]>;
}

// 구현: MolitHttpClient (운영) / FakeMolitClient (테스트·데모모드)
// AppConfig.demoMode === true 이면 DI가 Fake 구현을 주입한다.
```

| 항목 | 내용 |
|---|---|
| 입력 | 시군구코드, 계약년월, 주소 문자열 |
| 출력 | `RawTrade[]` 등 **정규화된 TS 객체** (XML·원본 필드명은 여기서 소멸) |
| 내부 구조 | XML 파서, 지수 백오프 재시도(3회), `ApiQuotaTracker` 연동, 응답 캐시 |
| **캡슐화** | HTTP 클라이언트·XML 파서·API 키는 이 모듈 밖으로 새지 않음. 상위 모듈은 인터페이스만 알기 때문에 **API 스펙이 바뀌어도 이 모듈만 수정** |
| 의존 | core, shared |

---

### 3.7 `complex` — 단지 도메인 (L2)

**역할**: 아파트 단지 마스터 데이터의 소유자.

```ts
export interface IComplexRepository {
  findById(id: number): Promise<Complex | null>;
  findByRegion(code: RegionCode): Promise<Complex[]>;
  upsertMany(items: ComplexUpsertInput[]): Promise<{ inserted: number; updated: number }>;
  updateNearestPoi(id: number, subwayM: number, schoolM: number): Promise<void>;
}

export class Complex {                     // 순수 도메인 모델
  readonly id: number;
  readonly name: string;
  readonly regionCode: RegionCode;
  readonly coordinate: Coordinate;
  readonly households: number;
  readonly approvalDate: Date;
  readonly parkingPerHousehold: number;
  ageYears(asOf: Date): number;
  isLargeScale(): boolean;                 // 세대수 500↑
  qualityScore(): number;                  // 0~1, 세대수·연식·주차 (순수 계산)
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 단지 ID / 지역코드 / 수집기가 넘긴 upsert 입력 |
| 출력 | `Complex` 도메인 객체 |
| 내부 구조 | `complexes` + `area_types` 테이블 |
| **캡슐화** | `qualityScore()` 같은 판단 로직을 Service가 아닌 **도메인 객체 안**에 둔다 → 추천 모듈이 규칙을 복제하지 않음 |
| 의존 | core, region |

---

### 3.8 `trade` — 실거래 도메인 (L2)

**역할**: 실거래·전월세 이력 저장과 통계 집계. **가격에 관한 모든 계산의 단일 창구.**

```ts
export interface ITradeRepository {
  bulkUpsert(trades: TradeUpsertInput[]): Promise<{ inserted: number; updated: number }>;
  findByComplex(complexId: number, area?: Area, limit?: number): Promise<Trade[]>;
  latestContractDate(): Promise<Date | null>;      // 데이터 신선도 지표
}

export class TradeStatsService {
  /** 이상치 제외 중위가 — 필터링·추천의 기준가 */
  medianPrice(complexId: number, area: Area, months: number): Promise<Money | null>;
  priceTrend(complexId: number, area: Area): Promise<TrendPoint[]>;
  liquidity(complexId: number, households: number): Promise<number>;  // 연 거래량÷세대수
  jeonseRatio(complexId: number, area: Area): Promise<number | null>;
}

export class Trade {
  readonly price: Money; readonly area: Area; readonly contractedAt: Date;
  readonly floor: number; readonly isCanceled: boolean;
  pricePerPyeong(): Money;
  isOutlier(median: Money): boolean;        // 중위가 ±40% 밖 → 추세 계산 제외
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 단지ID + 면적 + 기간 |
| 출력 | `Money`, `TrendPoint[]`, 비율 숫자 |
| 내부 구조 | `trades`·`rents` 테이블, 집계 결과 5분 인메모리 캐시 |
| **캡슐화** | **가격 집계 SQL은 이 모듈 밖에 존재하면 안 된다.** 이상치 기준이 바뀔 때 한 곳만 고치기 위함 |
| 의존 | core, complex |

---

### 3.9 `poi` — 입지 (L2)

**역할**: 지하철역·초등학교 좌표를 적재하고 **단지별 최근접 거리를 배치에서 사전 계산**한다.

```ts
export class PoiCollectService { collectForRegion(code: RegionCode): Promise<number>; }
export class DistanceCalculator {
  /** 배치 전용: 계산 결과를 complexes.nearest_* 컬럼에 캐시 (실시간 공간조인 회피) */
  precomputeForRegion(code: RegionCode): Promise<{ updated: number }>;
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 지역코드 |
| 출력 | `complexes.nearest_subway_m` / `nearest_school_m` 갱신 건수 |
| **캡슐화** | 거리 공식(Haversine)은 `Coordinate` 값 객체 안에만 존재 |
| 의존 | core, external, complex |

---

### 3.10 `matching` — 단지명 매칭 (L3) ⚠ 최대 난관

**역할**: 실거래 API의 단지명 표기와 단지정보 API의 단지명을 연결한다. (`"래미안OO 1차"` vs `"래미안OO(1차)"`)

```ts
export class ComplexMatcher {
  /** 3단계: ①정규화 완전일치 ②법정동+건축년도+유사도 ③실패 → match_failures 적재 */
  match(raw: RawTradeIdentity): Promise<MatchResult>;
  static normalize(name: string): string;   // 공백·괄호·차수 표기 통일 (순수 함수)
  static similarity(a: string, b: string): number;  // 0~1, Levenshtein 기반
}
export type MatchResult =
  | { status: 'matched'; complexId: number; confidence: number }
  | { status: 'ambiguous'; candidates: { complexId: number; score: number }[] }
  | { status: 'failed'; reason: string };

export class MatchFailureService {          // 관리자 수동 보정용
  listPending(page: number): Promise<Paginated<MatchFailure>>;
  resolve(failureId: number, complexId: number): Promise<void>;  // 보정 결과를 사전에 학습
}
```

| 항목 | 내용 |
|---|---|
| 입력 | `{ 법정동코드, 단지명, 건축년도 }` |
| 출력 | `MatchResult` |
| 내부 구조 | `match_failures` 테이블 + `match_overrides`(수동 보정 사전) |
| **캡슐화** | `normalize`/`similarity`는 **정적 순수 함수** → DB 없이 단위 테스트로 규칙 검증 가능 (여기가 버그 최다 발생 지점이므로 테스트 최우선) |
| 의존 | complex, trade |

---

### 3.11 `collector` — 수집 오케스트레이션 (L3)

**역할**: "언제·무엇을·어떤 순서로" 수집할지 결정. 실제 파싱·저장은 하위 모듈에 위임.

```ts
export class CollectionOrchestrator {
  /** 매일 06:00 cron — 최근 2개월 증분 */
  runDailyIncremental(): Promise<CollectionReport>;
  /** 관리자 수동 트리거 — 지역·기간 지정 */
  runBackfill(regionCodes: RegionCode[], from: YearMonth, to: YearMonth): Promise<CollectionReport>;
}
export interface CollectionReport {
  jobRunId: number; regionsProcessed: number;
  tradesInserted: number; tradesUpdated: number;
  matchFailures: number; errors: string[];
}
```

| 항목 | 내용 |
|---|---|
| 입력 | (cron 자동) 또는 관리자 지정 지역·기간 |
| 출력 | `CollectionReport` + `job_runs` 레코드 |
| 내부 구조 | 지역 단위 순차 처리, 지역당 실패는 격리(한 지역 실패가 전체를 중단시키지 않음), 3회 재시도 |
| **캡슐화** | 모든 실행은 `JobRunRecorder.run()`으로 감싼다. 외부에는 이 두 메서드만 노출 |
| 의존 | external, complex, trade, matching, observability, region |

---

### 3.12 `search` — 조건 검색 (L4)

**역할**: 사용자 조건(예산·면적·연식·세대수)으로 단지를 필터링한다. **하드 필터 전담** (점수화는 recommendation).

```ts
export class ComplexSearchService {
  search(cond: SearchCondition): Promise<Paginated<ComplexSummaryDto>>;
}
export class SearchCondition {              // 값 객체 — 생성 시 검증
  static from(dto: SearchConditionDto): SearchCondition;  // 잘못된 범위면 throw
  readonly regionCodes: RegionCode[];
  readonly priceRange: Range<Money>;
  readonly areaRange: Range<Area>;
  readonly minBuiltYear?: number;
  readonly minHouseholds?: number;
  toCacheKey(): string;
}
```

| 항목 | 내용 |
|---|---|
| 입력 | `SearchConditionDto` (HTTP 쿼리에서 파싱) |
| 출력 | `Paginated<ComplexSummaryDto>` — 각 단지의 최근 6개월 중위가 포함 |
| 내부 구조 | 단지 + 중위가 조인 쿼리, 조건 조합별 5분 캐시 |
| **캡슐화** | Controller는 raw 쿼리스트링을 `SearchCondition.from()`에 넘길 뿐, 필터 규칙을 알지 못함 |
| 의존 | region, complex, trade |

---

### 3.13 `recommendation` — 추천 엔진 (L5)

**역할**: 필터링 결과를 점수화·랭킹하고 **사람이 읽는 추천 근거**를 만든다. (Concept.md 5.2)

```ts
export class RecommendationService {
  recommend(cond: SearchCondition, preset: PresetName): Promise<RecommendationDto[]>;
}
export type PresetName = 'value' | 'location' | 'newbuild';   // 가성비·입지·신축

export class ScoringPolicy {                // 순수 계산 — DB 무관, 단위 테스트 용이
  constructor(private readonly weights: ScoreWeights);
  static preset(name: PresetName): ScoringPolicy;
  score(input: ScoreInput): ScoreBreakdown;
}
export interface ScoreInput {               // 필요한 값만 받는다 (DB 엔티티를 통째로 넘기지 않음)
  medianPrice: Money; budget: Range<Money>;
  liquidity: number; nearestSubwayM: number; nearestSchoolM: number;
  households: number; ageYears: number;
}
export interface ScoreBreakdown {
  total: number;                            // 0~100
  price: number; liquidity: number; location: number; quality: number;
  reasons: string[];                        // "예산 대비 상위 15%", "역 도보 7분"
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 검색 조건 + 프리셋 이름 |
| 출력 | 점수 내림차순 `RecommendationDto[]` (근거 문자열 포함) |
| 내부 구조 | 가중치 상수 테이블, 정규화 함수(각 지표 0~1 스케일링) |
| **캡슐화** | `ScoringPolicy`는 DB·HTTP를 모른다 → 가중치를 바꿔가며 순수 단위 테스트로 검증. 추천 로직 변경이 다른 계층에 파급되지 않음 |
| 의존 | search, trade, poi, complex |

---

### 3.14 `admin` — 관리자 대시보드 API (L6)

**역할**: 운영 상태를 한 화면에 모아 제공. **읽기 전용 집계 + 배치 수동 트리거**.

```ts
export class AdminDashboardService {
  health(): Promise<HealthStatus>;          // API·DB·스케줄러·쿼터
  metrics(): Promise<DashboardMetrics>;     // 데이터·서비스 지표 + 7일 추이
  logs(filter: LogFilter): Promise<Paginated<AppLog>>;
  jobHistory(limit: number): Promise<JobRun[]>;
  triggerJob(name: string, params: object, adminId: number): Promise<{ jobRunId: number }>;
}
export interface HealthStatus {
  api: { ok: boolean; uptimeSec: number; memoryMb: number };
  database: { ok: boolean; latencyMs: number; sizeMb: number };
  scheduler: { lastRunAt: Date | null; lastStatus: 'success'|'failed'; nextRunAt: Date };
  quota: { provider: string; used: number; limit: number; ratio: number }[];
  warnings: string[];                       // "기본 비밀번호 사용 중" 등
}
```

| 항목 | 내용 |
|---|---|
| 입력 | 관리자 세션 + 필터 파라미터 |
| 출력 | `HealthStatus`, `DashboardMetrics`, 로그·잡 이력 |
| **캡슐화** | 이 모듈은 **다른 모듈의 공개 서비스만 호출**한다. Prisma 직접 조회 금지 → 대시보드가 도메인 규칙을 우회해 잘못된 숫자를 보여주는 일 방지 |
| 의존 | admin-auth, observability, collector, matching |

---

## 4. DB 스키마 설계

### 4.1 ERD

```
regions ──1:N── region_aliases
   │1
   │N
complexes ──1:N── area_types
   │1  │1  │1
   │N  │N  │N
trades  rents  complex_poi_distances ──N:1── pois
   
match_failures ──N:1── complexes (보정 후 연결)
match_overrides (수동 보정 사전)

users ──1:N── user_profiles          [Phase 4]
      └─1:N── favorite_complexes ──N:1── complexes

admin_users ──1:N── admin_sessions   [운영]
job_runs · app_logs · api_quota_usage · search_events   [독립 로그성]
```

### 4.2 Prisma 스키마

```prisma
// prisma/schema.prisma
datasource db { provider = "mysql", url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

// ─────────── 지역 ───────────
model Region {
  code        String   @id @db.Char(10)          // 법정동코드 10자리
  sigunguCode String   @map("sigungu_code") @db.Char(5)  // 국토부 API 조회키
  sido        String   @db.VarChar(20)
  sigungu     String   @db.VarChar(30)
  dong        String?  @db.VarChar(30)
  isActive    Boolean  @default(true) @map("is_active")
  complexes   Complex[]
  aliases     RegionAlias[]

  @@index([sigunguCode])
  @@index([sido, sigungu])
  @@fulltext([sido, sigungu, dong])            // 지역명 검색용
  @@map("regions")
}

model RegionAlias {
  id         Int    @id @default(autoincrement())
  alias      String @db.VarChar(30)             // "미사", "판교", "마곡"
  regionCode String @map("region_code") @db.Char(10)
  region     Region @relation(fields: [regionCode], references: [code])

  @@unique([alias, regionCode])
  @@index([alias])
  @@map("region_aliases")
}

// ─────────── 단지 ───────────
model Complex {
  id                Int      @id @default(autoincrement())
  kaptCode          String?  @unique @map("kapt_code") @db.VarChar(20)  // 공동주택 코드
  name              String   @db.VarChar(100)
  nameNormalized    String   @map("name_normalized") @db.VarChar(100)   // 매칭용 정규화명
  regionCode        String   @map("region_code") @db.Char(10)
  address           String   @db.VarChar(200)
  lat               Decimal? @db.Decimal(10, 7)
  lng               Decimal? @db.Decimal(10, 7)
  households        Int      @default(0)
  buildingCount     Int      @default(0) @map("building_count")
  approvalDate      DateTime? @map("approval_date") @db.Date            // 사용승인일
  builtYear         Int?     @map("built_year")
  parkingCount      Int      @default(0) @map("parking_count")
  heatingType       String?  @map("heating_type") @db.VarChar(30)
  nearestSubwayM    Int?     @map("nearest_subway_m")                   // 배치 사전계산 캐시
  nearestSchoolM    Int?     @map("nearest_school_m")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  region     Region      @relation(fields: [regionCode], references: [code])
  areaTypes  AreaType[]
  trades     Trade[]
  rents      Rent[]

  @@unique([regionCode, nameNormalized, builtYear], name: "uk_complex_identity")
  @@index([regionCode])
  @@index([builtYear])
  @@index([households])
  @@map("complexes")
}

model AreaType {
  id           Int     @id @default(autoincrement())
  complexId    Int     @map("complex_id")
  exclusiveSqm Decimal @map("exclusive_sqm") @db.Decimal(7, 2)   // 전용면적
  supplySqm    Decimal? @map("supply_sqm") @db.Decimal(7, 2)
  rooms        Int?
  bathrooms    Int?
  householdCnt Int?    @map("household_cnt")

  complex Complex @relation(fields: [complexId], references: [id], onDelete: Cascade)

  @@unique([complexId, exclusiveSqm])
  @@map("area_types")
}

// ─────────── 거래 ───────────
model Trade {
  id           BigInt   @id @default(autoincrement())
  complexId    Int?     @map("complex_id")            // 매칭 실패 시 null
  regionCode   String   @map("region_code") @db.Char(10)
  rawName      String   @map("raw_name") @db.VarChar(100)  // API 원본 단지명 (재매칭용)
  exclusiveSqm Decimal  @map("exclusive_sqm") @db.Decimal(7, 2)
  priceManwon  Int      @map("price_manwon")          // 거래금액 (만원)
  contractedAt DateTime @map("contracted_at") @db.Date
  floor        Int
  builtYear    Int?     @map("built_year")
  isCanceled   Boolean  @default(false) @map("is_canceled")  // 해제 여부
  sourceHash   String   @unique @map("source_hash") @db.Char(64) // 중복 적재 방지
  createdAt    DateTime @default(now()) @map("created_at")

  complex Complex? @relation(fields: [complexId], references: [id])

  @@index([complexId, exclusiveSqm, contractedAt])   // 중위가·추이 조회 핵심 인덱스
  @@index([regionCode, contractedAt])
  @@index([contractedAt])                            // 데이터 신선도 지표
  @@map("trades")
}

model Rent {
  id            BigInt   @id @default(autoincrement())
  complexId     Int?     @map("complex_id")
  regionCode    String   @map("region_code") @db.Char(10)
  exclusiveSqm  Decimal  @map("exclusive_sqm") @db.Decimal(7, 2)
  depositManwon Int      @map("deposit_manwon")
  monthlyManwon Int      @default(0) @map("monthly_manwon")   // 0이면 전세
  contractedAt  DateTime @map("contracted_at") @db.Date
  floor         Int
  sourceHash    String   @unique @map("source_hash") @db.Char(64)

  complex Complex? @relation(fields: [complexId], references: [id])

  @@index([complexId, exclusiveSqm, contractedAt])
  @@map("rents")
}

// ─────────── 입지 ───────────
model Poi {
  id       Int     @id @default(autoincrement())
  category String  @db.VarChar(20)              // 'subway' | 'elementary_school'
  name     String  @db.VarChar(100)
  lat      Decimal @db.Decimal(10, 7)
  lng      Decimal @db.Decimal(10, 7)
  extra    Json?                                // 노선명 등

  @@index([category])
  @@map("pois")
}

// ─────────── 매칭 ───────────
model MatchFailure {
  id           Int      @id @default(autoincrement())
  regionCode   String   @map("region_code") @db.Char(10)
  rawName      String   @map("raw_name") @db.VarChar(100)
  builtYear    Int?     @map("built_year")
  occurrences  Int      @default(1)             // 같은 실패 반복 횟수
  candidates   Json?                            // 후보 단지 목록
  resolvedId   Int?     @map("resolved_complex_id")
  resolvedAt   DateTime? @map("resolved_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@unique([regionCode, rawName, builtYear])
  @@index([resolvedAt])                         // 미처리 건 조회
  @@map("match_failures")
}

model MatchOverride {                            // 관리자 수동 보정 사전
  id         Int    @id @default(autoincrement())
  regionCode String @map("region_code") @db.Char(10)
  rawName    String @map("raw_name") @db.VarChar(100)
  complexId  Int    @map("complex_id")

  @@unique([regionCode, rawName])
  @@map("match_overrides")
}

// ─────────── 사용자 (Phase 4) ───────────
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")
  profiles  UserProfile[]
  favorites FavoriteComplex[]
  @@map("users")
}

model UserProfile {
  id            Int      @id @default(autoincrement())
  userId        Int      @map("user_id")
  name          String   @db.VarChar(50)         // "우리집 조건"
  priceMinManwon Int?    @map("price_min_manwon")
  priceMaxManwon Int?    @map("price_max_manwon")
  areaMinSqm    Decimal? @map("area_min_sqm") @db.Decimal(7, 2)
  areaMaxSqm    Decimal? @map("area_max_sqm") @db.Decimal(7, 2)
  minBuiltYear  Int?     @map("min_built_year")
  minHouseholds Int?     @map("min_households")
  preset        String   @default("value") @db.VarChar(20)
  regionCodes   Json     @map("region_codes")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("user_profiles")
}

model FavoriteComplex {
  userId    Int      @map("user_id")
  complexId Int      @map("complex_id")
  memo      String?  @db.Text
  createdAt DateTime @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, complexId])
  @@map("favorite_complexes")
}

// ─────────── 운영 ───────────
model AdminUser {
  id                 Int       @id @default(autoincrement())
  username           String    @unique @db.VarChar(50)
  passwordHash       String    @map("password_hash") @db.VarChar(60)   // bcrypt
  mustChangePassword Boolean   @default(true) @map("must_change_password")
  failedAttempts     Int       @default(0) @map("failed_attempts")
  lockedUntil        DateTime? @map("locked_until")
  lastLoginAt        DateTime? @map("last_login_at")
  createdAt          DateTime  @default(now()) @map("created_at")
  sessions           AdminSession[]
  @@map("admin_users")
}

model AdminSession {
  tokenHash String   @id @map("token_hash") @db.Char(64)
  adminId   Int      @map("admin_id")
  expiresAt DateTime @map("expires_at")
  ip        String?  @db.VarChar(45)
  createdAt DateTime @default(now()) @map("created_at")
  admin AdminUser @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId])
  @@index([expiresAt])
  @@map("admin_sessions")
}

model JobRun {
  id           Int       @id @default(autoincrement())
  jobName      String    @map("job_name") @db.VarChar(50)
  status       String    @db.VarChar(20)          // running | success | failed
  startedAt    DateTime  @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  rowsInserted Int       @default(0) @map("rows_inserted")
  rowsUpdated  Int       @default(0) @map("rows_updated")
  errorMessage String?   @map("error_message") @db.Text
  triggeredBy  String    @default("cron") @map("triggered_by") @db.VarChar(20)
  params       Json?

  @@index([jobName, startedAt])
  @@index([status])
  @@map("job_runs")
}

model AppLog {
  id        BigInt   @id @default(autoincrement())
  level     String   @db.VarChar(10)              // error | warn | info
  context   String   @db.VarChar(50)              // 'collector', 'matcher' …
  message   String   @db.Text
  messageKey String  @map("message_key") @db.Char(32)  // 그룹핑용 해시
  meta      Json?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([level, createdAt])
  @@index([messageKey, createdAt])
  @@map("app_logs")
}

model ApiQuotaUsage {
  provider String   @db.VarChar(20)
  date     DateTime @db.Date
  used     Int      @default(0)
  dailyLimit Int    @map("daily_limit")

  @@id([provider, date])
  @@map("api_quota_usage")
}

model SearchEvent {
  id         BigInt   @id @default(autoincrement())
  regionCode String   @map("region_code") @db.Char(10)
  conditions Json
  resultCount Int     @map("result_count")
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([regionCode, createdAt])
  @@index([createdAt])
  @@map("search_events")
}
```

### 4.3 스키마 설계 결정 노트

| 결정 | 이유 |
|---|---|
| 금액을 `Int` (만원 단위) | 부동산 실거래가는 만원 단위로 공시됨. 부동소수점 오차 회피 |
| `trades.sourceHash` UNIQUE | (지역+단지+면적+금액+계약일+층) 해시. **재수집 시 중복 적재를 DB 레벨에서 차단** |
| `trades.complexId` nullable | 매칭 실패해도 원본 거래는 버리지 않는다. 나중에 보정 후 연결 |
| `trades.rawName` 보존 | 매칭 규칙 개선 시 과거 데이터 재매칭 가능 |
| 좌표를 `Decimal` (POINT 미사용) | Prisma가 MySQL POINT를 네이티브 지원하지 않음. 거리는 배치 사전계산(`nearestSubwayM`)이라 공간 인덱스 불필요. 추후 필요 시 raw SQL 마이그레이션으로 SPATIAL INDEX 추가 |
| `complexes.nameNormalized` 컬럼화 | 매칭 시 매번 정규화 연산하지 않도록 저장. 유니크 키에도 사용 |
| `appLogs.messageKey` | 동일 에러 그룹핑(대시보드 "에러 Top") 을 인덱스로 빠르게 |
| 복합 인덱스 `(complexId, exclusiveSqm, contractedAt)` | 중위가·추이 조회가 전체 트래픽의 대부분 → 커버링 인덱스 |

---

## 5. 배포 아키텍처

```
[사용자] ── Vercel (Next.js web)          # 프론트: git push = 자동 배포
              │ HTTPS
              ▼
        AWS EC2 t3.small ── docker compose (NestJS api + Caddy 리버스프록시)
              │
              ▼
        AWS RDS for MariaDB (db.t3.micro, 자동 백업 7일)
```

- **원칙: 로컬 = 운영 동일 구조.** 로컬 `docker compose up`이 EC2에서 같은 compose로 돈다.
- 프론트를 Vercel로 분리 → 프론트 배포 실수와 API 안정성 격리.
- 배치는 api 컨테이너 내부 cron. 시크릿은 로컬 `.env`, 운영은 SSM Parameter Store.
- **스테이징 환경을 Step 8에서 먼저 띄운다** — 비기술자 테스트가 URL만으로 가능해지는 시점 (7절).

---

## 6. 구현 순서 체크리스트 (의존성 없는 모듈부터)

> 2.3절 의존성 그래프의 **위상 정렬 순서**. 같은 Step 안의 항목은 서로 독립이라 병렬 진행 가능.
> 🧪 = 비기술자가 직접 확인할 수 있는 지점 (7절 참조)

### Step 0 — 리포지토리·개발환경 (의존 없음, 1~2일)

> **진행 메모 (2026-09-04)**: 브랜치 `feat/step0-monorepo-setup`.
> Node.js v24.20.0 설치 후 **실행 검증 완료** — `pnpm install` / `lint` / `typecheck` / `test` / `build` 전부 통과,
> web(3000)·api(4000) 기동 및 화면 확인 완료. 계층 위반 ESLint 규칙도 위반 코드로 실제 차단 확인.
> Docker 미설치로 **MariaDB 연결만 미검증** (Step 2 에서 필요).
>
> 로컬 환경 메모: `/usr/local/bin` 이 root 소유라 `corepack enable` 이 권한 오류를 낸다.
> `setup.sh` 가 자동으로 `~/.local/bin` 에 pnpm 을 설치하고 PATH 를 잡도록 처리했다.

- [x] pnpm workspace 모노레포 초기화 (`apps/web`, `apps/api`, `packages/shared`)
- [x] `docker-compose.yml` — MariaDB 11 (포트 3306, 볼륨 영속화, healthcheck)
- [~] Prisma 초기화 (스키마 파일 작성 완료) / **MariaDB 연결 확인은 미완** — Node.js·Docker 설치 후 검증
- [x] ESLint + Prettier + tsconfig 공통 설정
- [x] **ESLint `import/no-restricted-paths` 규칙 추가** — 2.3 의존성 그래프 역방향 import 차단
- [x] Vitest 설정 (단위 테스트가 DB 없이 도는지 확인)
- [x] `.env.example` (`DATABASE_URL`, `MOLIT_API_KEY`, `KAKAO_REST_KEY`, `KAKAO_JS_KEY`, `ADMIN_SESSION_SECRET`, `DEMO_MODE`)
- [x] `scripts/setup.sh` (아래 전문)
- [x] `scripts/start.command` — macOS 더블클릭 실행용 래퍼 (비기술자용)
- [x] `pnpm dev` 루트 스크립트 (turbo로 web+api 동시 기동)
- [x] README에 `git clone → ./scripts/setup.sh → pnpm dev` 3줄 온보딩

```bash
#!/usr/bin/env bash
# scripts/setup.sh — 로컬 개발환경 원커맨드 셋업
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/6 필수 도구 확인"
command -v docker >/dev/null || { echo "Docker Desktop을 설치하세요: https://docker.com"; exit 1; }
command -v node   >/dev/null || { echo "Node.js 20 LTS를 설치하세요: https://nodejs.org"; exit 1; }
node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)' \
  || { echo "Node.js 20 이상이 필요합니다 (현재: $(node -v))"; exit 1; }
corepack enable && corepack prepare pnpm@latest --activate

echo "==> 2/6 환경변수 파일 생성"
[ -f .env ] || { cp .env.example .env; echo "⚠ .env에 API 키를 채워주세요 (없으면 DEMO_MODE=true로 데모 실행 가능)"; }

echo "==> 3/6 의존성 설치"
pnpm install

echo "==> 4/6 MariaDB 기동"
docker compose up -d db
until docker compose exec -T db healthcheck.sh --connect >/dev/null 2>&1; do
  echo "   MariaDB 기동 대기 중..."; sleep 2
done

echo "==> 5/6 DB 마이그레이션 + 시드"
pnpm prisma migrate dev
pnpm tsx scripts/seed-region.ts    # 법정동 코드
pnpm tsx scripts/seed-admin.ts     # 관리자 계정 (admin / 12345)
if grep -q '^DEMO_MODE=true' .env; then
  pnpm tsx scripts/seed-demo.ts    # 데모 데이터 (API 키 없이 화면 확인)
fi

echo "==> 6/6 완료!"
echo "  개발 서버 실행:  pnpm dev"
echo "  서비스 화면:     http://localhost:3000"
echo "  관리자 대시보드: http://localhost:3000/admin  (admin / 12345 → 최초 로그인 시 변경)"
echo "  DB 콘솔:        pnpm prisma studio"
```

- [x] `scripts/seed-admin.ts` — 기본 관리자 계정 (멱등)

```ts
// scripts/seed-admin.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? '12345';

  if (await prisma.adminUser.findUnique({ where: { username } })) {
    console.log(`관리자 계정 '${username}' 이미 존재 — 건너뜁니다.`);
    return;
  }
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,          // 최초 로그인 시 변경 강제
    },
  });
  console.log(`관리자 계정 생성: ${username} / ${password}`);
  console.log('⚠ 최초 로그인 시 비밀번호를 반드시 변경하세요.');
}
main().finally(() => prisma.$disconnect());
```

**🧪 테스트 지점 M1**: `./scripts/setup.sh` 실행 → 브라우저에서 화면이 뜨는가

---

### Step 1 — `packages/shared` + `core` (의존 없음, 3~4일)

> **진행 메모 (2026-09-04)**: 브랜치 `feat/step1-value-objects-core`. 검증 완료.
> 테스트 97개 통과 / 값 객체·AppConfig·errors 커버리지 100%.
> `logger`·`PrismaService`·컨트롤러는 NestJS DI·DB 가 필요해 단위 테스트 대신
> **실제 서버 기동으로 확인**했다 (`/api/health` 200, DB 미연결 시 degraded 응답).
>
> 구현 중 확정한 사항:
> - `Area.toTypeLabel()` 은 반올림이 아니라 **내림** — "84.97㎡ → 84타입" 이라는 한국 관례에 맞춘다.
> - `DEMO_MODE` 는 `TRUE`/`1`/`yes` 도 참으로 읽는다 — .env 표기 하나로 엉뚱한 오류를 만나지 않게.
> - Prisma 임시 모델명을 `HealthCheck` → `PlaceholderUntilStep2` 로 변경. 생성된 델리게이트가
>   `PrismaService.healthCheck()` 와 이름 충돌했다.
> - `apps/api` 에서 ESLint `consistent-type-imports` 를 껐다. `import type` 으로 바뀌면
>   NestJS 가 의존성을 주입하지 못해 서버가 죽는다.

- [x] 값 객체 `Money` — 만원/원 변환, 한국어 표기(`"8억 5,000만원"`), 범위 비교
- [x] 값 객체 `Area` — m²/평 변환, 타입 라벨
- [x] 값 객체 `RegionCode` — 10자리 검증, 시군구코드 추출
- [x] 값 객체 `Coordinate` — Haversine 거리, 도보 분 환산
- [x] 공용 DTO 인터페이스 (`SearchConditionDto`, `ComplexSummaryDto`, `RecommendationDto`)
- [x] `AppConfig.load()` — 필수 환경변수 누락 시 **기동 실패**
- [x] `ILogger` (Pino 구현) / `PrismaService` (+ `healthCheck()`)
- [x] **단위 테스트**: 값 객체 변환·경계값 (DB 불필요, 여기서 100% 커버리지 목표)

---

### Step 2 — DB 스키마 확정 (`core` 의존, 2~3일)

> **진행 메모 (2026-09-04)**: 브랜치 `feat/step2-db-schema`.
> Docker Desktop 설치 후 MariaDB 11 기동 → 마이그레이션 `20260904105200_init` 적용 완료 (테이블 19개).
> `/api/health` 가 `database.ok: true` 로 응답.
>
> 확인·확정한 사항:
> - MariaDB 에서 `@@fulltext` 인덱스 정상 생성됨 (regions).
> - EXPLAIN 검증: 중위가 조회가 `(complex_id, exclusive_sqm, contracted_at)` 복합 인덱스를
>   range 스캔으로 사용(표본 5,000건 중 309건만 접근), 정렬 추가 비용 없음.
>   `MAX(contracted_at)` 은 `Select tables optimized away` 로 O(1).
> - `prisma migrate dev` 는 shadow DB 생성 권한이 필요해 `docker/mariadb-init/01-grant-dev.sql` 추가.
>   **로컬 전용**이다 — 운영은 `migrate deploy` 라 shadow DB 가 필요 없다.
> - 이 Mac 은 `/usr/local/bin` 이 root 소유라 pnpm·docker CLI 가 사용자 폴더에 설치된다.
>   `setup.sh` / `start.command` 가 `~/.local/bin`·`~/.docker/bin` 을 PATH 에 넣도록 처리.
>
> **법정동 코드 적재 결과** (code.go.kr, 2026-09-04 기준 자료):
> - 원본 53,388줄 → 리(里) 제외 14,143건 적재. 시도 25 / 시군구 512 / 읍면동 13,606.
>   폐지분 포함(`is_active=false`) — 과거 코드로 들어온 실거래 데이터를 버리지 않기 위함.
> - 생활권 별칭 19건 연결(미사·판교·광교·마곡·상암·목동·잠실·반포·대치), 누락 0건.
> - **발견·수정한 버그**: 세종특별자치시의 시군구 단계 행이 `sigungu` 빈 값으로 들어갔다.
>   이 행이 국토부 API 조회키(`36110`)를 담고 있어 그대로 뒀으면 세종시 수집이 통째로 누락된다.
> - 실데이터로 확인한 사항:
>   · "신정동"은 양천구·마포구·울산 남구·정읍시·남원시 **5곳**에 존재 (ToDo.md 5.1 의 양주시 예시는 실제로는 없음).
>     동음이의 처리는 예상보다 더 중요하다.
>   · 2026년 기준 자료에 `전남광주통합특별시`가 존재하고 광주광역시·전라남도는 폐지 상태다.
>     행정구역 통폐합이 실제로 일어나므로 시드는 이름 변경도 갱신하도록 만들었다.

- [x] 4.2절 Prisma 스키마 전체 작성
- [x] `prisma migrate dev` — 초기 마이그레이션 생성
- [x] `scripts/seed-region.ts` — 법정동 코드 14,143건 적재 완료 + 생활권 별칭 19건 연결
- [x] 인덱스 검증: `EXPLAIN`으로 중위가 조회 쿼리가 복합 인덱스를 타는지 확인
- [x] `pnpm prisma studio`로 테이블 구조 육안 확인

**🧪 테스트 지점 M2**: Prisma Studio에서 법정동 데이터가 들어왔는지 확인

---

### Step 3 — L1 모듈 (병렬 가능, 1주)

**3-A. `region`**
- [ ] `IRegionRepository` 인터페이스 + Prisma 구현
- [ ] `RegionSearchService.search()` — 부분일치 + 동음이의 후보 반환
- [ ] `resolveAlias()` — 생활권 별칭("미사", "판교") → 법정동 집합
- [ ] `GET /regions/search?q=` 컨트롤러
- [ ] 단위 테스트: "신정동"(양천구/양주시) 같은 동음이의 케이스

**3-B. `observability`**
- [ ] `JobRunRecorder.run()` — 잡을 감싸 `job_runs` 자동 기록 (성공/실패/건수)
- [ ] `LogStore` — warn 이상 버퍼링 후 배치 INSERT, 그룹핑 조회, 30일 purge cron
- [ ] `ApiQuotaTracker` — 일별 호출량 카운터
- [ ] `MetricsService` — 데이터/서비스 지표 집계 쿼리

**3-C. `admin-auth`**
- [ ] `PasswordPolicy` (순수 함수, 단위 테스트)
- [ ] `AdminAuthService` — 로그인/세션/비밀번호 변경/잠금
- [ ] `AdminGuard` + `@nestjs/throttler` rate limit
- [ ] `POST /admin/auth/{login,logout,change-password}`

---

### Step 4 — L2 모듈 (병렬 가능, 1.5주)

**4-A. `external` (어댑터)**
- [ ] `IMolitClient` 인터페이스 + `MolitHttpClient` (XML 파싱, 3회 백오프 재시도)
- [ ] `IComplexInfoClient` + 구현
- [ ] `IGeocodeClient` + 카카오 구현
- [ ] **`FakeMolitClient` / `FakeGeocodeClient`** — 고정 샘플 응답 (테스트·데모 모드)
- [ ] `AppConfig.demoMode`에 따라 DI가 Fake를 주입하도록 모듈 설정
- [ ] `ApiQuotaTracker` 연동

**4-B. `complex`**
- [ ] `IComplexRepository` + Prisma 구현 (`upsertMany` 벌크)
- [ ] 도메인 모델 `Complex` (+ `qualityScore()`, `ageYears()`)
- [ ] `GET /complexes/:id` 컨트롤러

**4-C. `trade`**
- [ ] `ITradeRepository` + `bulkUpsert` (sourceHash 기반 중복 차단)
- [ ] 도메인 모델 `Trade` (+ `pricePerPyeong()`, `isOutlier()`)
- [ ] `TradeStatsService` — 중위가/추이/유동성/전세가율
- [ ] 단위 테스트: 이상치 제외 중위가 계산

**4-D. `poi`** *(Step 5 이후로 미뤄도 무방 — 추천 단계에서 필요)*
- [ ] POI 수집 + `DistanceCalculator.precomputeForRegion()`

---

### Step 5 — L3 모듈 (1.5주)

**5-A. `matching`** ⚠ 최대 난관 — 여기에 테스트를 가장 많이 쓴다
- [ ] `ComplexMatcher.normalize()` — 공백·괄호·차수 표기 통일 (순수 함수)
- [ ] `similarity()` — Levenshtein 기반
- [ ] 3단계 매칭 파이프라인 + `match_failures` 적재
- [ ] `MatchOverride` 사전 우선 적용
- [ ] 단위 테스트: 실제 표기 변형 30건 이상 케이스 (`"래미안OO 1차"` ↔ `"래미안OO(1차)"`)

**5-B. `collector`**
- [ ] `CollectionOrchestrator.runDailyIncremental()` — 최근 2개월 증분
- [ ] `runBackfill()` — 지역·기간 지정 (관리자 트리거용)
- [ ] 지역 단위 실패 격리 (한 지역 실패가 전체 중단시키지 않음)
- [ ] cron 등록 (매일 06:00), 모든 실행을 `JobRunRecorder.run()`으로 감싸기
- [ ] **검증: 관심 지역 1개 구 3년치 수집 → 국토부 공개시스템 웹 조회와 표본 대조**

**🧪 테스트 지점 M3**: 데이터가 실제와 맞는지 대조 (7절에 비기술자용 대조 방법 명시)

---

### Step 6 — L4 `search` + 프론트 MVP (2주)

**API**
- [ ] `SearchCondition.from()` 값 객체 (범위 검증)
- [ ] `ComplexSearchService.search()` — 조건 필터 + 중위가 조인
- [ ] `GET /complexes?regionCode=&priceMin=…`
- [ ] `GET /complexes/:id/trades?area=` (페이지네이션)
- [ ] `search_events` 기록 훅

**Web (React)**
- [ ] `lib/api-client.ts` — `packages/shared` DTO 타입 사용
- [ ] 지역 검색 입력 (자동완성 + 동음이의 선택 UI)
- [ ] 조건 입력 패널 (URL 쿼리 직렬화 → 공유 가능한 검색 링크)
- [ ] 결과 화면: 좌측 단지 목록 + 우측 카카오맵 (마커에 최근 실거래가)
- [ ] 단지 상세: 실거래 추이 차트(Recharts) + 단지 스펙
- [ ] 반응형 (모바일: 지도/목록 탭 전환)
- [ ] 디자인: [Design.md](Design.md) 토큰 시스템 적용
- [ ] Playwright E2E: 검색 → 목록 → 상세 시나리오

**🧪 테스트 지점 M4**: 실제 매수 검토 시나리오로 서비스 사용

---

### Step 7 — L5 `recommendation` (1.5주)

- [ ] `ScoringPolicy` — 가중치 기반 점수화 (순수 클래스, DB 무관)
- [ ] 프리셋 3종 (`value` / `location` / `newbuild`)
- [ ] `ScoreBreakdown.reasons` — 사람이 읽는 추천 근거 문자열 생성
- [ ] `GET /recommendations?regionCode=&preset=`
- [ ] 전세가율 표시, 이상치 제외 추세선
- [ ] 단위 테스트: 동일 입력에 프리셋만 바꿔 순위가 의도대로 바뀌는지

**🧪 테스트 지점 M5**: 추천 결과가 납득되는지 (사람 판단과 비교)

---

### Step 8 — 배포 + 스테이징 (1주) ★ 비기술자 테스트가 쉬워지는 분기점

- [ ] `Dockerfile` (api) — multi-stage, node:20-slim
- [ ] `docker-compose.prod.yml` — api + Caddy(자동 HTTPS)
- [ ] AWS RDS for MariaDB(db.t3.micro, 백업 7일) + EC2 t3.small 프로비저닝
- [ ] `scripts/deploy.sh` — build → ECR push → ssh pull & up
- [ ] Vercel에 `apps/web` 연결
- [ ] SSM Parameter Store에 시크릿 등록 (`ADMIN_SESSION_SECRET`은 로컬과 다른 값)
- [ ] **스테이징 URL 발급** — 비기술자가 설치 없이 접속할 주소
- [ ] GitHub Actions: PR 시 lint+test, main 머지 시 자동 배포
- [ ] `prisma migrate deploy`를 배포 스크립트 첫 단계로 고정
- [ ] 모니터링: CloudWatch 로그 + 배치 실패 알림(SNS→이메일) + UptimeRobot

**🧪 테스트 지점 M6**: URL 하나로 아무나 테스트 가능 (설치 불필요)

---

### Step 9 — L6 `admin` 대시보드 (1.5주)

- [ ] `GET /admin/health` — API·DB·스케줄러·쿼터 상태
- [ ] `GET /admin/metrics` — 지표 집계 (무거운 쿼리 5분 캐시)
- [ ] `GET /admin/logs?level=&q=&page=`
- [ ] `GET /admin/jobs` / `POST /admin/jobs/:name/run` (수동 트리거)
- [ ] `/admin/login`, `/admin/password` (최초 로그인 시 강제 진입)
- [ ] `/admin` 개요 화면 — 서버상태 / 핵심지표 / 최근 로그·에러 (8절 레이아웃)
- [ ] `/admin/jobs` — 배치 수동 실행 UI
- [ ] `/admin/matches` — 매칭 실패 수동 보정 UI (`MatchOverride` 학습)
- [ ] 30초 자동 새로고침 + 기본 비밀번호 경고 배너
- [ ] **운영 첫 배포 직후 관리자 비밀번호 변경** (기본값 `12345`는 로컬 전용)

**🧪 테스트 지점 M7**: 비기술자도 "지금 서비스가 정상인가"를 대시보드로 판단

---

### Step 10 — Phase 4 사용자 계정 (1~2주)
- [ ] NextAuth (이메일 매직링크 또는 카카오 OAuth)
- [ ] 조건 프로필 저장/불러오기 (`user_profiles`)
- [ ] 관심 단지 저장 + 비교함

### Step 11 — 확장 (지속)
- [ ] 신규 실거래 알림 — 웹 푸시(PWA) → 수요 확인 후 Flutter 재검토
- [ ] 수집 범위 전국 확대 + 공공데이터포털 운영계정 전환
- [ ] 트래픽 증가 시 배치 수집기 별도 컨테이너 분리

---

## 7. 비기술자 테스트 가이드

> **원칙**: 비기술자에게 "터미널을 열어라"라고 요구하지 않는다.
> Step 8(스테이징 배포) 이후로는 **URL 접속만으로** 모든 테스트가 가능해야 한다.
> 그 이전(로컬 단계)에는 **더블클릭 실행 + 데모 데이터**로 진입 장벽을 없앤다.

### 7.1 테스트 시점 로드맵

| 시점 | 언제 | 무엇을 확인 | 어떻게 (비기술자 기준) | 합격 기준 |
|---|---|---|---|---|
| **M1** | Step 0 완료 | 프로그램이 켜지는가 | `start.command` 더블클릭 → 브라우저 자동 열림 | 빈 화면이라도 에러 없이 페이지가 뜬다 |
| **M2** | Step 2 완료 | 지역 데이터가 들어왔는가 | 검색창에 "강남" 입력 | 지역 후보 목록이 나온다 |
| **M3** | Step 5 완료 | **데이터가 진짜와 맞는가** | 아래 7.3 대조 절차 | 표본 10건이 국토부 공개시스템과 일치 |
| **M4** | Step 6 완료 | 서비스가 쓸 만한가 | 7.4 시나리오 테스트 | 5개 시나리오 모두 통과 |
| **M5** | Step 7 완료 | 추천이 납득되는가 | 7.5 추천 품질 평가 | 상위 10곳 중 7곳 이상 "이해된다" |
| **M6** | **Step 8 완료** | 어디서나 접속되는가 | **스테이징 URL을 폰·PC에서 열기** | 설치 없이 동작. 이 시점부터 지인 테스트 가능 |
| **M7** | Step 9 완료 | 운영 상태를 알 수 있는가 | `/admin` 로그인 후 신호등 확인 | 초록/빨강으로 정상 여부 판단 가능 |

### 7.2 비기술자를 위해 **개발에 포함해야 할 장치** (구현 항목)

이 항목들은 "있으면 좋은 것"이 아니라 위 테스트를 가능하게 하는 **필수 구현물**이다.

- [ ] **`scripts/start.command`** (Step 0) — macOS에서 더블클릭하면 Docker·서버 기동 후 브라우저를 자동으로 여는 래퍼

```bash
#!/usr/bin/env bash
# scripts/start.command — 더블클릭 실행용 (터미널 지식 불필요)
cd "$(dirname "$0")/.."
echo "부동산 추천 서비스를 시작합니다. 창을 닫지 마세요."
./scripts/setup.sh || { echo "설치 중 문제가 발생했습니다. 이 창 내용을 개발자에게 보내주세요."; read; exit 1; }
pnpm dev &
sleep 8 && open http://localhost:3000
wait
```

- [ ] **데모 모드** (Step 4-A) — `.env`에 `DEMO_MODE=true`면 공공 API 키 없이 `Fake*Client` + `seed-demo.ts` 샘플 데이터로 전체 화면이 동작. **API 승인 전에도 화면 테스트 가능**
- [ ] **`docs/TEST-CHECKLIST.md`** — 아래 7.4 시나리오를 체크박스 표로 만든 문서. 테스터가 이 파일만 보고 진행
- [ ] **사람이 읽는 상태 배너** (Step 9) — `/admin` 최상단에 "정상 / 확인 필요 / 문제 발생" 3단계 한국어 문장. JSON·로그를 읽게 하지 않는다
- [ ] **버그 리포트 양식** — 화면 우하단 "문제 신고" 버튼 → 현재 URL·검색조건·스크린샷을 자동 첨부해 이슈 생성 (Step 6)
- [ ] **스테이징 URL** (Step 8) — 테스트 전용 주소. 운영 데이터와 분리

### 7.3 M3: 데이터 정확성 대조 절차 (비기술자용)

> 이 서비스의 신뢰도는 전부 데이터 정확성에 달려 있다. 개발자가 아닌 사람이 검증할 수 있어야 한다.

1. 서비스에서 아무 단지나 열어 **실거래 내역 10건**을 화면에 띄운다.
2. 다른 탭에서 [국토교통부 실거래가 공개시스템](https://rt.molit.go.kr)에 접속해 같은 단지를 조회한다.
3. **계약일 / 전용면적 / 층 / 거래금액** 4개 항목을 한 줄씩 눈으로 대조한다.
4. `docs/TEST-CHECKLIST.md`의 표에 일치 여부를 O/X로 기록한다.
5. **1건이라도 틀리면 불합격** — 개발자에게 단지명과 틀린 줄을 그대로 전달한다.

추가 확인:
- 화면의 "최근 실거래가"가 **가장 최근 계약일** 기준인가
- 해제(취소)된 거래가 목록에 섞여 있지 않은가

### 7.4 M4: 서비스 시나리오 테스트 (5개)

| # | 시나리오 | 조작 | 합격 기준 |
|---|---|---|---|
| 1 | 지역 검색 | 검색창에 "영통" 입력 | 후보가 뜨고, 하나 고르면 결과가 나온다 |
| 2 | 예산 필터 | 예산 5억~7억 설정 | 목록의 모든 가격이 범위 안이다 |
| 3 | 평형 필터 | 전용 84㎡ 선택 | 다른 평형이 섞이지 않는다 |
| 4 | 지도 연동 | 목록 항목 클릭 | 지도 마커가 해당 단지로 이동·강조된다 |
| 5 | 모바일 | 휴대폰으로 같은 작업 | 글자 깨짐·가로 스크롤 없이 조작 가능 |

**측정도 함께 기록**: 검색 후 결과가 뜨기까지 **3초를 넘으면 불합격**으로 표시.

### 7.5 M5: 추천 품질 평가 (사람 판단 대조)

1. 본인이 잘 아는 지역 1곳을 고른다.
2. 추천을 받기 **전에**, 그 지역에서 자기가 생각하는 좋은 단지 5곳을 종이에 적는다.
3. 서비스에서 같은 조건으로 추천을 받는다.
4. 대조:
   - 내가 적은 5곳 중 추천 상위 20위 안에 **3곳 이상** 들어오는가
   - 추천 상위 10곳 중 "왜 이게?" 싶은 곳이 **3곳 미만**인가
   - 각 단지의 **추천 근거 문장이 사실과 맞는가** ("역 도보 7분" → 실제 그런가)
5. 어긋난 항목은 프리셋(가성비/입지/신축)을 바꿔가며 재확인 → 가중치 조정 근거로 개발자에게 전달

### 7.6 M7: 운영 상태 확인 (매일 30초)

`/admin` 접속 후 위에서부터 3가지만 본다:

| 보는 곳 | 정상 | 이상 시 행동 |
|---|---|---|
| 서버 상태 4칸 | 모두 초록 | 빨강이 있으면 개발자에게 스크린샷 전달 |
| 최신 실거래 계약일 | 오늘 기준 3일 이내 | 3일 넘게 멈춰 있으면 수집 장애 — 즉시 알림 |
| 최근 로그/에러 | ERROR 없음 | ERROR가 있으면 메시지 복사해 전달 |

---

## 8. 관리자 대시보드 상세 설계

### 화면 구성 (`/admin`)

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ 기본 비밀번호를 사용 중입니다. 지금 변경하세요.  [변경하기]    │ ← 미변경 시에만 노출
├──────────────────────────────────────────────────────────────┤
│  ● 서버 상태                                                  │
│  ┌────────────┬────────────┬────────────┬────────────┐        │
│  │ API        │ MariaDB    │ 배치       │ 공공API 쿼터 │        │
│  │ ● 정상      │ ● 정상      │ ● 06:00 성공│ 3,120/10,000│        │
│  │ uptime 4d  │ 12ms       │ 다음 06:00 │ ▓▓▓░░ 31%  │        │
│  └────────────┴────────────┴────────────┴────────────┘        │
├──────────────────────────────────────────────────────────────┤
│  ● 핵심 지표                                                   │
│  단지 12,481 · 실거래 1,204,332 · 최신 계약일 2026-09-01       │
│  매칭 실패 37건 ⚠ · 오늘 검색 512회                            │
│  [최근 7일 수집 건수 추이 차트]                                 │
├──────────────────────────────────────────────────────────────┤
│  ● 최근 로그/에러          [error|warn|info] [검색____]        │
│  09-02 06:01 ERROR collector 국토부 API 타임아웃 (강남구) ×3    │
│  09-02 06:00 WARN  matcher  단지명 매칭 실패 2건               │
│  ...                                              [더보기]     │
└──────────────────────────────────────────────────────────────┘
```

### 비밀번호 정책

| 항목 | 내용 |
|---|---|
| 초기 계정 | `admin` / `12345` (`scripts/seed-admin.ts`로 시드) |
| 저장 방식 | bcrypt cost 12 해시 — 평문 저장 금지 |
| 최초 로그인 | `mustChangePassword = true` → **변경 전까지 대시보드 접근 차단** |
| 변경 규칙 | 최소 10자, 문자 종류 2종 이상, 현재 비밀번호 확인 필수 |
| 변경 후 | 기존 세션 전부 무효화 → 재로그인 |
| 잠금 | 5회 실패 시 15분 계정 잠금 + IP rate limit |

> **`12345`는 로컬 개발에서 바로 실행해보기 위한 초기값**이다. 인터넷에 노출되는 서버에 이 상태로 두면 대시보드가 그대로 열리므로, 배포 체크리스트(Step 8·9)에 "비밀번호 변경"을 필수 항목으로 넣었다. 강제 변경 플로우와 경고 배너는 이를 잊지 않게 하기 위한 장치다.

### 지표 정의

| 지표 | 계산 방식 | 이상 신호 |
|---|---|---|
| 데이터 신선도 | `MAX(trades.contracted_at)` | 3일 이상 정체 시 수집 장애 의심 |
| 배치 성공률 | 최근 7일 `job_runs` 성공/전체 | 1회라도 실패 시 빨간 표시 |
| API 쿼터 사용률 | `api_quota_usage.used ÷ daily_limit` | 80% 초과 시 경고 |
| 매칭 실패 건수 | `match_failures` 미처리(`resolvedAt IS NULL`) 건수 | 증가 추세면 API 스펙 변경 의심 |
| 검색 수 / 인기 지역 | `search_events` 일별 집계 | 서비스 사용성 추적 |

---

## 9. 리스크 메모

| 리스크 | 대응 |
|---|---|
| 공공 API 일 트래픽 제한 | 증분 수집(최근 2개월만) + `ApiQuotaTracker`로 상한 관리 |
| **단지명 매칭 실패** (최대 난관) | `matching` 모듈을 순수 함수로 분리해 테스트 집중 + `match_failures` 수동 보정 UI + `MatchOverride` 사전 학습 |
| MariaDB 공간 쿼리 성능 | 최근접 POI 거리를 배치에서 사전 계산해 컬럼 캐시 (실시간 공간조인 회피) |
| 배포 중 마이그레이션 사고 | `migrate deploy`를 배포 첫 단계로 고정, RDS 자동 백업 + 배포 전 수동 스냅샷 |
| 수집 실패를 늦게 인지 | 관리자 대시보드(Step 9) + 배치 실패 이메일 알림(Step 8) |
| **기본 관리자 비밀번호 노출** | `12345`는 로컬 개발 편의용. 최초 로그인 시 변경 강제 + 경고 배너·기동 로그 경고. 운영 배포 시 즉시 변경 |
| `app_logs` 테이블 비대화 | warn 이상만 적재 + 30일 경과분 자동 삭제 cron |
| 모듈 경계 붕괴 (설계 부패) | ESLint `import/no-restricted-paths`로 역방향 import를 **CI에서 차단** (Step 0) |
| 비기술자가 테스트 못함 | 데모 모드 + `start.command` + 스테이징 URL + `TEST-CHECKLIST.md` (7.2) |

---

## 10. 지금 바로 할 일 (Top 3)

1. **공공데이터포털 API 활용 신청** — 승인 대기가 있으므로 최우선. (승인 전에도 `DEMO_MODE=true`로 Step 0~6 개발·테스트 진행 가능)
2. **Step 0 + Step 1** — 모노레포 셋업, `setup.sh` 동작 확인, 값 객체 4종과 단위 테스트
3. **Step 2** — Prisma 스키마 확정 + 법정동 코드 시드 → 첫 화면에서 지역 검색이 되는 상태까지