/**
 * A best-effort request limiter, held in memory.
 *
 * BE CLEAR ABOUT WHAT THIS IS NOT, because an in-memory limiter on a serverless platform is
 * easy to mistake for a guarantee. Each instance keeps its own counters, so N warm instances
 * allow N times the configured rate, a cold start begins with an empty window, and nothing is
 * shared between regions. It cannot enforce a global rate and does not try to.
 *
 * WHAT IT DOES BUY, which is the reason it exists: the leaderboard's PUT verifies a reCAPTCHA
 * token, and every attempt -- valid or not -- was a round trip to Google. An endpoint that
 * turns one cheap request into one outbound request is an amplifier, and the naive version of
 * that abuse comes from one address in a tight loop, which lands on one instance and is exactly
 * what this stops. It is a speed bump in front of a third party, not access control.
 *
 * A real limit needs shared state -- Redis, or Vercel's own WAF and BotID, which are platform
 * configuration rather than code. That trade is recorded in the README so choosing it later is
 * a decision rather than a discovery.
 *
 * No dependency, and no timer. Entries are pruned when the map is next read, so an idle
 * instance holds whatever it last saw until it is recycled. With one bucket per address and a
 * hard cap on distinct buckets, that is bounded.
 */

/** Distinct buckets kept before the oldest are dropped, so a spray of addresses cannot grow
 *  this without bound. */
const MAX_BUCKETS = 5_000;

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/**
 * The caller's address, as far as it can be known.
 *
 * `x-forwarded-for` is set by Vercel's proxy and its FIRST entry is the client; later entries
 * are proxies and a client may append its own, so taking the last would let anyone choose
 * their own bucket. Absent — a direct request in development — everything shares one bucket,
 * which limits more aggressively rather than less. That is the right way round for a limiter.
 */
export function requestKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export type RateLimitOptions = {
  /** Requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable so tests do not depend on the clock. */
  now?: () => number;
};

/**
 * Records an attempt and reports whether it is within the limit.
 *
 * Counts the attempt even when it refuses it, deliberately: a caller hammering the endpoint
 * should stay refused for the whole window rather than getting one through per interval.
 */
export function withinRateLimit(
  key: string,
  { limit, windowMs, now = Date.now }: RateLimitOptions,
): boolean {
  const currentTime = now();
  const cutoff = currentTime - windowMs;

  const recent = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  recent.push(currentTime);
  buckets.set(key, recent);

  if (buckets.size > MAX_BUCKETS) {
    // Oldest insertion first, which is the order a Map iterates. Dropping a bucket only
    // forgives a caller; it cannot refuse one that should be allowed.
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }

  return recent.length <= limit;
}

/** Test seam. Nothing in the application calls this. */
export function resetRateLimit(): void {
  buckets.clear();
}
