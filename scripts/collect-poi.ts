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
    let total = 0;
    for (const [index, code] of codes.entries()) {
      process.stdout.write(`\r[${index + 1}/${codes.length}] ${code} 조회 중…                    `);
      const updated = await service.collectForRegion(
        RegionCode.parse(code + '00000'),
        (done, count) => {
          if (done % 25 === 0 || done === count) {
            process.stdout.write(`\r[${index + 1}/${codes.length}] ${code} ${done}/${count}        `);
          }
        },
      );
      total += updated;
      process.stdout.write(`\r[${index + 1}/${codes.length}] ${code} — ${updated}곳 반영 (누적 ${total})\n`);
    }
    console.log(`\n입지 수집 완료 — 모두 ${total}곳.`);
    console.log('이미 거리를 아는 단지는 건너뜁니다. 중간에 멈춰도 다시 돌리면 이어집니다.');
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
