import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { AppConfig, InjectLogger, type ILogger } from '../core';
import { JobRunRecorder } from '../observability';

import { CollectionOrchestrator, JOB_DAILY } from './collection-orchestrator';

const CTX = 'collector';

/** 마지막 수집이 이보다 오래됐으면 밀린 것으로 본다 */
export const CATCH_UP_AFTER_HOURS = 20;
/** 서버가 완전히 뜬 뒤에 시작한다 — 기동을 붙잡지 않기 위해 */
const START_DELAY_MS = 10_000;

/**
 * 켤 때 밀린 수집을 따라잡는다.
 *
 * 왜 필요한가: 매일 06:00 cron 은 **맥이 깨어 있고 서버가 떠 있을 때만** 돈다.
 * 개인용으로 쓰면 보통 밤에 노트북을 닫으므로 그 시간에 아무 일도 일어나지 않는다.
 * 그러면 수집이 영영 안 돌고, 사용자는 "왜 데이터가 안 늘지?" 하고 원인을 찾아 헤맨다.
 *
 * 그래서 서버가 뜰 때 마지막 수집을 보고, 하루 가까이 지났으면 조용히 한 번 돌린다.
 * 기동을 붙잡지 않도록 기다리지 않고, 실패해도 서버는 그대로 뜬다.
 */
@Injectable()
export class CatchUpCollectionJob implements OnApplicationBootstrap {
  constructor(
    private readonly orchestrator: CollectionOrchestrator,
    private readonly recorder: JobRunRecorder,
    private readonly config: AppConfig,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.collectSigunguCodes.length === 0) return;
    // 테스트에서 서버를 띄웠다 내렸다 할 때 수집이 돌면 곤란하다
    if (this.config.nodeEnv === 'test') return;

    setTimeout(() => void this.catchUp(), START_DELAY_MS).unref();
  }

  private async catchUp(): Promise<void> {
    try {
      const [latest] = await this.recorder.history(1, JOB_DAILY);

      if (latest?.status === 'running') return; // 이미 돌고 있다
      if (latest !== undefined && hoursSince(latest.startedAt) < CATCH_UP_AFTER_HOURS) return;

      const since =
        latest === undefined
          ? '아직 한 번도 수집하지 않았습니다'
          : `마지막 수집이 ${Math.floor(hoursSince(latest.startedAt) / 24)}일 전입니다`;
      this.logger.info(CTX, `${since}. 밀린 수집을 시작합니다 (${this.config.collectSigunguCodes.length}곳)`);

      await this.orchestrator.runDailyIncremental(this.config.collectSigunguCodes, 'catch-up');
    } catch {
      // JobRunRecorder 가 이미 기록했다. 여기서 던지면 서버가 죽는다.
    }
  }
}

const hoursSince = (at: Date): number => (Date.now() - at.getTime()) / 3_600_000;
