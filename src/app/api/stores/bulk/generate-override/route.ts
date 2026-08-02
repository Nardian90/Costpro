/**
 * @file POST /api/stores/bulk/generate-override
 * @description Iteración 8 — Genera override_token para tiendas protegidas.
 *
 * Body: { confirmation_token: string, reason?: string }
 *
 * Requiere que el caller sea admin Y diferente al usuario que generó el
 * confirmation_token (doble aprobación).
 *
 * Retorna: { override_token: string, expires_at: string }
 *
 * SECURITY:
 *   - Solo admin
 *   - Override user debe ser diferente al confirmation_token created_by
 *   - Token NO se loggea
 *   - Token expira en 10 minutos
 *   - Single-use
 *   - Bound al confirmation_token + store_ids exactos
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const generateOverrideSchema = z.object({
  confirmation_token: z.string().min(1).max(100),
  reason: z.string().min(10).max(500).optional(),
});

async function generateOverrideHandler(req: NextRequest, session: AuthenticatedSession) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:bulk:generate-override:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const validated = generateOverrideSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { confirmation_token, reason } = validated.data;

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  const { data: overrideToken, error } = await supabase.rpc('generate_bulk_override_token', {
    p_confirmation_token: confirmation_token,
    p_override_user_id: session.user.id,
    p_reason: reason || null,
  });

  if (error) {
    const errMsg = error.message || '';

    if (errMsg.includes('ERR_INVALID_OR_EXPIRED_TOKEN')) {
      return NextResponse.json(createApiError('BULK_INVALID_CONFIRMATION_TOKEN'), { status: 400 });
    }
    if (errMsg.includes('ERR_OVERRIDE_REQUIRES_ADMIN')) {
      return NextResponse.json(createApiError('BULK_PERMISSION_DENIED'), { status: 403 });
    }
    if (errMsg.includes('ERR_SAME_USER_OVERRIDE')) {
      return NextResponse.json(createApiError('BULK_SAME_USER_OVERRIDE'), { status: 403 });
    }
    if (errMsg.includes('ERR_OVERRIDE_ALREADY_EXISTS')) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), message: 'Ya existe un override_token activo para esta operación' },
        { status: 400 }
      );
    }

    logger.error('DATABASE', 'BULK_OVERRIDE_GENERATION_FAILED', {
      error: errMsg,
      userId: session.user.id,
      // Do NOT log tokens
    });
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }

  // Fetch override token metadata
  const { data: tokenData } = await supabase
    .from('bulk_confirmation_tokens')
    .select('expires_at')
    .eq('token', overrideToken as string)
    .single();

  logger.info('DATABASE', 'BULK_OVERRIDE_GENERATED', {
    userId: session.user.id,
    reason: reason || null,
    // Do NOT log tokens or store_ids
  });

  return NextResponse.json({
    override_token: overrideToken,
    expires_at: tokenData?.expires_at || null,
    generated_by: session.user.id,
  });
}

export const POST = withTracing(
  withRole('admin', generateOverrideHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bulk/generate-override'
);
