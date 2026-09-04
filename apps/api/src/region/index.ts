/**
 * region 모듈 공개 API (ToDo.md 2.1-5).
 *
 * Prisma 구현체(PrismaRegionRepository)와 컨트롤러는 일부러 내보내지 않는다.
 * 다른 모듈은 RegionSearchService 와 도메인 모델만 알면 된다.
 */
export { RegionModule } from './region.module';
export { RegionSearchService } from './region-search.service';
export { Region, type RegionLevel } from './domain/region';
export { REGION_REPOSITORY, type IRegionRepository } from './region.repository';
