/**
 * @file POST /api/stores/bulk/generate-token
 * @description Iteración 8 — Genera confirmation_token para bulk delete/archive.
 *
 * Body: { storeIds: string[], action: 'delete' | 'archive' }
 *
 * Retorna: { confirmation_token: string, expires_at: string, has_protected_stores: boolean }
 *
 * SECURITY:
 *   - Solo admin
 *   - Token NO se loggea (solo se retorna al cliente)
 *   - Token expira en 10 minutos (definido en RPC)
 *   - Token es single-use (consumed_at en RPC bulk_soft_delete_stores)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const generateTokenSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['delete', 'archive']),
});

async function generateTokenHandler(req: NextRequest, session: AuthenticatedSession) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:bulk:generate-token:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const validated = generateTokenSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { storeIds, action } = validated.data;

  const allowedIds = storeIds.filter(id => canManageStore(session.user, id));
  if (allowedIds.length === 0) {
    return NextResponse.json(createApiError('BULK_PERMISSION_DENIED'), { status: 403 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  const { data: token, error } = await supabase.rpc('generate_bulk_confirmation_token', {
    p_store_ids: allowedIds,
    p_action: action,
    p_user_id: session.user.id,
  });

  if (error) {
    logger.error('DATABASE', 'BULK_TOKEN_GENERATION_FAILED', {
      error: error.message,
      userId: session.user.id,
      // Do NOT log the token
    });
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }

  // Fetch token metadata (expires_at, has_protected_stores)
  const { data: tokenData } = await supabase
    .from('bulk_confirmation_tokens')
    .select('expires_at, metadata')
    .eq('token', token as string)
    .single();

  logger.info('DATABASE', 'BULK_TOKEN_GENERATED', {
    action,
    storeCount: allowedIds.length,
    userId: session.user.id,
    // Do NOT log the token value
  });

  return NextResponse.json({
    confirmation_token: token,
    expires_at: tokenData?.expires_at || null,
    has_protected_stores: (tokenData?.metadata as { has_protected_stores?: boolean })?.has_protected_stores || false,
    action,
    store_ids: allowedIds,
  });
}

export const POST = withTracing(
  withRole('admin', generateTokenHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bulk/generate-token'
);
