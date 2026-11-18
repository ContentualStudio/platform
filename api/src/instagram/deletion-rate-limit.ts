/**
 * A small fixed-window limiter for the one public, unauthenticated endpoint in
 * this api.
 *
 * In-memory, and therefore per-replica. That is a real limitation, stated
 * rather than hidden: the api has no Redis of its own (the Upstash limiter
 * lives in the web app, which this endpoint does not pass through), and pulling
 * a new dependency in for a single route is a worse trade than an approximate
 * limit. The actual duplicate-request defence is the recorded confirmation
 * code, which is exact and shared across replicas.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** True when the caller is within its allowance. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return true;
    }

    if (entry.count >= this.limit) {
      return false;
    }

    entry.count += 1;

    return true;
  }

  // Without this the map is an unbounded cache keyed on caller-controlled
  // input, which is a slow memory leak with a hostile caller behind it.
  private sweep(now: number): void {
    if (this.hits.size < 1_000) {
      return;
    }

    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
