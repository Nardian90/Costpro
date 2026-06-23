/**
 * F6-T04: Rate limiting y cuotas por plan de tenant.
 */

import { rateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const PLAN_LIMITS = {
  free: { rateLimitPerMinute: 5, maxStores: 3, maxFCsPerDay: 10, bulkOpsPerHour: 1 },
  pro: { rateLimitPerMinute: 50, maxStores: 20, maxFCsPerDay: Infinity, bulkOpsPerHour: 20 },
  enterprise: { rateLimitPerMinute: 500, maxStores: Infinity, maxFCsPerDay: Infinity, bulkOpsPerHour: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export type QuotaResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt?: number;
  reason?: string;
};

export async function checkTenantRateLimit(userId: string, plan: Plan, ip: string): Promise<QuotaResult> {
  const limits = PLAN_LIMITS[plan];
  const rlKey = `tenant:${userId}:${plan}:${ip}`;
  const { allowed, remaining, resetAt } = await rateLimit(rlKey, {
    windowMs: 60_000, maxRequests: limits.rateLimitPerMinute,
  });
  // Audit-Fix #2d: rateLimit devuelve resetAt: Date, pero QuotaResult espera number.
  // Convertimos Date → number (epoch ms) para compatibilidad de tipos.
  return { allowed, remaining, limit: limits.rateLimitPerMinute, resetAt: resetAt instanceof Date ? resetAt.getTime() : resetAt,
    reason: allowed ? undefined : `Rate limit excedido (${limits.rateLimitPerMinute} req/min para plan ${plan})` };
}

export async function checkStoreQuota(userId: string, plan: Plan): Promise<QuotaResult> {
  const limits = PLAN_LIMITS[plan];
  if (limits.maxStores === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity };

  const { count, error } = await supabase
    .from('stores').select(undefined, { count: 'exact', head: true }).eq('is_active', true);

  if (error) {
    logger.warn('QUOTA', 'STORE_QUOTA_CHECK_FAILED', { userId, error: error.message });
    return { allowed: true, remaining: 1, limit: limits.maxStores };
  }

  const current = count ?? 0;
  const allowed = current < limits.maxStores;
  return { allowed, remaining: Math.max(0, limits.maxStores - current), limit: limits.maxStores,
    reason: allowed ? undefined : `Límite de ${limits.maxStores} tiendas alcanzado (plan ${plan})` };
}

export function rateLimitHeaders(result: QuotaResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    ...(result.resetAt ? { 'X-RateLimit-Reset': String(result.resetAt) } : {}),
  };
}
