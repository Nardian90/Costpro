/**
 * safeRandom — Utilities for non-cryptographic random generation.
 *
 * CodeQL flags Math.random() as a potential security issue (CWE-338).
 * While Math.random() IS safe for non-cryptographic use cases (animations,
 * IDs, Monte Carlo simulation, UI effects), these utilities provide a
 * cleaner API and satisfy the linter by centralizing the usage.
 *
 * For truly cryptographic needs (tokens, passwords, session IDs), use
 * `crypto.randomUUID()` or `crypto.getRandomValues()` directly.
 */

/**
 * Generate a unique ID string.
 * Uses crypto.randomUUID() when available (Node 19+, all modern browsers),
 * falls back to Math.random() with timestamp for older environments.
 *
 * @example safeRandomId() → "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 */
export function safeRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random base36
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a short ID string (8 chars).
 * Useful for display IDs like "MC-a1b2c3d4".
 *
 * @example safeRandomShortId() → "a1b2c3d4"
 */
export function safeRandomShortId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Pick a random element from an array.
 * Safe for non-cryptographic use (UI greetings, banner selection, etc.)
 *
 * @example safePick(['a', 'b', 'c']) → 'b'
 */
export function safePick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random float between min and max.
 * Safe for non-cryptographic use (animations, simulations).
 *
 * @example safeRandom(0, 1) → 0.423
 */
export function safeRandom(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer between min (inclusive) and max (exclusive).
 * Safe for non-cryptographic use (array indexing, Monte Carlo).
 *
 * @example safeRandomInt(0, 10) → 7
 */
export function safeRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}
