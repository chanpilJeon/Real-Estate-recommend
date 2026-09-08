import { InvalidValueError, PRESET_NAMES, type PresetName } from '@apt/shared';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { SearchCondition } from '../search';

import { RecommendationService } from './recommendation.service';

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}
  @Get()
  recommend(@Query() query: Record<string, string | undefined>) {
    const preset = query.preset ?? 'value';
    if (!PRESET_NAMES.includes(preset as PresetName)) throw new BadRequestException('추천 유형은 value, location, newbuild 중 선택하세요.');
    const numeric = (key: string) => {
      const raw = query[key];
      if (raw === undefined || raw === '') return undefined;
      if (typeof raw !== 'string' || !Number.isFinite(Number(raw))) throw new BadRequestException(`${key}: 숫자를 입력하세요.`);
      const value = Number(raw);
      if (['page', 'pageSize'].includes(key) && (!Number.isSafeInteger(value) || value < 1)) throw new BadRequestException('페이지는 1 이상의 정수여야 합니다.');
      return value;
    };
    try {
      const condition = SearchCondition.from({ regionCode: query.regionCode ?? '', priceMin: numeric('priceMin'), priceMax: numeric('priceMax'), areaMin: numeric('areaMin'), areaMax: numeric('areaMax'), builtAfter: numeric('builtAfter'), minHouseholds: numeric('minHouseholds'), page: numeric('page'), pageSize: numeric('pageSize') });
      return this.service.recommend(condition, preset as PresetName);
    } catch (error) {
      if (error instanceof InvalidValueError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
