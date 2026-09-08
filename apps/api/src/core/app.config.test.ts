import { describe, expect, it } from 'vitest';

import { AppConfig } from './app.config';

/** 데모 모드 기준의 최소 유효 환경변수 */
const validEnv = (): NodeJS.ProcessEnv => ({
  DATABASE_URL: 'mysql://apt:aptpw@localhost:3306/apt_finder',
  ADMIN_SESSION_SECRET: 'a'.repeat(32),
  DEMO_MODE: 'true',
});

describe('AppConfig.load — 기동 시 환경설정 검증', () => {
  it('유효한 환경변수를 읽어 설정 객체를 만든다', () => {
    const config = AppConfig.load(validEnv());

    expect(config.databaseUrl).toBe('mysql://apt:aptpw@localhost:3306/apt_finder');
    expect(config.demoMode).toBe(true);
    expect(config.apiPort).toBe(4000); // 기본값
    expect(config.nodeEnv).toBe('development'); // 기본값
    expect(config.isProduction).toBe(false);
  });

  describe('필수값 누락 시 기동을 막는다', () => {
    it('DATABASE_URL 이 없으면 실패한다', () => {
      const env = { ...validEnv(), DATABASE_URL: '' };
      expect(() => AppConfig.load(env)).toThrow(/DATABASE_URL/);
    });

    it('ADMIN_SESSION_SECRET 이 없으면 실패한다', () => {
      const env = { ...validEnv(), ADMIN_SESSION_SECRET: undefined };
      expect(() => AppConfig.load(env)).toThrow(/ADMIN_SESSION_SECRET/);
    });

    it('ADMIN_SESSION_SECRET 이 16자 미만이면 실패한다', () => {
      const env = { ...validEnv(), ADMIN_SESSION_SECRET: 'short' };
      expect(() => AppConfig.load(env)).toThrow(/너무 짧습니다/);
    });

    it('문제가 여러 개면 한 번에 모아서 알려준다', () => {
      const env: NodeJS.ProcessEnv = { DEMO_MODE: 'true' };
      try {
        AppConfig.load(env);
        expect.unreachable('예외가 발생해야 한다');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('DATABASE_URL');
        expect(message).toContain('ADMIN_SESSION_SECRET');
      }
    });
  });

  describe('공공 API 키는 데모 모드가 아닐 때만 필수', () => {
    it('데모 모드면 키가 없어도 통과한다', () => {
      expect(() => AppConfig.load(validEnv())).not.toThrow();
    });

    it('데모 모드가 아니면 MOLIT·KAKAO 키를 요구한다', () => {
      const env = { ...validEnv(), DEMO_MODE: 'false' };
      expect(() => AppConfig.load(env)).toThrow(/MOLIT_API_KEY/);
      expect(() => AppConfig.load(env)).toThrow(/KAKAO_REST_KEY/);
    });

    it('키가 모두 있으면 데모 모드가 아니어도 통과한다', () => {
      const env = {
        ...validEnv(),
        DEMO_MODE: 'false',
        MOLIT_API_KEY: 'molit-key',
        KAKAO_REST_KEY: 'kakao-key',
      };
      const config = AppConfig.load(env);
      expect(config.demoMode).toBe(false);
      expect(config.molitApiKey).toBe('molit-key');
    });

    it.each(['true', 'TRUE', 'True', '1', 'yes', ' true '])(
      'DEMO_MODE="%s" 는 데모 모드로 읽는다 (.env 표기 흔들림 허용)',
      (raw) => {
        expect(AppConfig.load({ ...validEnv(), DEMO_MODE: raw }).demoMode).toBe(true);
      },
    );

    it.each(['false', 'FALSE', '0', 'no', ''])('DEMO_MODE="%s" 는 실제 수집 모드다', (raw) => {
      const env = {
        ...validEnv(),
        DEMO_MODE: raw,
        MOLIT_API_KEY: 'molit-key',
        KAKAO_REST_KEY: 'kakao-key',
      };
      expect(AppConfig.load(env).demoMode).toBe(false);
    });

    it('DEMO_MODE 를 아예 적지 않으면 실제 수집 모드다 (키를 요구한다)', () => {
      const env = { ...validEnv() };
      delete env.DEMO_MODE;
      expect(() => AppConfig.load(env)).toThrow(/MOLIT_API_KEY/);
    });
  });

  describe('API_PORT', () => {
    it('지정하면 그 값을 쓴다', () => {
      expect(AppConfig.load({ ...validEnv(), API_PORT: '5000' }).apiPort).toBe(5000);
    });

    it('숫자가 아니거나 범위를 벗어나면 실패한다', () => {
      expect(() => AppConfig.load({ ...validEnv(), API_PORT: 'abc' })).toThrow(/API_PORT/);
      expect(() => AppConfig.load({ ...validEnv(), API_PORT: '70000' })).toThrow(/API_PORT/);
      expect(() => AppConfig.load({ ...validEnv(), API_PORT: '0' })).toThrow(/API_PORT/);
    });
  });

  describe('NODE_ENV', () => {
    it.each([
      ['production', true],
      ['test', false],
      ['development', false],
    ] as const)('NODE_ENV="%s" 를 그대로 읽는다', (raw, isProd) => {
      const config = AppConfig.load({ ...validEnv(), NODE_ENV: raw });
      expect(config.nodeEnv).toBe(raw);
      expect(config.isProduction).toBe(isProd);
    });

    it('알 수 없는 값은 development 로 본다 (운영으로 오인하지 않는다)', () => {
      expect(AppConfig.load({ ...validEnv(), NODE_ENV: 'staging' }).nodeEnv).toBe('development');
    });
  });

  describe('describe() — 기동 로그용 요약', () => {
    it('비밀값을 그대로 노출하지 않는다', () => {
      const env = {
        ...validEnv(),
        DEMO_MODE: 'false',
        MOLIT_API_KEY: 'super-secret-molit-key',
        KAKAO_REST_KEY: 'super-secret-kakao-key',
      };
      const summary = AppConfig.load(env).describe();
      const asText = JSON.stringify(summary);

      expect(asText).not.toContain('super-secret-molit-key');
      expect(asText).not.toContain('super-secret-kakao-key');
      expect(asText).not.toContain('aptpw'); // DB 비밀번호
      expect(summary.molitApiKey).toBe('설정됨');
    });

    it('키가 없으면 "없음" 으로 표시한다', () => {
      const summary = AppConfig.load(validEnv()).describe();
      expect(summary.molitApiKey).toBe('없음');
      expect(summary.kakaoRestKey).toBe('없음');
      expect(summary.demoMode).toBe(true);
    });
  });
});

describe('CORS origin', () => {
  it('로컬 기본값과 운영 웹 주소를 구분한다', () => {
    expect(AppConfig.load(validEnv()).corsOrigin).toBe('http://localhost:3000');
    expect(
      AppConfig.load({ ...validEnv(), CORS_ORIGIN: 'https://app.example.com' }).corsOrigin,
    ).toBe('https://app.example.com');
  });
  it.each(['*', 'https://app.example.com/path', 'javascript:alert(1)'])(
    '잘못된 origin %s를 거부한다',
    (origin) => {
      expect(() => AppConfig.load({ ...validEnv(), CORS_ORIGIN: origin })).toThrow(/CORS_ORIGIN/);
    },
  );
});
