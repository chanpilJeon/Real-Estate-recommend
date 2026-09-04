/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 모노레포의 packages/shared 를 TS 소스 그대로 가져다 쓴다 (빌드 단계 불필요)
  transpilePackages: ['@apt/shared'],

  // 개발 서버와 프로덕션 빌드의 산출물 폴더를 분리한다.
  // 같은 폴더(.next)를 쓰면, 개발 서버가 켜진 상태에서 `pnpm build` 를 돌렸을 때
  // 빌드가 개발 서버의 청크 파일을 덮어써서 화면이 500 에러가 된다.
  // (Cannot find module './295.js') — 원인을 찾기 어려운 오류라 아예 분리해 둔다.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
};

export default nextConfig;
