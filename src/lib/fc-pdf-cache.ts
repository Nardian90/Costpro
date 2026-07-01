/**
 * Dual-mode PDF cache for generated FC PDFs.
 *
 * Production: Redis-backed (persistent across server restarts, shared across instances)
 * Development/Fallback: In-memory LRU (no external dependencies)
 *
 * Keys: `fc-pdf:${storeId}:${productId}:${pdfFormat}`
 * Invalidated when FCInvalidationEvent is received.
 * Also fixes the wildcard invalidation bug (uses startsWith instead of exact match).
 */

import { Redis } from 'ioredis';

// ── Configuration ──────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REDIS_KEY_PREFIX = 'fc-pdf:';
const REDIS_TTL_SECONDS = 5 * 60; // 5 minutes

// ── Redis Client (lazy singleton) ──────────────────────────────────────────

let redis: Redis | null = null;
let redisAvailable = false;

async function getRedis(): Promise<Redis | null> {
  if (redis) return redisAvailable ? redis : null;

  const redisUrl = process.env.REDIS_URL || process.env.KV_REST_API_URL;
  if (!redisUrl) {
    redisAvailable = false;
    return null;
  }

  try {
    // Use REST API URL format (Upstash) or direct Redis URL
    const connectionUrl = redisUrl.includes('.upstash.io')
      ? redisUrl.replace(/^https?:\/\//, 'rediss://')
      : redisUrl;

    redis = new Redis(connectionUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await redis.ping();
    redisAvailable = true;
    return redis;
  } catch {
    redisAvailable = false;
    console.warn('[FC-PDF-Cache] Redis unavailable, falling back to in-memory cache');
    return null;
  }
}

// ── In-memory LRU fallback ─────────────────────────────────────────────────

interface CacheEntry {
  pdfBuffer: Buffer;
  contentType: string;
  createdAt: number;
  lastAccessed: number;
}

const memoryCache = new Map<string, CacheEntry>();

function getMemoryCachedPdf(key: string): Buffer | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  entry.lastAccessed = Date.now();
  return entry.pdfBuffer;
}

function setMemoryCachedPdf(key: string, pdfBuffer: Buffer, contentType: string): void {
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of memoryCache) {
      if (v.lastAccessed < oldestTime) { oldestTime = v.lastAccessed; oldestKey = k; }
    }
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { pdfBuffer, contentType, createdAt: Date.now(), lastAccessed: Date.now() });
}

function invalidateMemoryCache(storeId: string, productId?: string): number {
  let count = 0;
  const prefix = productId ? `${storeId}:${productId}:` : `${storeId}:`;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      count++;
    }
  }
  return count;
}

// ── Public API (dual-mode) ─────────────────────────────────────────────────

export async function getCachedPdf(key: string): Promise<Buffer | null> {
  const redisClient = await getRedis();
  const fullKey = `${REDIS_KEY_PREFIX}${key}`;

  // Try Redis first
  if (redisClient) {
    try {
      const cached = await redisClient.getBuffer(fullKey);
      if (cached) return cached;
    } catch {
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory
  return getMemoryCachedPdf(key);
}

export async function setCachedPdf(key: string, pdfBuffer: Buffer, contentType: string): Promise<void> {
  const fullKey = `${REDIS_KEY_PREFIX}${key}`;

  // Set in Redis (primary)
  const redisClient = await getRedis();
  if (redisClient) {
    try {
      await redisClient.set(fullKey, pdfBuffer, 'PX', REDIS_TTL_SECONDS * 1000);
      return; // Don't double-cache in memory when Redis is available
    } catch {
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory
  setMemoryCachedPdf(key, pdfBuffer, contentType);
}

export async function invalidateCache(storeId: string, productId?: string): Promise<number> {
  let totalInvalidated = 0;

  // Invalidate Redis entries
  const redisClient = await getRedis();
  if (redisClient) {
    try {
      const pattern = productId
        ? `${REDIS_KEY_PREFIX}${storeId}:${productId}:*`
        : `${REDIS_KEY_PREFIX}${storeId}:*`;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        totalInvalidated += await redisClient.del(...keys);
      }
    } catch {
      // Continue with memory invalidation
    }
  }

  // Invalidate in-memory entries (always, as fallback may have data)
  totalInvalidated += invalidateMemoryCache(storeId, productId);

  return totalInvalidated;
}

export function buildCacheKey(storeId: string, productId: string, pdfFormat: string): string {
  return `${storeId}:${productId}:${pdfFormat}`;
}

export async function getCacheStats() {
  const redisClient = await getRedis();
  let redisKeys = 0;

  if (redisClient) {
    try {
      const keys = await redisClient.keys(`${REDIS_KEY_PREFIX}*`);
      redisKeys = keys.length;
    } catch {
      // Ignore
    }
  }

  return {
    mode: redisClient ? 'redis' : 'memory',
    redisKeys,
    memorySize: memoryCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}
