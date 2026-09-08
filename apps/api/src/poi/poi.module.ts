import { Module } from '@nestjs/common';

import { ComplexModule } from '../complex';
import { ExternalModule } from '../external';

import { DistanceCalculator, PoiCollectService } from './poi.service';

@Module({
  imports: [ComplexModule, ExternalModule],
  providers: [PoiCollectService, DistanceCalculator],
  exports: [PoiCollectService, DistanceCalculator],
})
export class PoiModule {}
