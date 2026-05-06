// src/lib/auth-rate-limit.ts
// Server-side brute-force protection for authentication

interface AuthAttempt {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AuthAttempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of attempts) {
    if (!attempt.lockedUntil && now - attempt.firstAttemptAt > WINDOW_MS) {
      attempts.delete(key);
    } else if (attempt.lockedUntil && now > attempt.lockedUntil) {
      attempts.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function checkAuthRateLimit(identifier: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let attempt = attempts.get(identifier);

  if (!attempt) {
    attempts.set(identifier, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return { allowed: true, retryAfterMs: 0 };
  }

  // Check lockout
  if (attempt.lockedUntil) {
    if (now < attempt.lockedUntil) {
      return { allowed: false, retryAfterMs: attempt.lockedUntil - now };
    }
    // Lockout expired, reset
    attempt.count = 0;
    attempt.lockedUntil = null;
  }

  // Check window
  if (now - attempt.firstAttemptAt > WINDOW_MS) {
    attempt.count = 0;
    attempt.firstAttemptAt = now;
  }

  attempt.count++;

  if (attempt.count > MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false, retryAfterMs: LOCKOUT_MS };
  }

  // Progressive delay: 1s, 2s, 4s, 8s after attempts 3, 4, 5
  const delayMs = attempt.count >= 3 ? Math.pow(2, attempt.count - 3) * 1000 : 0;

  return { allowed: true, retryAfterMs: delayMs };
}

export function resetAuthRateLimit(identifier: string): void {
  attempts.delete(identifier);
}
