'use client';

import type { ComplexSummaryDto } from '@apt/shared';
import { useEffect, useRef, useState } from 'react';

import { formatManwon } from '../lib/api-client';

const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';
const SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false&libraries=clusterer`;
const SCRIPT_ID = 'kakao-maps-sdk';
/** 지도가 안 뜨는 원인을 오래 기다리게 하지 않는다 */
const LOAD_TIMEOUT_MS = 8_000;

// 카카오 SDK 는 전역 객체로 온다. 필요한 부분만 최소로 선언한다.
interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoMapInstance {
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
}
interface KakaoOverlay {
  setMap(map: KakaoMapInstance | null): void;
}
interface KakaoBounds {
  extend(latlng: KakaoLatLng): void;
  isEmpty(): boolean;
}
interface KakaoNamespace {
  maps: {
    load(callback: () => void): void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoBounds;
    Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance & {
      setBounds(bounds: KakaoBounds): void;
    };
    CustomOverlay: new (options: {
      position: KakaoLatLng;
      content: HTMLElement;
      yAnchor?: number;
      clickable?: boolean;
    }) => KakaoOverlay;
  };
}
declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

type LoadState = 'idle' | 'loading' | 'ready' | 'no-key' | 'failed';

interface Props {
  items: ComplexSummaryDto[];
  selectedId: number | null;
  onSelect: (complex: ComplexSummaryDto) => void;
}

/**
 * 카카오맵.
 *
 * **키가 없거나 서비스가 꺼져 있어도 화면이 깨지지 않는다.**
 * 지도 자리에 무엇을 해야 하는지 적어 두고, 목록·차트는 그대로 동작한다.
 * (ToDo.md 2.1-6 외부 시스템 격리 — 지도도 여기 한 파일에 가둔다)
 */
export function KakaoMap({ items, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<(KakaoMapInstance & { setBounds(b: KakaoBounds): void }) | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  const [state, setState] = useState<LoadState>(JS_KEY === '' ? 'no-key' : 'idle');

  // 1) SDK 를 한 번만 불러온다
  useEffect(() => {
    if (JS_KEY === '') return;
    if (window.kakao?.maps !== undefined) {
      setState('ready');
      return;
    }

    setState('loading');
    const timer = setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), LOAD_TIMEOUT_MS);

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');

    const onLoad = () => {
      window.kakao?.maps.load(() => {
        clearTimeout(timer);
        setState('ready');
      });
    };
    const onError = () => {
      clearTimeout(timer);
      setState('failed');
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    if (existing === null) {
      script.id = SCRIPT_ID;
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.kakao?.maps !== undefined) {
      onLoad();
    }

    return () => {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, []);

  // 2) 지도 생성
  useEffect(() => {
    if (state !== 'ready' || containerRef.current === null || mapRef.current !== null) return;
    const kakao = window.kakao;
    if (kakao === undefined) return;

    mapRef.current = new kakao.maps.Map(containerRef.current, {
      center: new kakao.maps.LatLng(37.4979, 127.0276),
      level: 5,
    });
  }, [state]);

  // 3) 단지 마커(가격 라벨) 다시 그리기
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (state !== 'ready' || kakao === undefined || map === null) return;

    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();
    let plotted = 0;

    for (const item of items) {
      if (item.lat === null || item.lng === null) continue; // 좌표를 못 구한 단지

      const position = new kakao.maps.LatLng(item.lat, item.lng);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `map-pin ${selectedId === item.id ? 'map-pin--on' : ''}`;
      el.innerHTML = `<span class="map-pin__price">${formatManwon(item.medianPriceManwon)}</span><span class="map-pin__name">${escapeHtml(item.name)}</span>`;
      el.addEventListener('click', () => onSelect(item));

      const overlay = new kakao.maps.CustomOverlay({ position, content: el, yAnchor: 1, clickable: true });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      bounds.extend(position);
      plotted += 1;
    }

    if (plotted > 0 && !bounds.isEmpty()) map.setBounds(bounds);
  }, [items, selectedId, state, onSelect]);

  if (state === 'ready') return <div className="map-canvas" ref={containerRef} />;

  return (
    <div className="map-placeholder">
      <div className="stack stack--2" style={{ maxWidth: 360, textAlign: 'center' }}>
        {state === 'no-key' && (
          <>
            <span className="badge badge--warning">지도 키 없음</span>
            <p style={{ color: 'var(--color-text-primary)' }}>지도를 표시하려면 카카오 키가 필요합니다.</p>
            <p className="text-muted">
              <code className="text-mono">.env</code> 파일의{' '}
              <code className="text-mono">NEXT_PUBLIC_KAKAO_JS_KEY</code> 를 채우고 서버를 다시 켜세요.
            </p>
          </>
        )}
        {state === 'loading' && <p className="text-muted">지도를 불러오는 중…</p>}
        {state === 'failed' && (
          <>
            <span className="badge badge--error">지도를 불러오지 못했습니다</span>
            <p className="text-muted">
              카카오 개발자 콘솔에서 두 가지를 확인해 주세요.
              <br />① [카카오맵] &gt; [사용 설정] 상태가 <strong>ON</strong> 인지
              <br />② JavaScript 키에 <code className="text-mono">http://localhost:3000</code> 도메인이 등록됐는지
            </p>
          </>
        )}
        <p className="text-faint" style={{ fontSize: 'var(--text-micro)' }}>
          지도가 없어도 목록·필터·실거래 추이는 그대로 사용할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

/** 단지명이 마커 HTML 로 들어가므로 이스케이프한다 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}
