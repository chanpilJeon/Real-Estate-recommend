/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 모노레포의 packages/shared 를 TS 소스 그대로 가져다 쓴다 (빌드 단계 불필요)
  transpilePackages: ['@apt/shared'],
};

export default nextConfig;
