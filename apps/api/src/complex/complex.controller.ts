import type { ComplexDetailDto } from '@apt/shared';
import { BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common';

import { ComplexService } from './complex.service';

@Controller('complexes')
export class ComplexController {
  constructor(private readonly complexService: ComplexService) {}

  /** GET /api/complexes/1 */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ComplexDetailDto> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      throw new BadRequestException('단지 ID 는 1 이상의 정수여야 합니다.');
    }

    const complex = await this.complexService.findById(numericId);
    if (complex === null) {
      throw new NotFoundException(`단지 ${numericId} 를 찾을 수 없습니다.`);
    }
    return complex;
  }
}
