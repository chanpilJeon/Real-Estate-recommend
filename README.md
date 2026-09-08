# 아파트 매물 추천 서비스

지역명 하나만 입력하면, 저장해둔 조건(예산·평형·연식·세대수)에 맞는 아파트 단지를
국토교통부 실거래가 기준으로 랭킹해 추천하는 웹 서비스입니다.

- 기획: [Concept.md](Concept.md)
- 구현 계획: [ToDo.md](ToDo.md)
- 디자인 기준: [Design.md](Design.md)
- 테스트 체크리스트: [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md)

**현재 진행 상황: Step 0 (개발환경 준비) 완료**

---

## 처음 실행하기 — 개발을 모르셔도 됩니다

아래 순서대로만 하시면 됩니다. **총 3단계, 15분쯤** 걸립니다.

### 1단계. Node.js 설치 (딱 한 번만)

이 프로그램을 돌리는 엔진입니다. 없으면 아무것도 실행되지 않습니다.

1. https://nodejs.org 접속
2. **초록색 `LTS` 버튼**을 눌러 파일을 내려받습니다 (숫자가 20 이상이면 됩니다)
3. 받은 파일(`.pkg`)을 두 번 클릭 → **"계속" 만 계속 누르면** 설치 끝
4. 설치가 끝나면 **열려 있던 터미널 창은 모두 닫아 주세요** (안 닫으면 설치를 인식하지 못합니다)

> 이미 설치되어 있는지 확인하려면: 터미널을 열고 `node -v` 입력 → `v20.x.x` 처럼 나오면 OK

### 2단계. (선택) Docker Desktop 설치

데이터베이스를 돌리는 데 필요합니다. **Step 2 부터 필요**하므로 지금은 건너뛰어도 됩니다.
지금 화면만 확인하실 거면 1단계만 하고 3단계로 가세요.

1. https://www.docker.com/products/docker-desktop 접속
2. **Download for Mac** → 본인 Mac 종류 선택
   (Apple 실리콘 = M1/M2/M3/M4 칩, Intel = 2020년 이전 대부분)
   - 확인법: 화면 왼쪽 위 사과 아이콘 →  **이 Mac에 관하여** → "칩" 항목
3. 받은 파일을 열고 Docker 아이콘을 Applications 폴더로 끌어다 놓기
4. Launchpad 에서 **Docker** 실행 → 상단 메뉴바에 고래 아이콘이 뜨고 멈추면 준비 완료

### 3단계. 실행

`scripts` 폴더 안의 **`start.command` 파일을 더블클릭**합니다.

- 검은 창이 하나 뜹니다. **이 창을 닫지 마세요.** (닫으면 서비스도 꺼집니다)
- 처음 실행은 부품을 내려받느라 **3~5분** 걸립니다. 글자가 계속 올라가면 정상입니다.
- 다 끝나면 **브라우저가 저절로 열립니다.**

> **"열 수 없습니다" 라고 나올 때**
> macOS 보안 설정 때문입니다. `start.command` 파일에서 **마우스 오른쪽 클릭 → 열기**
> → 경고창에서 다시 **열기** 를 누르면 그 뒤로는 더블클릭으로 열립니다.

### 잘 됐는지 확인하기

브라우저에 뜬 화면에서 카드 3개를 봅니다. [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md) 의 **M1** 표와 같습니다.

| 카드 | 정상일 때 |
|---|---|
| 웹 화면 | 초록색 `정상` |
| API 서버 연결 | 초록색 `정상` |
| 현재 단계 | `Step 0` |

**API 서버 연결이 빨간색이면** 프론트만 켜지고 서버가 안 켜진 것입니다.
검은 창의 마지막 10줄을 복사해서 전달해 주세요.

### 끄는 방법

검은 창에서 **Control + C** 를 누르거나, 창을 닫으면 됩니다.

---

## 개발자용 안내

### 실행

```bash
./scripts/setup.sh   # 최초 1회: 도구 확인 → .env 생성 → 의존성 설치 → DB 기동 → 마이그레이션
pnpm dev             # web(3000) + api(4000) 동시 기동
```

| 주소 | 내용 |
|---|---|
| http://localhost:3000 | 서비스 화면 (Next.js) |
| http://localhost:4000/api/health | API 상태 확인 |
| http://localhost:3000/admin | 관리자 대시보드 (Step 9 예정) |

### 데이터 수집

평소에는 매일 06:00 에 자동으로 돌지만, 컴퓨터가 꺼져 있으면 그 시간에 돌지 않습니다.
손으로 돌리려면:

```bash
pnpm collect
```

지역·기간을 지정할 수도 있습니다.

