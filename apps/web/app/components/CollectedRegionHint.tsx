'use client';

import { useEffect, useState } from 'react';

import { api, type CollectedRegion } from '../lib/api-client';

interface Props {
  /** 검색을 했는데 결과가 0건인 상황인지 (아직 지역을 안 고른 상태와 문구가 달라야 한다) */
  searched: boolean;
  onPick: (regionCode: string) => void;
}

/**
 * 데이터가 있는 지역을 알려준다.
 *
 * 없으면 "조건에 맞는 단지가 없습니다"만 보여서, 조건이 까다로운 건지
 * 그 지역 데이터를 아직 안 모은 건지 사용자가 구분할 수 없다.
 */
export function CollectedRegionHint({ searched, onPick }: Props) {
  const [regions, setRegions] = useState<CollectedRegion[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .collectedRegions()
      .then((list) => {
        if (alive) setRegions(list);
      })
      .catch(() => {
        /* 안내는 없어도 되는 부가 정보다 */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (regions.length === 0) return null;

  return (
    <div className="collected-hint">
      <p className="text-muted">
        {searched
          ? '이 지역은 아직 데이터를 모으지 않았을 수 있습니다. 지금 데이터가 있는 지역입니다:'
          : '지금 데이터가 있는 지역입니다. 눌러서 바로 볼 수 있어요.'}
      </p>
      <div className="chip-row">
        {regions.map((region) => (
          <button
            key={region.sigunguCode}
            type="button"
            className="chip chip--on"
            onClick={() => onPick(region.regionCode)}
          >
            {region.name}
            <span className="collected-hint__count">
              단지 {region.complexCount} · 거래 {region.tradeCount.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <p className="field-hint">
        다른 지역을 보시려면 <code className="text-mono">.env</code> 의{' '}
        <code className="text-mono">COLLECT_SIGUNGU_CODES</code> 에 시군구 코드를 추가하고 수집을
        다시 돌려야 합니다.
      </p>
    </div>
  );
}
