import type { DataMetrics, ServiceMetrics } from './domain/types';
import type { IMetricsStore } from './ports';

/**
 * 운영 지표 집계 (ToDo.md 3.4, 8절).
 * 관리자 대시보드(Step 9)가 이 값들로 "지금 서비스가 정상인가"를 보여준다.
 */
export class MetricsService {
  constructor(
    private readonly store: IMetricsStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  dataMetrics(): Promise<DataMetrics> {
    return this.store.dataMetrics(this.now());
  }

  serviceMetrics(days = 7): Promise<ServiceMetrics> {
    return this.store.serviceMetrics(Math.max(1, days), this.now());
  }
}
