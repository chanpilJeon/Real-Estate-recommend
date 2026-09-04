import { Module } from '@nestjs/common';

import { ComplexController } from './complex.controller';
import { COMPLEX_REPOSITORY, type IComplexRepository } from './complex.repository';
import { ComplexService } from './complex.service';
import { PrismaComplexRepository } from './prisma-complex.repository';

/** 단지 모듈 (계층 L2) — 단지 마스터 데이터의 소유자 */
@Module({
  controllers: [ComplexController],
  providers: [
    PrismaComplexRepository,
    { provide: COMPLEX_REPOSITORY, useExisting: PrismaComplexRepository },
    {
      provide: ComplexService,
      useFactory: (repository: IComplexRepository) => new ComplexService(repository),
      inject: [COMPLEX_REPOSITORY],
    },
  ],
  exports: [ComplexService, COMPLEX_REPOSITORY],
})
export class ComplexModule {}
