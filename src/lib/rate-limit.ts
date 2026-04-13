// Simple in-memory rate limiter (no external deps)
// Uses a Map with auto-cleanup of expired entries

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60_000; // Clean up every minute

// Auto-cleanup stale entries
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetTime) store.delete(key);
    }
  }, CLEANUP_INTERVAL);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export function rateLimit(
  identifier: string,
  options: { windowMs?: number; maxRequests?: number } = {}
): RateLimitResult {
  const { windowMs = 60_000, maxRequests = 30 } = options;
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetTime) {
    store.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetTime) };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: new Date(entry.resetTime) };
}
