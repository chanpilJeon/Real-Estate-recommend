import { describe, expect, it, vi } from 'vitest';

import { CATCH_UP_AFTER_HOURS, CatchUpCollectionJob } from './catch-up.job';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/** setTimeout 을 기다리지 않고 내부 동작만 본다 */
const runCatchUp = async (job: CatchUpCollectionJob): Promise<void> =>
  (job as unknown as { catchUp: () => Promise<void> }).catchUp();

function build(latest: { status: string; startedAt: Date } | undefined) {
  const runDailyIncremental = vi.fn().mockResolvedValue({});
  const job = new CatchUpCollectionJob(
    { runDailyIncremental } as never,
    { history: () => Promise.resolve(latest === undefined ? [] : [latest]) } as never,
    { collectSigunguCodes: ['11680'], nodeEnv: 'development' } as never,
    { info: () => {}, warn: () => {}, error: () => {} } as never,
  );
  return { job, runDailyIncremental };
}

describe('CatchUpCollectionJob — 켤 때 밀린 수집 따라잡기', () => {
  it('하루 가까이 안 돌았으면 수집한다', async () => {
    // 밤에 노트북을 닫으면 06:00 cron 이 아예 돌지 않는다
    const { job, runDailyIncremental } = build({ status: 'success', startedAt: hoursAgo(30) });
    await runCatchUp(job);

    expect(runDailyIncremental).toHaveBeenCalledWith(['11680'], 'catch-up');
  });

  it('한 번도 안 돌았으면 수집한다', async () => {
    const { job, runDailyIncremental } = build(undefined);
    await runCatchUp(job);

    expect(runDailyIncremental).toHaveBeenCalled();
  });

  it('방금 돌았으면 다시 돌지 않는다 (켤 때마다 한도를 쓰면 안 된다)', async () => {
    const { job, runDailyIncremental } = build({ status: 'success', startedAt: hoursAgo(2) });
    await runCatchUp(job);

    expect(runDailyIncremental).not.toHaveBeenCalled();
  });

  it(`기준(${CATCH_UP_AFTER_HOURS}시간) 바로 아래는 돌지 않는다`, async () => {
    const { job, runDailyIncremental } = build({
      status: 'success',
      startedAt: hoursAgo(CATCH_UP_AFTER_HOURS - 1),
    });
    await runCatchUp(job);

    expect(runDailyIncremental).not.toHaveBeenCalled();
  });

  it('이미 돌고 있으면 겹쳐 돌리지 않는다', async () => {
    const { job, runDailyIncremental } = build({ status: 'running', startedAt: hoursAgo(48) });
    await runCatchUp(job);

    expect(runDailyIncremental).not.toHaveBeenCalled();
  });

  it('수집이 실패해도 서버를 죽이지 않는다', async () => {
    const { job } = build({ status: 'success', startedAt: hoursAgo(30) });
    (job as unknown as { orchestrator: { runDailyIncremental: () => Promise<never> } }).orchestrator =
      { runDailyIncremental: () => Promise.reject(new Error('국토부 API 오류')) };

    await expect(runCatchUp(job)).resolves.toBeUndefined();
  });

  it('수집 대상 지역이 없으면 시작조차 하지 않는다', () => {
    const runDailyIncremental = vi.fn();
    const job = new CatchUpCollectionJob(
      { runDailyIncremental } as never,
      { history: () => Promise.resolve([]) } as never,
      { collectSigunguCodes: [], nodeEnv: 'development' } as never,
      { info: () => {}, warn: () => {}, error: () => {} } as never,
    );
    job.onApplicationBootstrap();

    expect(runDailyIncremental).not.toHaveBeenCalled();
  });
});
