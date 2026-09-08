/**
 * "지금 서비스가 정상인가"를 **사람이 읽는 한 문장**으로 판정한다 (ToDo.md 7절·8절).
 *
 * 이 파일이 대시보드의 핵심이다. 비기술자가 JSON 이나 로그를 읽게 하지 않는 것이 목적이므로,
 * 판정 규칙을 화면이 아니라 여기에 두고 순수 함수로 테스트한다.
 *
 * 판정은 세 단계다.
 *   정상      — 그냥 두면 된다
 *   확인 필요 — 당장 망가지진 않았지만 두면 데이터가 낡는다
 *   문제 발생 — 지금 서비스가 제대로 동작하지 않는다
 */

export type StatusLevel = 'ok' | 'warn' | 'error';

/** 신선도가 이 일수를 넘으면 수집이 멈춘 것으로 본다 (ToDo.md 8절 지표 정의) */
export const STALE_DAYS = 3;
/** 공공 API 하루 한도를 이만큼 쓰면 경고 */
export const QUOTA_WARN_RATIO = 0.8;
/** 사람이 보정해야 할 매칭 실패가 이만큼 쌓이면 경고 */
export const MATCH_FAILURE_WARN = 50;

export interface QuotaSignal {
  provider: string;
  used: number;
  limit: number;
  ratio: number;
}

export interface StatusSignals {
  /** DB 에 실제로 질의가 되는가 */
  databaseOk: boolean;
  /** 가장 최근 실거래 계약일이 며칠 전인지. 데이터가 없으면 null */
  freshnessDays: number | null;
  /** 마지막 수집 배치 결과 */
  lastCollect: { status: 'running' | 'success' | 'failed'; finishedAt: Date | null } | null;
  quotas: QuotaSignal[];
  /** 아직 사람이 보정하지 않은 단지명 매칭 실패 */
  unresolvedMatchFailures: number;
  /** 관리자 비밀번호가 아직 기본값인가 */
  usingDefaultPassword: boolean;
  /** 수집 대상 지역이 설정되어 있는가 */
  hasCollectRegions: boolean;
}

export interface StatusCheck {
  /** 화면에 보일 이름 */
  label: string;
  level: StatusLevel;
  /** 한 줄 상태 */
  detail: string;
}

export interface ServiceStatus {
  level: StatusLevel;
  /** 맨 위에 크게 보일 한 문장 */
  headline: string;
  /** 무엇을 하면 되는지. 비어 있으면 할 일이 없다는 뜻 */
  actions: string[];
  checks: StatusCheck[];
}

const HEADLINE: Record<StatusLevel, string> = {
  ok: '정상입니다. 따로 하실 일이 없습니다.',
  warn: '확인이 필요합니다. 당장 멈춘 건 아니지만 그대로 두면 데이터가 낡습니다.',
  error: '문제가 있습니다. 아래 항목을 확인해 주세요.',
};

/** 셋 중 가장 나쁜 단계 */
function worst(levels: StatusLevel[]): StatusLevel {
  if (levels.includes('error')) return 'error';
  if (levels.includes('warn')) return 'warn';
  return 'ok';
}

