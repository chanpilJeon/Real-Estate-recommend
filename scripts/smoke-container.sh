#!/usr/bin/env bash
# Disposable database only. Never uses the project's .env or existing apt-finder-db.
set -euo pipefail
SMOKE_IMAGE="${1:-apt-finder-api:verify}"
SMOKE_NETWORK="apt-smoke-$$"
SMOKE_DB="apt-smoke-db-$$"
SMOKE_API="apt-smoke-api-$$"
cleanup() {
  docker rm -f "$SMOKE_API" "$SMOKE_DB" >/dev/null 2>&1 || true
  docker network rm "$SMOKE_NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
docker network create "$SMOKE_NETWORK" >/dev/null
docker run -d --rm --name "$SMOKE_DB" --network "$SMOKE_NETWORK" --tmpfs /var/lib/mysql \
  -e MARIADB_ROOT_PASSWORD=disposable-local-test \
  -e MARIADB_DATABASE=apt_smoke mariadb:11 >/dev/null
for ((i=0; i<60; i++)); do
  if docker exec "$SMOKE_DB" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$SMOKE_DB" healthcheck.sh --connect --innodb_initialized >/dev/null
docker run -d --rm --name "$SMOKE_API" --network "$SMOKE_NETWORK" -p 127.0.0.1::4000 \
  -e "DATABASE_URL=mysql://root:disposable-local-test@$SMOKE_DB:3306/apt_smoke" \
  -e ADMIN_SESSION_SECRET=disposable-smoke-test-secret-32-characters \
  -e DEMO_MODE=true -e COLLECT_SIGUNGU_CODES= "$SMOKE_IMAGE" >/dev/null
SMOKE_PORT="$(docker port "$SMOKE_API" 4000/tcp)"
SMOKE_BASE="http://127.0.0.1:${SMOKE_PORT##*:}"
for ((i=0; i<60; i++)); do
  if curl -fsS "$SMOKE_BASE/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
node - "$SMOKE_BASE" <<'JS'
(async () => {
  const base = process.argv[2];
  const health = await (await fetch(base + '/api/health')).json();
  if (health.status !== 'ok') throw new Error('Database health failed');
  const response = await fetch(base + '/api/recommendations?regionCode=1168000000');
  const body = await response.json();
  if (!response.ok || body.total !== 0 || body.items.length !== 0) throw new Error('Fresh database recommendation failed');
  const denied = await fetch(base + '/api/admin/auth/me');
  if (denied.status !== 401) throw new Error('Admin authentication failed');
  console.log('컨테이너 검증 성공: 새 DB 마이그레이션 → API 정상 → 빈 추천 → 관리자 인증 차단');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
JS
