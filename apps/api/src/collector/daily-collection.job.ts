import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AppConfig, InjectLogger, type ILogger } from '../core';

import { CollectionOrchestrator } from './collection-orchestrator';

const CTX = 'collector';

/**
 * 매일 실거래 증분 수집 (ToDo.md 3.11).
 *
 * 06:00 인 이유: 국토부가 새벽에 전날 신고분을 반영하고,
 * 로그 정리(04:00)·세션 정리(04:30)와 겹치지 않는다.
 */
@Injectable()
export class DailyCollectionJob {
  constructor(
    private readonly orchestrator: CollectionOrchestrator,
    private readonly config: AppConfig,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  @Cron('0 6 * * *', { name: 'daily-collect' })
  async handleCron(): Promise<void> {
    if (this.config.collectSigunguCodes.length === 0) {
      this.logger.warn(
        CTX,
        '수집 대상 지역이 없어 건너뜁니다. .env 의 COLLECT_SIGUNGU_CODES 를 설정하세요.',
      );
      return;
    }

    try {
      await this.orchestrator.runDailyIncremental(this.config.collectSigunguCodes);
    } catch {
      // JobRunRecorder 가 이미 job_runs 에 기록하고 로그도 남겼다.
      // 여기서 다시 던지면 cron 스케줄러가 죽는다.
    }
  }
}
