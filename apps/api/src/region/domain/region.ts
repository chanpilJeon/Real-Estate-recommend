import { RegionCode } from '@apt/shared';

export type RegionLevel = 'sido' | 'sigungu' | 'dong';

/**
 * 지역 도메인 모델 (ToDo.md 3.3).
 *
 * 순수 TypeScript — NestJS·Prisma 를 모른다. DB 없이 단위 테스트가 돈다.
 */
export class Region {
  constructor(
    readonly code: RegionCode,
    readonly sido: string,
    readonly sigungu: string,
    readonly dong: string | null,
  ) {}

  /**
   * 사람이 읽는 전체 이름. "경기도 수원시 영통구 영통동"
   *
   * 세종특별자치시처럼 시군구 단계가 없는 곳은 시도명이 sigungu 에도 들어 있다.
   * 그대로 이으면 "세종특별자치시 세종특별자치시 반곡동" 이 되므로 중복을 걷어낸다.
   */
  fullName(): string {
    const parts = [this.sido];
    if (this.sigungu !== '' && this.sigungu !== this.sido) parts.push(this.sigungu);
    if (this.dong !== null && this.dong !== '') parts.push(this.dong);
    return parts.join(' ');
  }

  level(): RegionLevel {
    if (this.dong !== null && this.dong !== '') return 'dong';
    if (this.sigungu !== '') return 'sigungu';
    return 'sido';
  }

  isDongLevel(): boolean {
    return this.level() === 'dong';
  }

  /** 검색어가 이 지역의 이름과 정확히 일치하는가 (부분일치와 구분하기 위함) */
  matchesExactly(keyword: string): boolean {
    return this.sido === keyword || this.sigungu === keyword || this.dong === keyword;
  }
}
