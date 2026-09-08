# 배포 준비 (Step 8)

현재 **로컬 서비스는 사용 가능**하며 클라우드 서버·도메인·스테이징 주소는 아직 만들지 않았습니다. 이 단계는 개발자를 위한 배포 파일입니다. 일상 사용은 README의 더블클릭 실행 방법을 이용하세요.

## 준비된 파일

- `Dockerfile`: API와 공유 패키지를 빌드하는 2단계 이미지. 비밀키·CSV·로컬 DB는 이미지에 포함하지 않습니다. Prisma 마이그레이션 CLI를 남겨 최초 버전의 이미지는 다소 큽니다.
- `docker-compose.prod.yml`: 외부 MariaDB에 접속하는 API + Caddy. DB 포트와 API 포트는 인터넷에 직접 공개하지 않습니다.
- `docker/api-entrypoint.sh`: `prisma migrate deploy`가 성공한 뒤 API를 시작합니다.
- `scripts/deploy.sh`: ECR 이미지 빌드·push → SSH로 pull/up. `--check`는 파일 존재만 확인하며 실제 배포하지 않습니다.
- `.github/workflows/ci.yml`: PR와 작업 브랜치의 lint, 단위 테스트, 타입 검사, 빌드, PC/모바일 E2E. 클라우드 연결 전 자동 배포는 설정하지 않았습니다.

초기 명세의 Node 20 대신 로컬과 같은 Node 24 LTS를 사용합니다. [Node.js 지원 상태](https://nodejs.org/en/about/previous-releases).

## 실제 배포에 필요한 설정

1. AWS 계정의 RDS MariaDB·EC2·ECR을 준비합니다. RDS는 EC2 보안 그룹에서만 접근하도록 하고 백업 보존 기간을 설정합니다. 클라우드 리소스는 아직 생성하지 않았습니다.
2. EC2에 Docker Compose·AWS CLI·리포지토리의 동일 커밋을 준비합니다. 인스턴스 역할에는 ECR pull 권한을 부여합니다.
3. `docker/production.env.example`을 **서버에서** `.env.production`으로 복사하고 실제 RDS 주소, 기존 키, **운영용 새 관리자 세션 시크릿**, 웹 도메인, API 도메인을 채웁니다. `chmod 600 .env.production`을 적용합니다. 운영용 시크릿은 로컬 값을 복사하지 않습니다. SSM 연동은 후속 단계입니다.
4. API 도메인 DNS를 EC2에 연결하고 80/443 포트를 허용합니다. Caddy의 인증서 발급은 실제 DNS가 연결되어야 검증할 수 있습니다.
5. 로컬에서 `AWS_REGION`, `ECR_REPOSITORY`, `DEPLOY_HOST`, `DEPLOY_DIR`을 환경변수로 설정한 후 `./scripts/deploy.sh`를 실행합니다. 스크립트는 amd64 EC2용으로 빌드합니다. ARM EC2는 platform 변경이 필요합니다.
6. Vercel의 모노레포 설정으로 `apps/web`을 연결하고 `NEXT_PUBLIC_API_BASE_URL=https://API_DOMAIN`, 카카오 JavaScript 키를 설정합니다. 운영 웹 도메인을 카카오 설정에 등록합니다. `CORS_ORIGIN`은 실제 웹 origin과 정확히 같아야 합니다. 관리자 쿠키를 위해 웹과 API는 같은 상위 도메인의 서브도메인을 권장합니다.
7. 새 운영 DB에는 관리자와 법정동 초기 데이터가 필요합니다. 관리자 생성·첫 비밀번호 변경, M3 원천 거래 대조, 스테이징 시나리오, 모니터링을 완료하기 전에는 Step 8 전체를 완료로 표시하지 않습니다.

## 상태와 롤백

서버에서 `docker compose --env-file .env.production -f docker-compose.prod.yml ps`로 상태를 확인합니다. 오류 로그는 같은 명령 뒤에 `logs --tail=100 api`를 붙입니다. 로그를 공유할 때 비밀값을 포함하지 않도록 확인하세요.

이미지 롤백은 이전 Git 커밋 태그를 `API_IMAGE`에 지정하고 다시 `up -d --wait`합니다. DB 스키마 변경은 자동으로 되돌리지 않습니다. 배포 전 DB 스냅샷과 이전 앱의 스키마 호환 여부를 확인해야 합니다.

## 로컬 컨테이너 검증

`docker build -t apt-finder-api:verify .` 후 `./scripts/smoke-container.sh`를 실행합니다. 기존 DB와 완전히 분리된 임시 MariaDB에서 모든 마이그레이션을 적용하고 API 상태·빈 추천 응답·관리자 인증 차단을 확인합니다. 임시 컨테이너와 네트워크는 종료 시 삭제합니다. 실제 `.env`나 API 키를 사용하지 않습니다.
