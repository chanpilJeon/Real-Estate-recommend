'use client';

export interface Conditions {
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  builtAfter?: number;
  minHouseholds?: number;
  sort: string;
}

interface Props {
  value: Conditions;
  onChange: (next: Conditions) => void;
}

/** 예산은 억 단위로 입력받고 내부에서는 만원으로 다룬다 (API 단위와 맞추기 위해) */
const EOK = 10_000;

const AREA_PRESETS = [
  { label: '전체', min: undefined, max: undefined },
  { label: '~60㎡', min: undefined, max: 60 },
  { label: '60~85㎡', min: 60, max: 85 },
  { label: '85~135㎡', min: 85, max: 135 },
  { label: '135㎡~', min: 135, max: undefined },
];

const SORTS = [
  { value: 'price', label: '가격 낮은 순' },
  { value: 'households', label: '세대수 많은 순' },
  { value: 'newest', label: '신축 순' },
  { value: 'quality', label: '단지 점수 순' },
];

export function ConditionPanel({ value, onChange }: Props) {
  const set = (patch: Partial<Conditions>) => onChange({ ...value, ...patch });

  const eokValue = (manwon: number | undefined): string =>
    manwon === undefined ? '' : String(manwon / EOK);

  const setEok = (key: 'priceMin' | 'priceMax', raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') return set({ [key]: undefined } as Partial<Conditions>);
    const eok = Number(trimmed);
    if (!Number.isFinite(eok) || eok < 0) return;
    set({ [key]: Math.round(eok * EOK) } as Partial<Conditions>);
  };

  const areaActive = (preset: (typeof AREA_PRESETS)[number]): boolean =>
    value.areaMin === preset.min && value.areaMax === preset.max;

  return (
    <div className="condition-panel stack stack--6">
      <div className="stack stack--2">
        <span className="field-label">예산 (억원)</span>
        <div className="range-row">
          <input
            className="input"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            placeholder="최소"
            value={eokValue(value.priceMin)}
            onChange={(e) => setEok('priceMin', e.target.value)}
            aria-label="예산 최소 (억원)"
          />
          <span className="range-row__tilde">~</span>
          <input
            className="input"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            placeholder="최대"
            value={eokValue(value.priceMax)}
            onChange={(e) => setEok('priceMax', e.target.value)}
            aria-label="예산 최대 (억원)"
          />
        </div>
        <p className="field-hint">최근 6개월 실거래 중위가 기준입니다 (직거래 등 이상치 제외).</p>
      </div>

      <div className="stack stack--2">
        <span className="field-label">전용면적</span>
        <div className="chip-row">
          {AREA_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`chip ${areaActive(preset) ? 'chip--on' : ''}`}
              onClick={() => set({ areaMin: preset.min, areaMax: preset.max })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stack stack--2">
        <span className="field-label">최소 세대수</span>
        <div className="chip-row">
          {[undefined, 300, 500, 1000].map((n) => (
            <button
              key={String(n)}
              type="button"
              className={`chip ${value.minHouseholds === n ? 'chip--on' : ''}`}
              onClick={() => set({ minHouseholds: n })}
            >
              {n === undefined ? '전체' : `${n.toLocaleString()}세대~`}
            </button>
          ))}
        </div>
      </div>

      <div className="stack stack--2">
        <span className="field-label">사용승인 연도</span>
        <div className="chip-row">
          {[undefined, 2000, 2010, 2020].map((year) => (
            <button
              key={String(year)}
              type="button"
              className={`chip ${value.builtAfter === year ? 'chip--on' : ''}`}
              onClick={() => set({ builtAfter: year })}
            >
              {year === undefined ? '전체' : `${year}년~`}
            </button>
          ))}
        </div>
      </div>

      <div className="stack stack--2">
        <label className="field-label" htmlFor="sort-select">
          정렬
        </label>
        <select
          id="sort-select"
          className="input"
          value={value.sort}
          onChange={(e) => set({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
