import { RegionCode } from '@apt/shared';

import { AppConfig, PrismaService, type ILogger } from '../apps/api/src/core';
import { PrismaComplexRepository } from '../apps/api/src/complex/prisma-complex.repository';
import { FakeGeocodeClient } from '../apps/api/src/external/fake/fake-geocode.client';
import { KakaoGeocodeClient } from '../apps/api/src/external/http/kakao-geocode.client';
import { ApiQuotaTracker } from '../apps/api/src/observability/api-quota-tracker';
import { PrismaQuotaStore } from '../apps/api/src/observability/prisma/prisma-quota.store';
import { PoiCollectService } from '../apps/api/src/poi';

async function main() {
  const config = AppConfig.load(process.env);
  const logger: ILogger = { info: () => {}, warn: () => {}, error: () => {} };
  const prisma = new PrismaService(config, logger);
  try {
    const index = process.argv.indexOf('--regions');
    const codes =
      index < 0 ? config.collectSigunguCodes : (process.argv[index + 1] ?? '').split(',');
    if (codes.length === 0 || codes.some((c) => !/^\d{5}$/.test(c)))
      throw new Error('시군구 코드 5자리를 지정하세요: --regions 11680');
    const geocode = config.demoMode
      ? new FakeGeocodeClient()
      : new KakaoGeocodeClient(config, new ApiQuotaTracker(new PrismaQuotaStore(prisma)));
    const service = new PoiCollectService(geocode, new PrismaComplexRepository(prisma), prisma);
    for (const code of codes) {
      console.log(`${code}: 역·초등학교를 조회합니다. 단지당 API를 2회 이상 호출합니다.`);
      console.log(
        `${code}: ${await service.collectForRegion(RegionCode.parse(code + '00000'))}개 단지 반영 완료`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    '입지 수집 실패: DB 연결과 카카오 API 설정·한도를 확인하세요. 기존 실거래는 유지됩니다.',
  );
  process.exitCode = 1;
});