```bash
# 특정 지역만 (시군구 코드 5자리)
pnpm collect --regions 11680,41450

# 과거 데이터 채우기 (3년치)
pnpm collect --regions 11680 --from 202301 --to 202609
```

수집할 지역은 `.env` 의 `COLLECT_SIGUNGU_CODES` 에 미리 적어둘 수 있습니다.
전국을 매일 훑으면 공공 API 하루 한도를 넘기므로, **관심 지역만** 적습니다.

**하루 한도에 걸릴 때**

단지 정보(세대수·주차)는 단지당 2회 호출이라 한도가 가장 먼저 닳습니다.
실거래만 먼저 다 채워 앱을 쓸 수 있게 하고, 단지 정보는 나눠 받으세요.

```bash
pnpm collect --from 202309 --no-complex-info   # 실거래만 (빠름)
pnpm collect --from 202309                     # 나중에 단지 정보까지
```

이미 받아 둔 단지는 건너뛰므로 **그냥 다시 돌리면 이어집니다.**

> **데모 모드에서는 강남구(11680)·하남시(41450) 두 곳만 데이터가 있습니다.**
> 다른 지역의 실제 데이터를 받으려면 공공데이터포털 API 키가 필요합니다 —
> [docs/API-VERIFICATION.md](docs/API-VERIFICATION.md) 참조.

### 진짜 데이터 넣기 — API 키 없이 (CSV)

공공데이터포털 API 키를 기다리지 않고도 실제 실거래가를 넣을 수 있습니다.
국토교통부가 같은 데이터를 **웹에서 직접 내려받게** 해 두었기 때문입니다.

**1) 파일 받기**

1. <https://rt.molit.go.kr> 접속
2. 상단 메뉴 **[자료제공] > [조건별 자료제공]**
3. **아파트** / **매매** 선택
4. **계약일자** 범위 지정 — 한 번에 최대 1년까지만 됩니다
5. **시도**와 **시군구** 선택 (예: 서울특별시 / 강남구)
6. 맨 아래 **[CSV 다운]** 클릭
7. 전월세도 원하면 위에서 **[전월세]** 로 바꿔 한 번 더 받기

> ⚠ 받은 파일을 **엑셀로 열어서 저장하지 마세요.** 형식이 바뀌어 읽지 못할 수 있습니다.
> 3년치가 필요하면 1년씩 세 번 받아서 세 파일을 다 넣으면 됩니다.

**2) 파일 넣기**

받은 파일을 프로젝트 안 `data/csv` 폴더에 옮기고:

```bash
pnpm load-csv
```

폴더 안의 CSV 를 전부 읽어 DB 에 넣습니다. 매매인지 전월세인지는
파일 이름이 아니라 **내용을 보고** 알아서 판단하므로 이름은 마음대로 지어도 됩니다.

다른 곳에 있는 파일을 바로 넣을 수도 있습니다.

```bash
pnpm load-csv ~/Downloads/아파트\(매매\)_실거래가.csv
pnpm load-csv --dir ~/Downloads      # 폴더째로
pnpm load-csv --no-geocode           # 좌표 조회 건너뛰기 (빠르지만 지도에 안 찍힘)
```

**3) 확인**

<http://localhost:3000> 에서 넣은 지역을 검색하면 바로 보입니다.

**알아두면 좋은 것**

- **여러 번 돌려도 안전합니다.** 같은 거래는 지문(단지명·면적·금액·계약일·층)으로
  걸러져 중복되지 않습니다. 기간이 겹치게 받아도 괜찮습니다.
- **나중에 API 키가 생겨 `pnpm collect` 로 갈아타도 중복되지 않습니다.** 지문 계산 방식이
  같아서, CSV 로 넣었든 API 로 받았든 같은 거래는 같은 지문을 갖습니다.
- **세대수·주차 대수·난방 방식은 "미상"으로 나옵니다.** 실거래 CSV 에 없는 정보라
  그렇습니다. 단지 점수를 매길 때 모르는 항목은 불리하게 치지 않고 중립으로 둡니다.
  나중에 공동주택 정보 API 키가 생기면 같은 단지에 덧씌워집니다.
- **실시간이 아닙니다.** 매매 계약은 법에 따라 계약일로부터 30일 안에 신고하므로,
  가장 최근 한 달치는 아직 덜 채워져 있습니다. 국토부 사이트 자체가 그렇게 안내합니다.

### 자주 쓰는 명령

```bash
pnpm load-csv      # 국토부에서 받은 CSV 를 DB 에 넣기
pnpm backfill-jibun # 단지 지번을 주소에서 채우기 (K-apt 연결률을 올린다)
pnpm test          # 단위 테스트 (DB 없이 동작)
pnpm lint          # 린트 — 모듈 계층 위반도 여기서 잡힌다
pnpm typecheck     # 타입 검사
pnpm format        # 코드 포맷 정리
pnpm prisma studio # DB 내용을 브라우저로 확인
```

