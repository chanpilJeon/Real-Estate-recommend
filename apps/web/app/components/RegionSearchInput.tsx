'use client';

import type { RegionCandidateDto } from '@apt/shared';
import { useEffect, useRef, useState } from 'react';

import { api, ApiError } from '../lib/api-client';

const MATCH_LABEL: Record<RegionCandidateDto['matchType'], string> = {
  exact: '정확히 일치',
  alias: '생활권',
  partial: '부분 일치',
};

const LEVEL_LABEL: Record<RegionCandidateDto['level'], string> = {
  sido: '시·도',
  sigungu: '시·군·구',
  dong: '읍·면·동',
};

interface Props {
  onSelect: (region: RegionCandidateDto) => void;
  selected: RegionCandidateDto | null;
}

/**
 * 지역 검색 입력.
 *
 * **후보를 하나로 좁혀주지 않는다.** "신정동"은 전국 5곳에 있어서
 * 시스템이 임의로 고르면 엉뚱한 지역을 보게 된다 (ToDo.md 5.1).
 */
export function RegionSearchInput({ onSelect, selected }: Props) {
  const [keyword, setKeyword] = useState('');
  const [candidates, setCandidates] = useState<RegionCandidateDto[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 입력할 때마다 부르지 않고 잠깐 멈췄을 때 부른다
  useEffect(() => {
    const trimmed = keyword.trim();
    if (trimmed === '') {
      setCandidates([]);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .searchRegions(trimmed)
        .then((result) => {
          if (!alive) return;
          setCandidates(result.candidates);
          setError(null);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof ApiError ? err.message : '지역을 찾는 중 문제가 생겼습니다.');
          setCandidates([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [keyword]);

  // 바깥을 누르면 목록을 닫는다
  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const choose = (region: RegionCandidateDto) => {
    onSelect(region);
    setKeyword('');
    setOpen(false);
  };

  return (
    <div className="region-search" ref={boxRef}>
      <label className="field-label" htmlFor="region-input">
        지역
      </label>

      {selected !== null && (
        <div className="region-selected">
          <span className="region-selected__name">{selected.fullName}</span>
          <span className="text-mono text-faint">{selected.code}</span>
        </div>
      )}

      <input
        id="region-input"
        className="input"
        type="search"
        value={keyword}
        placeholder={selected === null ? '예: 영통, 강남구, 미사' : '다른 지역으로 바꾸기'}
        onChange={(e) => setKeyword(e.target.value)}
        onFocus={() => candidates.length > 0 && setOpen(true)}
        autoComplete="off"
      />

      {error !== null && <p className="field-error">{error}</p>}

      {open && (
        <div className="region-dropdown panel-floating">
          {loading && candidates.length === 0 && <p className="region-empty">찾는 중…</p>}
          {!loading && candidates.length === 0 && (
            <p className="region-empty">
              &lsquo;{keyword}&rsquo; 에 해당하는 지역이 없습니다.
            </p>
          )}
          {candidates.length > 1 && (
            <p className="region-hint">
              같은 이름의 지역이 {candidates.length}곳 있습니다. 원하시는 곳을 골라주세요.
            </p>
          )}
          <ul className="region-list">
            {candidates.map((candidate) => (
              <li key={candidate.code}>
                <button type="button" className="region-item" onClick={() => choose(candidate)}>
                  <span className="region-item__name">{candidate.fullName}</span>
                  <span className="region-item__tags">
                    <span className="badge badge--neutral">{LEVEL_LABEL[candidate.level]}</span>
                    {candidate.matchType === 'alias' && (
                      <span className="badge badge--info">{MATCH_LABEL.alias}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
