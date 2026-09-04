/**
 * 환경설정 (ToDo.md 3.2, 계층 L0).
 *
 * **이 프로젝트에서 `process.env` 를 읽는 곳은 여기뿐이다.** (ESLint 로 강제)
 * 다른 모듈은 `AppConfig` 를 주입받아 쓴다. 이렇게 해야 설정 누락을
 * "서비스 사용 중 어느 날 갑자기"가 아니라 **서버 기동 시점에** 잡을 수 있다.
 */
export class AppConfig {
  private constructor(
    readonly nodeEnv: 'development' | 'production' | 'test',
    readonly apiPort: number,
    readonly databaseUrl: string,
    readonly molitApiKey: string,
    readonly kakaoRestKey: string,
    readonly adminSessionSecret: string,
    readonly demoMode: boolean,
  ) {}

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /**
   * 환경변수를 읽어 검증한다. 문제가 있으면 **전부 모아서** 한 번에 알려준다.
   * (하나 고치고 다시 실행했더니 또 다른 게 빠졌다는 상황을 피하기 위함)
   */
  static load(env: NodeJS.ProcessEnv): AppConfig {
    const problems: string[] = [];

    const demoMode = AppConfig.parseBoolean(env.DEMO_MODE);

    const databaseUrl = env.DATABASE_URL?.trim() ?? '';
    if (!databaseUrl) {
      problems.push('DATABASE_URL 이 비어 있습니다 — 데이터베이스 접속 주소가 필요합니다.');
    }

    const adminSessionSecret = env.ADMIN_SESSION_SECRET?.trim() ?? '';
    if (!adminSessionSecret) {
      problems.push('ADMIN_SESSION_SECRET 이 비어 있습니다 — 아래 명령으로 만들 수 있습니다: openssl rand -hex 32');
    } else if (adminSessionSecret.length < 16) {
      problems.push(
        `ADMIN_SESSION_SECRET 이 너무 짧습니다 (${adminSessionSecret.length}자). 16자 이상으로 설정하세요.`,
      );
    }

    // 공공 API 키는 실제 수집을 할 때만 필요하다. 데모 모드에서는 없어도 된다.
    const molitApiKey = env.MOLIT_API_KEY?.trim() ?? '';
    const kakaoRestKey = env.KAKAO_REST_KEY?.trim() ?? '';
    if (!demoMode) {
      if (!molitApiKey) {
        problems.push(
          'MOLIT_API_KEY 가 비어 있습니다 — 공공데이터포털 키를 넣거나, .env 에서 DEMO_MODE=true 로 두세요.',
        );
      }
      if (!kakaoRestKey) {
        problems.push(
          'KAKAO_REST_KEY 가 비어 있습니다 — 카카오 REST 키를 넣거나, .env 에서 DEMO_MODE=true 로 두세요.',
        );
      }
    }

    const apiPort = Number(env.API_PORT ?? 4000);
    if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
      problems.push(`API_PORT 값이 올바르지 않습니다 (받은 값: ${String(env.API_PORT)})`);
    }

    const rawNodeEnv = env.NODE_ENV ?? 'development';
    const nodeEnv =
      rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

    if (problems.length > 0) {
      throw new Error(
        ['환경설정(.env)에 문제가 있어 서버를 시작할 수 없습니다:', ...problems.map((p) => `  · ${p}`)].join(
          '\n',
        ),
      );
    }

    return new AppConfig(
      nodeEnv,
      apiPort,
      databaseUrl,
      molitApiKey,
      kakaoRestKey,
      adminSessionSecret,
      demoMode,
    );
  }

  /**
   * 사람이 .env 에 손으로 적는 값이라 표기 흔들림을 관대하게 받아들인다.
   * "TRUE", "True", "1", "yes" 를 모두 참으로 본다 — 대소문자 하나 때문에
   * "API 키가 없습니다" 같은 엉뚱한 오류를 만나지 않게 하기 위함이다.
   */
  private static parseBoolean(raw: string | undefined): boolean {
    return ['true', '1', 'yes', 'y', 'on'].includes((raw ?? '').trim().toLowerCase());
  }

  /** 기동 로그에 남길 요약 — 비밀값은 절대 포함하지 않는다. */
  describe(): Record<string, string | number | boolean> {
    return {
      nodeEnv: this.nodeEnv,
      apiPort: this.apiPort,
      demoMode: this.demoMode,
      molitApiKey: this.molitApiKey ? '설정됨' : '없음',
      kakaoRestKey: this.kakaoRestKey ? '설정됨' : '없음',
    };
  }
}
