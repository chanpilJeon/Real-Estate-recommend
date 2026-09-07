import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(here, '../../.env');

/**
 * 모노레포 루트의 .env 를 읽는다.
 *
 * Next.js 는 **자기 폴더(apps/web)의 .env** 만 본다. 우리 설정은 저장소 루트에
 * 한 벌만 두기 때문에(API 와 공유), 여기서 직접 읽어 넘겨야 한다.
 * 안 그러면 카카오 키를 넣어도 지도가 "키 없음"으로 뜬다.
 *
 * 파일이 없어도 빌드는 계속된다 — 배포 환경은 실제 환경변수를 쓴다.
 */
function readRootEnv() {
  try {
    const parsed = {};
    for (const line of readFileSync(ROOT_ENV, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      parsed[key] = value;
    }
    return parsed;
  } catch {
    return {};
  }
}

const rootEnv = readRootEnv();
/** 실제 환경변수가 있으면 그쪽이 이긴다 (배포 환경 우선) */
const pick = (key, fallback) => process.env[key] ?? rootEnv[key] ?? fallback;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 모노레포의 packages/shared 를 TS 소스 그대로 가져다 쓴다 (빌드 단계 불필요)
  transpilePackages: ['@apt/shared'],

  env: {
    NEXT_PUBLIC_KAKAO_JS_KEY: pick('NEXT_PUBLIC_KAKAO_JS_KEY', ''),
    NEXT_PUBLIC_API_BASE_URL: pick('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000'),
  },

  // 개발 서버와 프로덕션 빌드의 산출물 폴더를 분리한다.
  // 같은 폴더(.next)를 쓰면, 개발 서버가 켜진 상태에서 `pnpm build` 를 돌렸을 때
  // 빌드가 개발 서버의 청크 파일을 덮어써서 화면이 500 에러가 된다.
  // (Cannot find module './295.js') — 원인을 찾기 어려운 오류라 아예 분리해 둔다.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
};

export default nextConfig;
