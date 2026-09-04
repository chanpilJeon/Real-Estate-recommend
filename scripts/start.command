#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.command — 더블클릭으로 실행하는 파일 (터미널 지식 불필요)
#   Finder 에서 이 파일을 더블클릭하면 서버가 켜지고 브라우저가 자동으로 열립니다.
#   ※ 실행이 끝날 때까지 이 검은 창을 닫지 마세요.
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

# pnpm 이 사용자 폴더에 설치된 경우를 대비
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac

echo "======================================"
echo "  아파트 매물 추천 서비스를 시작합니다"
echo "  이 창을 닫으면 서비스도 꺼집니다."
echo "======================================"
echo

if ! ./scripts/setup.sh; then
  echo
  echo "======================================"
  echo "  설치 중 문제가 발생했습니다."
  echo "  이 창에 보이는 내용을 그대로 복사해서"
  echo "  개발자에게 보내주세요."
  echo "======================================"
  echo "창을 닫으려면 Enter 키를 누르세요."
  read -r _
  exit 1
fi

echo
echo "서버를 켜는 중입니다. 10초쯤 걸립니다..."
pnpm dev &
DEV_PID=$!

# 웹 화면이 실제로 응답할 때까지 기다렸다가 브라우저를 연다
for _ in $(seq 1 30); do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then break; fi
  sleep 1
done
open http://localhost:3000

echo
echo "브라우저가 열렸습니다. 서비스를 끄려면 이 창에서 Control+C 를 누르세요."
wait $DEV_PID
