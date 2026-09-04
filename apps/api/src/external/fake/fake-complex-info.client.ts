import { Injectable } from '@nestjs/common';

import type { RawComplexDetail, RawComplexInfo } from '../domain/raw-types';
import type { IComplexInfoClient } from '../ports';

import { SAMPLE_COMPLEXES } from './sample-data';

/** 공동주택 단지정보 API 의 가짜 구현 (데모 모드용) */
@Injectable()
export class FakeComplexInfoClient implements IComplexInfoClient {
  fetchComplexList(sigunguCode: string): Promise<RawComplexInfo[]> {
    return Promise.resolve(
      SAMPLE_COMPLEXES.filter((c) => c.sigunguCode === sigunguCode).map((c) => ({
        kaptCode: c.kaptCode,
        name: c.name,
        sido: c.sido,
        sigungu: c.sigungu,
        dong: c.dong,
      })),
    );
  }

  fetchComplexDetail(kaptCode: string): Promise<RawComplexDetail | null> {
    const complex = SAMPLE_COMPLEXES.find((c) => c.kaptCode === kaptCode);
    if (complex === undefined) return Promise.resolve(null);

    return Promise.resolve({
      kaptCode: complex.kaptCode,
      name: complex.name,
      address: complex.address,
      households: complex.households,
      buildingCount: complex.buildingCount,
      approvalDate: new Date(`${complex.approvalDate}T00:00:00Z`),
      parkingCount: complex.parkingCount,
      heatingType: complex.heatingType,
    });
  }
}
