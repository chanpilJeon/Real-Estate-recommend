/* eslint-env node */

/**
 * ToDo.md 2.3 「모듈 의존성 그래프」를 코드로 강제한다.
 *
 * 규칙: 계층 N의 모듈은 계층 N 미만만 import 할 수 있다.
 *       (같은 계층끼리도 금지 — 병렬 개발 중 서로 얽히는 것을 막는다)
 * 예)   complex(L2)가 search(L4)를 import → CI에서 에러
 *
 * 이 배열만 고치면 규칙이 갱신된다. 새 모듈을 만들면 여기에 먼저 등록할 것.
 */
const LAYERS = [
  ['core'], // L0
  ['region', 'observability', 'admin-auth'], // L1
  ['external', 'complex', 'trade', 'poi'], // L2
  ['matching', 'collector'], // L3
  ['search'], // L4
  ['recommendation'], // L5
  ['admin'], // L6
];

const API_SRC = './apps/api/src';

/** 계층 N 모듈이 import 하면 안 되는 경로(자기 계층 포함, 자기 자신 제외) 목록 */
const layerZones = LAYERS.flatMap((modules, layerIndex) =>
  modules.map((mod) => ({
    target: `${API_SRC}/${mod}`,
    from: LAYERS.slice(layerIndex)
      .flat()
      .filter((other) => other !== mod && !(mod === 'poi' && ['external', 'complex'].includes(other)))
      .map((other) => `${API_SRC}/${other}`),
    message:
      `계층 위반: '${mod}' 모듈은 같거나 상위 계층 모듈을 import 할 수 없습니다. ` +
      `ToDo.md 2.3 의존성 그래프를 확인하세요.`,
  })),
);

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: { project: ['./tsconfig.base.json', './apps/*/tsconfig.json'] },
    },
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    '.next',
    '.turbo',
    'coverage',
    '**/*.js',
    '**/*.cjs',
    '**/*.mjs',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
    'import/no-restricted-paths': ['error', { zones: layerZones }],
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
  },
  overrides: [
    {
      // NestJS 는 생성자 파라미터의 '런타임' 타입 정보로 의존성을 주입한다
      // (emitDecoratorMetadata). `import type` 으로 바꾸면 그 정보가 사라져
      // "Nest can't resolve dependencies" 로 서버가 죽는다.
      // 자동수정이 이 사고를 반복하지 않도록 apps/api 에서는 규칙을 끈다.
      files: ['apps/api/src/**/*.ts'],
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
    {
      // ToDo.md 3.2 캡슐화 규칙: process.env는 core/AppConfig 밖에서 읽지 않는다.
      files: ['apps/api/src/**/*.ts'],
      excludedFiles: ['apps/api/src/core/**/*.ts', 'apps/api/src/main.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'env',
            message:
              'process.env를 직접 읽지 마세요. core 모듈의 AppConfig를 주입받아 사용합니다 (ToDo.md 3.2).',
          },
        ],
      },
    },
    {
      files: ['**/*.{test,spec}.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
