/**
 * 아주 작은 TTL 캐시 (ToDo.md 3.8: 집계 결과 5분 인메모리 캐시).
 *
 * 중위가·추이 조회가 트래픽의 대부분인데, 실거래 데이터는 하루 한 번만 바뀐다.
 * 매 요청마다 다시 계산할 이유가 없다.
 *
 * 프로세스 안에만 산다 — 서버가 여러 대가 되면 각자 따로 캐시한다.
 * 5분이면 어긋나도 문제될 정도가 아니라 지금은 이걸로 충분하다.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
    /** 무한정 커지지 않도록 상한을 둔다 */
    private readonly maxEntries = 1_000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) this.evictOldest();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** 있으면 그대로, 없으면 계산해서 넣는다 */
  async through(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /** 수집 배치가 새 데이터를 넣은 뒤 호출한다 */
  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    // 만료된 것부터 정리하고, 그래도 꽉 차 있으면 가장 먼저 들어온 것을 뺀다
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }
}
