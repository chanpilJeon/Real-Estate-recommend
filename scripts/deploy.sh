#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--check" ]]; then
  test -f Dockerfile && test -f docker-compose.prod.yml && test -f docker/api-entrypoint.sh
  echo "배포 파일 확인 완료. 실제 배포에는 docs/DEPLOYMENT.md의 서버·도메인·환경설정이 필요합니다."
  exit 0
fi
: "${AWS_REGION:?Set AWS_REGION}"
: "${ECR_REPOSITORY:?Set ECR_REPOSITORY to the full ECR image repository URL}"
: "${DEPLOY_HOST:?Set DEPLOY_HOST to user@host}"
: "${DEPLOY_DIR:?Set DEPLOY_DIR to an absolute server checkout path}"
[[ "$AWS_REGION" =~ ^[a-z0-9-]+$ ]] || { echo 'Invalid AWS_REGION'; exit 1; }
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9._@-]+$ && "$DEPLOY_HOST" != -* ]] || { echo 'Invalid DEPLOY_HOST'; exit 1; }
[[ "$DEPLOY_DIR" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Invalid DEPLOY_DIR'; exit 1; }
[[ "$ECR_REPOSITORY" =~ ^[a-zA-Z0-9._/-]+$ ]] || { echo 'Invalid ECR_REPOSITORY'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo '먼저 변경사항을 커밋하세요.'; exit 1; }
DEPLOY_TAG="$(git rev-parse --short=12 HEAD)"
DEPLOY_IMAGE="$ECR_REPOSITORY:$DEPLOY_TAG"
DEPLOY_REGISTRY="${ECR_REPOSITORY%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$DEPLOY_REGISTRY"
docker buildx build --platform linux/amd64 --tag "$DEPLOY_IMAGE" --push .
# Remote host requires an instance role with ECR pull permission; no credentials are copied.
ssh "$DEPLOY_HOST" bash -s -- "$DEPLOY_DIR" "$DEPLOY_IMAGE" "$DEPLOY_REGISTRY" "$AWS_REGION" <<'REMOTE'
set -euo pipefail
cd "$1"
export API_IMAGE="$2"
aws ecr get-login-password --region "$4" | docker login --username AWS --password-stdin "$3"
docker compose --env-file .env.production -f docker-compose.prod.yml pull api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
REMOTE
