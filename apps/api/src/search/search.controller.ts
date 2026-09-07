import { Area, InvalidValueError, type ComplexSummaryDto, type PaginatedDto } from '@apt/shared';
import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { TradeStatsService } from '../trade';

import { ComplexSearchService, type SortKey } from './complex-search.service';
import { SearchCondition } from './domain/search-condition';

const SORT_KEYS: SortKey[] = ['price', 'households', 'newest', 'quality'];

/** 화면에 뿌릴 실거래 한 줄 */
interface TradeRowDto {
  contractedAt: string;
  exclusiveSqm: number;
  areaLabel: string;
  priceManwon: number;
  priceText: string;
  floor: number;
  isCanceled: boolean;
}

@Controller()
export class SearchController {
  constructor(
    private readonly searchService: ComplexSearchService,
    private readonly tradeStats: TradeStatsService,
  ) {}

  /** GET /api/complexes?regionCode=&priceMin=&priceMax=&areaMin=&areaMax=&builtAfter=&minHouseholds= */
  @Get('complexes')
  async search(
    @Query('regionCode') regionCode?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('areaMin') areaMin?: string,
    @Query('areaMax') areaMax?: string,
    @Query('builtAfter') builtAfter?: string,
    @Query('minHouseholds') minHouseholds?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedDto<ComplexSummaryDto>> {
    // 컨트롤러는 문자열을 숫자로 바꿔 넘길 뿐, 필터 규칙은 SearchCondition 이 갖는다
    const condition = this.buildCondition({
      regionCode: regionCode ?? '',
      priceMin: numberOf(priceMin, '예산 하한'),
      priceMax: numberOf(priceMax, '예산 상한'),
      areaMin: numberOf(areaMin, '면적 하한'),
      areaMax: numberOf(areaMax, '면적 상한'),
      builtAfter: numberOf(builtAfter, '사용승인 연도'),
      minHouseholds: numberOf(minHouseholds, '최소 세대수'),
      page: numberOf(page, '페이지'),
      pageSize: numberOf(pageSize, '페이지 크기'),
    });

    const sortKey = sort === undefined ? 'price' : sort;
    if (!SORT_KEYS.includes(sortKey as SortKey)) {
      throw new BadRequestException(`정렬 기준은 ${SORT_KEYS.join(' / ')} 중 하나여야 합니다.`);
    }

    return this.searchService.search(condition, sortKey as SortKey);
  }

  /** GET /api/complexes/:id/trades?area=84.97&limit=20 */
  @Get('complexes/:id/trades')
  async trades(
    @Param('id') id: string,
    @Query('area') area?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: TradeRowDto[]; areas: number[] }> {
    const complexId = Number(id);
    if (!Number.isInteger(complexId) || complexId < 1) {
      throw new BadRequestException('단지 ID 는 1 이상의 정수여야 합니다.');
    }

    let areaFilter: Area | undefined;
    if (area !== undefined && area !== '') {
      const sqm = numberOf(area, '전용면적');
      areaFilter = sqm === undefined ? undefined : this.toArea(sqm);
    }

    const [trades, areas] = await Promise.all([
      this.tradeStats.findRecentTrades(complexId, areaFilter, numberOf(limit, '건수') ?? 20),
      this.tradeStats.distinctAreas(complexId),
    ]);

    return {
      items: trades.map((trade) => ({
        contractedAt: trade.contractedAt.toISOString().slice(0, 10),
        exclusiveSqm: trade.area.toSqm(),
        areaLabel: trade.area.toTypeLabel(),
        priceManwon: trade.price.toManwon(),
        priceText: trade.price.toKoreanText(),
        floor: trade.floor,
        // 해제된 거래도 보여준다. 통계에서만 뺀다 (ToDo.md 7.3 대조 항목)
        isCanceled: trade.isCanceled,
      })),
      areas,
    };
  }

  private buildCondition(input: Parameters<typeof SearchCondition.from>[0]): SearchCondition {
    try {
      return SearchCondition.from(input);
    } catch (err) {
      if (err instanceof InvalidValueError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private toArea(sqm: number): Area {
    try {
      return Area.fromSqm(sqm);
    } catch (err) {
      if (err instanceof InvalidValueError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}

/** 쿼리스트링은 전부 문자열로 온다. 숫자가 아니면 여기서 막는다. */
function numberOf(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new BadRequestException(`${label} 은(는) 숫자여야 합니다 (받은 값: "${raw}")`);
  }
  return value;
}
