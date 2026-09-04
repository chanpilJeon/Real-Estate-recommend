import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * 단위 테스트 설정.
 * 원칙(ToDo.md 2.1-3): 도메인·값 객체 테스트는 DB·네트워크 없이 돌아야 한다.
 * 그래서 setupFiles로 DB를 띄우지 않는다.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['{apps,packages,scripts}/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**', 'apps/api/src/**'],
      exclude: [
        // 배럴(재수출)과 프레임워크 배선 코드는 단위 테스트 대상이 아니다.
        // 이들은 실제 서버 기동으로 검증한다.
        '**/index.ts',
        '**/*.module.ts',
        '**/main.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@apt/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
});
