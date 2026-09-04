#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# scripts/setup.sh — 로컬 개발환경 원커맨드 셋업
#   터미널에서:  ./scripts/setup.sh
# 필요한 걸 하나씩 확인하고, 없으면 "무엇을 어떻게" 설치해야 하는지 알려줍니다.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
fail() { echo "${RED}${BOLD}✗ $1${OFF}"; shift; for l in "$@"; do echo "  $l"; done; exit 1; }
ok()   { echo "${GREEN}✓${OFF} $1"; }
warn() { echo "${YELLOW}!${OFF} $1"; }

echo "${BOLD}==> 1/6  필수 프로그램 확인${OFF}"

command -v node >/dev/null || fail "Node.js 가 설치되어 있지 않습니다." \
  "" \
  "설치 방법:" \
  "  1. https://nodejs.org 접속" \
  "  2. 왼쪽의 'LTS' 버튼(초록색)을 눌러 내려받기" \
  "  3. 받은 .pkg 파일을 열어 '계속'만 누르면 설치 완료" \
  "  4. 터미널 창을 완전히 닫았다가 다시 열고, 이 스크립트를 다시 실행"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 이상이 필요합니다 (현재 $(node -v))." \
  "https://nodejs.org 에서 LTS 버전을 다시 설치해 주세요."
ok "Node.js $(node -v)"

if ! command -v pnpm >/dev/null; then
  echo "  pnpm 을 설치합니다..."
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@9.7.0 --activate >/dev/null 2>&1 \
    || npm install -g pnpm@9.7.0 >/dev/null 2>&1 \
    || fail "pnpm 설치에 실패했습니다." "터미널에 이렇게 입력해 보세요:  npm install -g pnpm"
fi
ok "pnpm $(pnpm -v)"

USE_DOCKER=0
if grep -qE '^DATABASE_URL="?mysql' .env 2>/dev/null || [ ! -f .env ]; then
  if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    USE_DOCKER=1
    ok "Docker 실행 중"
  else
    warn "Docker 가 없거나 실행되어 있지 않습니다."
    echo "    → MariaDB 없이 진행합니다. 데이터베이스가 필요한 단계(Step 2 이후)에서는"
    echo "      Docker Desktop(https://docker.com/products/docker-desktop) 설치가 필요합니다."
  fi
fi

echo
echo "${BOLD}==> 2/6  환경변수 파일(.env) 준비${OFF}"
if [ -f .env ]; then
  ok ".env 파일이 이미 있습니다 (건드리지 않습니다)"
else
  cp .env.example .env
  ok ".env 파일을 새로 만들었습니다"
  warn "공공 API 키가 아직 비어 있습니다. DEMO_MODE=true 이므로 샘플 데이터로 실행됩니다."
fi

echo
echo "${BOLD}==> 3/6  프로그램 부품(의존성) 내려받기${OFF}"
echo "    처음 실행하면 몇 분 걸립니다. 창을 닫지 마세요."
pnpm install
ok "설치 완료"

echo
echo "${BOLD}==> 4/6  데이터베이스 기동${OFF}"
if [ "$USE_DOCKER" = "1" ]; then
  docker compose up -d db
  printf "    MariaDB 준비 대기 중"
  for _ in $(seq 1 40); do
    if docker compose exec -T db healthcheck.sh --connect >/dev/null 2>&1; then break; fi
    printf "."; sleep 2
  done
  echo
  ok "MariaDB 준비 완료 (localhost:3306)"
else
  warn "건너뜁니다 (Docker 미사용)"
fi

echo
echo "${BOLD}==> 5/6  데이터베이스 표 만들기 + 초기 데이터${OFF}"
if [ "$USE_DOCKER" = "1" ]; then
  pnpm prisma migrate dev --name init
  [ -f scripts/seed-region.ts ] && pnpm tsx scripts/seed-region.ts || warn "법정동 코드 시드는 Step 2 에서 추가됩니다"
  [ -f scripts/seed-admin.ts ]  && pnpm tsx scripts/seed-admin.ts  || true
  if grep -q '^DEMO_MODE=true' .env && [ -f scripts/seed-demo.ts ]; then
    pnpm tsx scripts/seed-demo.ts
  fi
else
  warn "건너뜁니다 (데이터베이스 미기동)"
fi

echo
echo "${BOLD}==> 6/6  완료!${OFF}"
echo
echo "  ${BOLD}개발 서버 실행:${OFF}   pnpm dev"
echo "  ${BOLD}서비스 화면:${OFF}     http://localhost:3000"
echo "  ${BOLD}관리자 대시보드:${OFF} http://localhost:3000/admin   (Step 9 에서 만듭니다)"
echo "  ${BOLD}DB 내용 보기:${OFF}    pnpm prisma studio"
echo
