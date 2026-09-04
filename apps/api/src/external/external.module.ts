import { Module } from '@nestjs/common';

import { AppConfig, InjectLogger, LOGGER, type ILogger } from '../core';
import { ApiQuotaTracker } from '../observability';

import { FakeComplexInfoClient } from './fake/fake-complex-info.client';
import { FakeGeocodeClient } from './fake/fake-geocode.client';
import { FakeMolitClient } from './fake/fake-molit.client';
import { ComplexInfoHttpClient } from './http/complex-info-http.client';
import { KakaoGeocodeClient } from './http/kakao-geocode.client';
import { MolitHttpClient } from './http/molit-http.client';
import { COMPLEX_INFO_CLIENT, GEOCODE_CLIENT, MOLIT_CLIENT } from './ports';

/**
 * 외부 API 어댑터 모듈 (계층 L2).
 *
 * **`DEMO_MODE=true` 면 Fake 구현을 주입한다** (ToDo.md 3.6, 7.2).
 * 상위 모듈은 인터페이스만 알기 때문에, 데모냐 실서비스냐를 신경 쓰지 않는다.
 * 공공 API 키 승인 전에도 전체 기능을 확인할 수 있는 이유가 이것이다.
 */
@Module({
  providers: [
    // FakeMolitClient 는 생성자에 시계(now)를 받으므로 팩토리로 만든다
    { provide: FakeMolitClient, useFactory: () => new FakeMolitClient() },
    FakeComplexInfoClient,
    FakeGeocodeClient,
    {
      provide: MOLIT_CLIENT,
      useFactory: (config: AppConfig, quota: ApiQuotaTracker, logger: ILogger, fake: FakeMolitClient) =>
        config.demoMode ? fake : new MolitHttpClient(config, quota, logger),
      inject: [AppConfig, ApiQuotaTracker, LOGGER, FakeMolitClient],
    },
    {
      provide: COMPLEX_INFO_CLIENT,
      useFactory: (config: AppConfig, quota: ApiQuotaTracker, fake: FakeComplexInfoClient) =>
        config.demoMode ? fake : new ComplexInfoHttpClient(config, quota),
      inject: [AppConfig, ApiQuotaTracker, FakeComplexInfoClient],
    },
    {
      provide: GEOCODE_CLIENT,
      useFactory: (config: AppConfig, quota: ApiQuotaTracker, fake: FakeGeocodeClient) =>
        config.demoMode ? fake : new KakaoGeocodeClient(config, quota),
      inject: [AppConfig, ApiQuotaTracker, FakeGeocodeClient],
    },
  ],
  exports: [MOLIT_CLIENT, COMPLEX_INFO_CLIENT, GEOCODE_CLIENT],
})
export class ExternalModule {
  constructor(@InjectLogger() logger: ILogger, config: AppConfig) {
    if (config.demoMode) {
      // 조용히 가짜 데이터를 쓰다가 "왜 실제와 다르지?" 하는 상황을 막는다
      logger.warn(
        'external',
        '데모 모드입니다 — 공공 API 를 호출하지 않고 샘플 데이터를 사용합니다. ' +
          '실제 데이터를 쓰려면 .env 에 API 키를 넣고 DEMO_MODE=false 로 바꾸세요.',
      );
    }
  }
}
