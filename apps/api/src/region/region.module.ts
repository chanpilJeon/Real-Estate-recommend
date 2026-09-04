import { Module } from '@nestjs/common';

import { PrismaRegionRepository } from './prisma-region.repository';
import { RegionSearchService } from './region-search.service';
import { RegionController } from './region.controller';
import { REGION_REPOSITORY, type IRegionRepository } from './region.repository';

/**
 * 지역 모듈 (계층 L1).
 *
 * 서비스는 데코레이터 없는 평범한 클래스라 useFactory 로 조립한다.
 * 그 대가로 테스트에서 가짜 저장소를 넣어 바로 만들 수 있다.
 */
@Module({
  controllers: [RegionController],
  providers: [
    { provide: REGION_REPOSITORY, useClass: PrismaRegionRepository },
    PrismaRegionRepository,
    {
      provide: RegionSearchService,
      useFactory: (repository: IRegionRepository) => new RegionSearchService(repository),
      inject: [REGION_REPOSITORY],
    },
  ],
  exports: [RegionSearchService],
})
export class RegionModule {}
