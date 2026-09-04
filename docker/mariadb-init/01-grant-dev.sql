-- 로컬 개발 전용 권한 설정.
--
-- Prisma 의 `migrate dev` 는 마이그레이션이 올바른지 검증하려고 임시 DB
-- (shadow database)를 매번 새로 만들었다 지운다. 그래서 DB 생성 권한이 필요하다.
--
-- ⚠ 이 파일은 docker-compose.yml 의 로컬 컨테이너에만 적용된다.
--   운영(AWS RDS)에서는 `migrate deploy` 를 쓰므로 shadow DB 가 필요 없고,
--   따라서 이런 광범위한 권한을 주지 않는다.
GRANT ALL PRIVILEGES ON *.* TO 'apt'@'%';
FLUSH PRIVILEGES;
