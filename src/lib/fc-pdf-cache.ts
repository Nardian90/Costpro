
import { Redis } from 'ioredis';
import { logger } from './logger';

// ── Configuration ──────────────────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const CACHE_TTL_SECONDS = 3600; // 1 hour
const MAX_CACHE_SIZE = 100;    // max PDFs in memory (per instance)

// ── Types ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  pdfBuffer: Buffer;
  contentType: string;
  createdAt: number;
  lastAccessed: number;
}

// ── Memory Cache (L1) ──────────────────────────────────────────────────────

const memoryCache = new Map<string, CacheEntry>();

function getMemoryCachedPdf(key: string): { pdfBuffer: Buffer; contentType: string } | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  // Cleanup if too old
  if (Date.now() - entry.createdAt > CACHE_TTL_SECONDS * 1000) {
    memoryCache.delete(key);
    return null;
  }

  entry.lastAccessed = Date.now();
  return { pdfBuffer: entry.pdfBuffer, contentType: entry.contentType };
}

function setMemoryCachedPdf(key: string, pdfBuffer: Buffer, contentType: string): void {
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    Array.from(memoryCache.entries()).forEach(([k, v]) => {
      if (v.lastAccessed < oldestTime) { oldestTime = v.lastAccessed; oldestKey = k; }
    });
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { pdfBuffer, contentType, createdAt: Date.now(), lastAccessed: Date.now() });
}

function invalidateMemoryCache(storeId: string, productId?: string): number {
  let count = 0;
  const prefix = productId ? `${storeId}:${productId}:` : `${storeId}:`;
  Array.from(memoryCache.keys()).forEach(key => {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      count++;
    }
  });
  return count;
}

// ── Redis Cache (L2) ───────────────────────────────────────────────────────

let redis: Redis | null = null;
if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL);
  } catch (err) {
    console.error('[Redis] Connection failed:', err);
  }
}

// ── Public API (dual-mode) ─────────────────────────────────────────────────

export const fcPdfCache = {
  async get(storeId: string, productId: string, format: string): Promise<{ pdfBuffer: Buffer; contentType: string } | null> {
    const key = `${storeId}:${productId}:${format}`;

    // 1. Try memory
    const mem = getMemoryCachedPdf(key);
    if (mem) return mem;

    // 2. Try Redis
    if (redis) {
      try {
        const data = await redis.getBuffer(key);
        if (data) {
          const contentType = await redis.get(`${key}:type`) || 'application/pdf';
          // Populate memory cache
          setMemoryCachedPdf(key, data, contentType);
          return { pdfBuffer: data, contentType };
        }
      } catch (err) {
        logger.warn('SYSTEM', 'REDIS_GET_FAILED', { key, error: (err as any).message });
      }
    }

    return null;
  },

  async set(storeId: string, productId: string, format: string, pdfBuffer: Buffer, contentType: string = 'application/pdf'): Promise<void> {
    const key = `${storeId}:${productId}:${format}`;

    // 1. Set memory
    setMemoryCachedPdf(key, pdfBuffer, contentType);

    // 2. Set Redis
    if (redis) {
      try {
        await redis.setex(key, CACHE_TTL_SECONDS, pdfBuffer);
        await redis.setex(`${key}:type`, CACHE_TTL_SECONDS, contentType);
      } catch (err) {
        logger.warn('SYSTEM', 'REDIS_SET_FAILED', { key, error: (err as any).message });
      }
    }
  },

  async invalidate(storeId: string, productId?: string): Promise<number> {
    // 1. Invalidate memory
    const count = invalidateMemoryCache(storeId, productId);

    // 2. Invalidate Redis (harder to prefix-match, usually we just wait for TTL or handle specifically)
    // For now we rely on TTL in Redis and proactive invalidation in memory.

    return count;
  }
};