export function judgeStatus(signals: StatusSignals): ServiceStatus {
  const checks: StatusCheck[] = [];
  const actions: string[] = [];

  // 1) DB — 여기가 막히면 나머지는 볼 필요도 없다
  checks.push(
    signals.databaseOk
      ? { label: '데이터베이스', level: 'ok', detail: '연결되어 있습니다' }
      : { label: '데이터베이스', level: 'error', detail: '연결되지 않습니다' },
  );
  if (!signals.databaseOk) {
    actions.push('Docker Desktop 이 실행 중인지 확인하고 `pnpm db:up` 으로 데이터베이스를 켜 주세요.');
  }

  // 2) 데이터 신선도 — "수집이 돌고 있나"를 가장 잘 보여주는 지표
  if (!signals.hasCollectRegions) {
    checks.push({ label: '수집 대상 지역', level: 'warn', detail: '설정되지 않았습니다' });
    actions.push('.env 의 COLLECT_SIGUNGU_CODES 에 볼 지역의 시군구 코드를 넣어 주세요.');
  }
  if (signals.freshnessDays === null) {
    checks.push({ label: '데이터 신선도', level: 'warn', detail: '실거래 데이터가 아직 없습니다' });
    actions.push('`pnpm collect` 으로 실거래를 먼저 받아 주세요.');
  } else if (signals.freshnessDays >= STALE_DAYS) {
    checks.push({
      label: '데이터 신선도',
      level: 'warn',
      detail: `가장 최근 계약일이 ${signals.freshnessDays}일 전입니다`,
    });
    actions.push('수집이 멈췄을 수 있습니다. 아래 "배치 실행"에서 수집을 한 번 돌려 보세요.');
  } else {
    checks.push({
      label: '데이터 신선도',
      level: 'ok',
      detail:
        signals.freshnessDays === 0
          ? '오늘 계약분까지 들어와 있습니다'
          : `${signals.freshnessDays}일 전 계약분까지 들어와 있습니다`,
    });
  }

  // 3) 마지막 수집 배치 — 한 번이라도 실패했으면 빨간불 (ToDo.md 8절)
  if (signals.lastCollect === null) {
    checks.push({ label: '수집 배치', level: 'warn', detail: '아직 한 번도 돌지 않았습니다' });
  } else if (signals.lastCollect.status === 'failed') {
    checks.push({ label: '수집 배치', level: 'error', detail: '마지막 실행이 실패했습니다' });
    actions.push('아래 "최근 기록"에서 실패 사유를 확인해 주세요.');
  } else if (signals.lastCollect.status === 'running') {
    checks.push({ label: '수집 배치', level: 'ok', detail: '지금 실행 중입니다' });
  } else {
    checks.push({ label: '수집 배치', level: 'ok', detail: '마지막 실행이 성공했습니다' });
  }

  // 4) 공공 API 한도 — 넘으면 다음 수집이 통째로 실패한다
  for (const quota of signals.quotas) {
    const name = quota.provider === 'molit' ? '국토부 API' : '카카오 API';
    // 내림으로 보여준다 — 79.6% 를 "80%" 로 보여주면서 경고가 안 뜨면 사람이 헷갈린다
    const percent = Math.floor(quota.ratio * 100);
    // 한도 초과는 '문제 발생'이 아니라 '확인 필요'다 — 자정에 저절로 풀리고,
    // 여기서 빨간불을 켜면 정말 고장났을 때와 구분이 안 된다 (ToDo.md 8절: 80% 초과 시 경고)
    if (quota.ratio >= 1) {
      checks.push({ label: name, level: 'warn', detail: `오늘 한도를 다 썼습니다 (${quota.used.toLocaleString()}건)` });
      actions.push(`${name} 하루 한도를 초과했습니다. 자정(한국시간)에 초기화되니 내일 다시 수집해 주세요.`);
    } else if (quota.ratio >= QUOTA_WARN_RATIO) {
      checks.push({ label: name, level: 'warn', detail: `오늘 ${percent}% 사용 (${quota.used.toLocaleString()}/${quota.limit.toLocaleString()})` });
    } else {
      checks.push({ label: name, level: 'ok', detail: `오늘 ${percent}% 사용` });
    }
  }

  // 5) 매칭 실패 — 쌓이면 그만큼의 거래가 화면에 안 나온다
  if (signals.unresolvedMatchFailures >= MATCH_FAILURE_WARN) {
    checks.push({
      label: '단지 매칭',
      level: 'warn',
      detail: `${signals.unresolvedMatchFailures.toLocaleString()}건이 단지에 연결되지 않았습니다`,
    });
    actions.push('"매칭 보정"에서 어떤 단지인지 골라 주면 과거 거래까지 함께 되살아납니다.');
  } else {
    checks.push({
      label: '단지 매칭',
      level: 'ok',
      detail:
        signals.unresolvedMatchFailures === 0
          ? '모든 거래가 단지에 연결됐습니다'
          : `연결 안 된 것 ${signals.unresolvedMatchFailures}건 (적은 편입니다)`,
    });
  }

  // 6) 기본 비밀번호 — 인터넷에 열려 있으면 대시보드가 그대로 열린다
  if (signals.usingDefaultPassword) {
    checks.push({ label: '관리자 비밀번호', level: 'warn', detail: '아직 기본값입니다' });
    actions.push('비밀번호를 지금 바꿔 주세요. 기본값은 로컬에서만 안전합니다.');
  }

  return {
    level: worst(checks.map((c) => c.level)),
    headline: HEADLINE[worst(checks.map((c) => c.level))],
    actions,
    checks,
  };
}
