/** search 모듈 공개 API (ToDo.md 2.1-5) */
export { SearchModule } from './search.module';
export { ComplexSearchService, type SortKey } from './complex-search.service';
export { SearchCondition, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './domain/search-condition';
export { SEARCH_REPOSITORY, type ISearchRepository, type CollectedRegion } from './search.repository';
export { buildResultNote, toKoreanMoney } from './domain/result-note';
