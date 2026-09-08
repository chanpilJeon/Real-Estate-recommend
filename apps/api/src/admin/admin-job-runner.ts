import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

import { CollectionOrchestrator, JOB_DAILY } from '../collector';
import { AppConfig, InjectLogger, type ILogger } from '../core';
import { JobRunRecorder, type JobRunSummary } from '../observability';

const CTX = 'admin';

/** 화면에서 돌릴 수 있는 배치 */
export const RUNNABLE_JOBS = {
  [JOB_DAILY]: '실거래 수집 (최근 2개월)',
} as const;

export type RunnableJobName = keyof typeof RUNNABLE_JOBS;

export interface TriggerResult {
  /** 시작했다는 사실만 알린다 — 결과는 배치 기록에서 본다 */
  started: true;
  jobName: string;
  message: string;
}

/**
 * 대시보드에서 배치를 손으로 돌린다 (ToDo.md 8절).
 *
 * **응답을 기다리지 않는다.** 전국 수집은 수십 분이 걸려서 HTTP 요청이 먼저 끊긴다.
 * 시작만 시키고 진행 상황은 `job_runs` 기록으로 보게 한다 — 화면이 30초마다
 * 새로고침하므로 곧 반영된다.
 */
@Injectable()
export class AdminJobRunner {
  constructor(
    private readonly orchestrator: CollectionOrchestrator,
    private readonly recorder: JobRunRecorder,
    private readonly config: AppConfig,
    @InjectLogger() private readonly logger: ILogger,
  ) {}

  history(limit: number, jobName?: string): Promise<JobRunSummary[]> {
    return this.recorder.history(limit, jobName === '' ? undefined : jobName);
  }

  async trigger(name: RunnableJobName): Promise<TriggerResult> {
    if (!(name in RUNNABLE_JOBS)) {
      throw new BadRequestException(
        `실행할 수 없는 배치입니다. 가능한 것: ${Object.keys(RUNNABLE_JOBS).join(', ')}`,
      );
    }
    if (this.config.collectSigunguCodes.length === 0) {
      throw new BadRequestException(
        '수집할 지역이 설정되지 않았습니다. .env 의 COLLECT_SIGUNGU_CODES 를 채워 주세요.',
      );
    }

    // 같은 배치를 겹쳐 돌리면 공공 API 한도만 두 배로 쓴다
    const [latest] = await this.recorder.history(1, name);
    if (latest?.status === 'running') {
      throw new ConflictException('이미 실행 중입니다. 끝난 뒤에 다시 눌러 주세요.');
    }

    // 일부러 await 하지 않는다 (위 주석 참조). 실패해도 서버가 죽지 않게 삼킨다 —
    // JobRunRecorder 가 job_runs 와 로그에 이미 남긴다.
    void this.orchestrator
      .runDailyIncremental(this.config.collectSigunguCodes, 'admin')
      .catch((err: unknown) => {
        this.logger.error(
          CTX,
          '손으로 실행한 수집이 실패했습니다',
          err instanceof Error ? err : new Error(String(err)),
        );
      });

    return {
      started: true,
      jobName: name,
      message: `${RUNNABLE_JOBS[name]}을 시작했습니다. 진행 상황은 아래 기록에서 확인하세요.`,
    };
  }
}
