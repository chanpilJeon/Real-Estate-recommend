import { RegionCode } from '@apt/shared';
import { Module } from '@nestjs/common';

import { COMPLEX_REPOSITORY, ComplexModule, type IComplexRepository } from '../complex';
import { LOGGER, type ILogger } from '../core';
import { TRADE_REPOSITORY, TradeModule, type ITradeRepository } from '../trade';

import { ComplexMatcher, type CandidateSource } from './complex-matcher';
import { MatchFailureService } from './match-failure.service';
import { MATCH_REPOSITORY, type CandidateComplex, type IMatchRepository } from './match.repository';
import { PrismaMatchRepository } from './prisma-match.repository';

type ComplexList = Awaited<ReturnType<IComplexRepository['findByRegion']>>;

/** 매칭에 필요한 최소 정보만 남긴다 — 단지 객체를 통째로 들고 다니지 않는다 */
const lighten = (list: ComplexList): CandidateComplex[] =>
  list.map((c) => ({
    id: c.id,
    name: c.name,
    nameNormalized: c.nameNormalized,
    regionCode: c.regionCode.toString(),
    builtYear: c.builtYear,
  }));

/**
 * 후보 조회는 complex 모듈의 저장소를 그대로 쓴다.
 * 단지 마스터의 소유자는 complex 이고, 조회 규칙이 두 곳에 갈라지면 안 된다.
 */
const candidateSourceOf = (complexes: IComplexRepository): CandidateSource => ({
  byRegion: async (regionCode) => lighten(await complexes.findByRegion(RegionCode.parse(regionCode))),
  bySigungu: async (sigunguCode) => lighten(await complexes.findByRegionPrefix(sigunguCode)),
});

/** 단지명 매칭 모듈 (계층 L3) */
@Module({
  imports: [ComplexModule, TradeModule],
  providers: [
    PrismaMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: PrismaMatchRepository },
    {
      provide: ComplexMatcher,
      useFactory: (complexes: IComplexRepository, repository: IMatchRepository) =>
        new ComplexMatcher(candidateSourceOf(complexes), repository),
      inject: [COMPLEX_REPOSITORY, MATCH_REPOSITORY],
    },
    {
      provide: MatchFailureService,
      useFactory: (repository: IMatchRepository, trades: ITradeRepository, logger: ILogger) =>
        new MatchFailureService(repository, trades, logger),
      inject: [MATCH_REPOSITORY, TRADE_REPOSITORY, LOGGER],
    },
  ],
  exports: [ComplexMatcher, MatchFailureService],
})
export class MatchingModule {}
