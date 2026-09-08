import { Module } from '@nestjs/common';

import { SearchModule } from '../search';
import { TradeModule } from '../trade';

import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [SearchModule, TradeModule],
  providers: [RecommendationService],
  controllers: [RecommendationController],
  exports: [RecommendationService],
})
export class RecommendationModule {}