### 문제가 생겼을 때

**화면에 `Server error` / `Internal Server Error` 가 뜬다**

빌드 캐시가 꼬인 경우가 대부분입니다. 아래 순서로 복구합니다.

```bash
pnpm clean   # 빌드 캐시 삭제
pnpm dev     # 다시 실행
```

> 참고: 개발 서버(`pnpm dev`)가 켜진 상태에서 `pnpm build` 를 돌리면 서로 파일이 충돌해
> 이 오류가 났었습니다. 지금은 `next.config.mjs` 에서 개발용(`.next`)과 빌드용(`.next-build`)
> 폴더를 분리해 두어 충돌하지 않습니다.

**`pnpm: command not found`**

터미널을 완전히 닫았다가 다시 열어 보세요. 그래도 안 되면:

```bash
corepack enable --install-directory ~/.local/bin
```

**포트가 이미 사용 중이라고 나온다**

이전에 켜둔 서버가 남아 있는 경우입니다.

```bash
pkill -f "turbo run dev"
```

### 기술 스택

| 레이어 | 기술 |
|---|---|
| Frontend | React 18 + Next.js 14 (App Router) + TypeScript |
| Backend | Node.js 20 + NestJS + TypeScript |
| ORM / DB | Prisma + MariaDB 11 |
| 테스트 | Vitest(단위) · Supertest(API) · Playwright(E2E) |
| 모노레포 | pnpm workspace + Turborepo |

### 폴더 구조

```
.
├── apps/
│   ├── web/          # Next.js 프론트엔드
│   │   └── app/
│   │       ├── globals.css   ← Design.md 토큰 시스템 (모든 UI의 기준)
│   │       └── page.tsx
│   └── api/          # NestJS 백엔드
│       └── src/      # core → region → … → admin (계층 순)
├── packages/
│   └── shared/       # 값 객체·DTO — web/api 공용, 순수 TypeScript
├── prisma/
│   └── schema.prisma # DB 스키마 (전체 정의는 Step 2)
├── scripts/
│   ├── setup.sh      # 원커맨드 셋업
│   ├── start.command # 더블클릭 실행 (비개발자용)
│   └── seed-admin.ts # 관리자 계정 시드
└── docs/
    └── TEST-CHECKLIST.md
```

### 모듈 계층 규칙 (중요)

[ToDo.md 2.3](ToDo.md#23-모듈-의존성-그래프-위상-순서--구현-순서) 의 의존성 그래프를
ESLint `import/no-restricted-paths` 로 **강제**합니다.

```
L0  core                              (shared 는 별도 패키지)
L1  region · observability · admin-auth
L2  external · complex · trade · poi
L3  matching · collector
L4  search
L5  recommendation
L6  admin
```

계층 N 의 모듈은 **N 미만만** import 할 수 있습니다.
`complex`(L2)가 `search`(L4)를 import 하면 `pnpm lint` 가 실패합니다.
새 모듈을 만들 때는 `.eslintrc.cjs` 상단의 `LAYERS` 배열에 먼저 등록하세요.

또한 `process.env` 는 `core` 밖에서 직접 읽을 수 없습니다 — `AppConfig` 를 주입받아 씁니다.

### 환경변수

`.env.example` 을 복사해 `.env` 를 만듭니다 (setup.sh 가 자동으로 합니다).

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | DB 접속 주소 |
| `MOLIT_API_KEY` | 국토부 실거래가 API 키 (없으면 `DEMO_MODE=true`) |
| `KAKAO_REST_KEY` / `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 로컬 API · 지도 SDK 키 |
| `ADMIN_SESSION_SECRET` | 관리자 세션 서명 비밀값 (운영에서는 반드시 변경) |
| `DEMO_MODE` | `true` 면 공공 API 없이 샘플 데이터로 동작 |

`.env` 는 `.gitignore` 에 있어 깃에 올라가지 않습니다.

### 역·초등학교 거리 수집

Docker와 서버를 켠 상태에서 프로젝트 폴더의 터미널에 `pnpm collect:poi --regions 11680`를 입력하면 강남구 단지 주변 시설을 수집합니다. 하남시는 `41450`입니다. 단지당 카카오 요청을 2회 이상 사용하므로 지역 하나씩 실행하세요. 끝나면 웹을 새로고침하세요. 거리는 **직선거리**이며 실제 보행 경로·통학구역이 아닙니다. 검색 반경 3km에서 확인하지 못한 시설은 미상으로 남습니다. 기존 실거래 데이터는 삭제하지 않습니다.
