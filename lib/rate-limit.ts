// Simple in-memory sliding-window rate limiter.
// Good enough for a single server / local dev; on serverless (Vercel) each
// warm instance keeps its own window — still blocks bursts and bot loops.
// Swap for Upstash Redis (@upstash/ratelimit) when traffic gets real.

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Occasionally sweep expired windows so the map can't grow forever.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Returns true when `key` is allowed another attempt.
 * @param key      unique key, e.g. "login:user@mail.com" or "signup:1.2.3.4"
 * @param limit    max attempts inside the window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);

  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/** Clear a key after success (e.g. correct password) so honest users never lock out. */
export function rateLimitReset(key: string) {
  buckets.delete(key);
}

/** Best-effort client IP for keying (works on Vercel / behind proxies). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}
