import type { RegionCandidateDto } from '@apt/shared';
import { InvalidValueError } from '@apt/shared';
import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';

import { RegionSearchService } from './region-search.service';

const MAX_KEYWORD_LENGTH = 30;

/**
 * 지역 검색 API.
 *
 * Controller 는 HTTP 경계와 입력 검증만 한다 — 검색 규칙은 서비스가 갖는다.
 * (ToDo.md 2.1-1 계층 분리)
 */
@Controller('regions')
export class RegionController {
  constructor(private readonly searchService: RegionSearchService) {}

  /** GET /api/regions/search?q=영통&limit=20 */
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<{ keyword: string; candidates: RegionCandidateDto[] }> {
    const keyword = (q ?? '').trim();
    if (keyword === '') {
      throw new BadRequestException('검색어(q)를 입력해 주세요. 예: /api/regions/search?q=영통');
    }
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      throw new BadRequestException(`검색어는 ${MAX_KEYWORD_LENGTH}자 이하로 입력해 주세요.`);
    }

    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) {
      throw new BadRequestException('limit 은 1 이상의 정수여야 합니다.');
    }

    return { keyword, candidates: await this.searchService.search(keyword, parsedLimit) };
  }

  /** GET /api/regions/1168010100 */
  @Get(':code')
  async findOne(@Param('code') code: string): Promise<RegionCandidateDto> {
    let region;
    try {
      region = await this.searchService.findByCode(code);
    } catch (err) {
      if (err instanceof InvalidValueError) throw new BadRequestException(err.message);
      throw err;
    }

    if (region === null) {
      throw new NotFoundException(`법정동코드 ${code} 에 해당하는 지역이 없습니다.`);
    }

    return {
      code: region.code.toString(),
      sigunguCode: region.code.toSigunguCode(),
      fullName: region.fullName(),
      level: region.level(),
      matchType: 'exact',
    };
  }
}
