import type { PaginatedDto } from '@apt/shared';

import type { ILogger } from '../core';
import type { ITradeRepository } from '../trade';

import type { IMatchRepository, MatchFailureRecord } from './match.repository';

const CTX = 'matching';
const DEFAULT_PAGE_SIZE = 20;

export class MatchFailureNotFoundError extends Error {
  constructor(id: number) {
    super(`매칭 실패 기록 ${id} 을(를) 찾을 수 없습니다.`);
    this.name = 'MatchFailureNotFoundError';
  }
}

export interface ResolveResult {
  /** 뒤늦게 단지에 이어붙인 거래·전월세 건수 */
  relinkedRows: number;
}

/**
 * 매칭 실패 수동 보정 (ToDo.md 3.10).
 *
 * 규칙으로 못 잡는 케이스는 결국 사람이 봐야 한다. 중요한 건
 * **한 번 보정하면 두 번 묻지 않는 것**이다:
 *  1. `match_overrides` 사전에 학습시켜 다음 수집부터 자동으로 붙게 하고
 *  2. 이미 쌓여 있던 과거 거래도 그 단지로 이어붙인다
 */
export class MatchFailureService {
  constructor(
    private readonly repository: IMatchRepository,
    private readonly trades: ITradeRepository,
    private readonly logger: ILogger,
  ) {}

  listPending(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<PaginatedDto<MatchFailureRecord>> {
    return this.repository.listPendingFailures(Math.max(1, page), Math.min(Math.max(1, pageSize), 100));
  }

  countPending(): Promise<number> {
    return this.repository.countPending();
  }

  async resolve(failureId: number, complexId: number): Promise<ResolveResult> {
    const failure = await this.repository.findFailure(failureId);
    if (failure === null) throw new MatchFailureNotFoundError(failureId);

    // 1) 사전에 학습 — 다음 수집부터는 자동으로 붙는다
    await this.repository.saveOverride(failure.regionCode, failure.rawName, complexId);

    // 2) 이미 쌓인 과거 데이터도 되살린다
    const relinkedRows = await this.trades.relinkByRawName(
      failure.regionCode,
      failure.rawName,
      complexId,
    );

    await this.repository.markResolved(failureId, complexId);

    this.logger.info(
      CTX,
      `매칭 보정: "${failure.rawName}" → 단지 ${complexId} (과거 ${relinkedRows}건 재연결)`,
      { regionCode: failure.regionCode },
    );

    return { relinkedRows };
  }
}
