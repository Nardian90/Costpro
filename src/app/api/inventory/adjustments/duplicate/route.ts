/**
 * POST /api/inventory/adjustments/duplicate — duplicar un ajuste existente
 *
 * V2.4.2: Usa la RPC atómica `duplicate_inventory_adjustment` en vez de
 * read-modify-write manual. Evita race conditions.
 *
 * Body: { original_id: UUID }
 *
 * Respuesta: { id, status, adjustment_number, items_duplicated }
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

const schema = z.object({
  original_id: z.string().regex(uuidRegex, 'original_id inválido'),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`adj-dup:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // 1. Pre-validación: cargar ajuste original para check canManageStore (defense-in-depth)
  const { data: orig, error: e1 } = await supabase
    .from('inventory_adjustments')
    .select('store_id')
    .eq('id', parsed.data.original_id)
    .single();

  if (e1 || !orig) {
    return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });
  }

  // V2.4.2: canManageStore defense-in-depth (la RPC también valida con has_store_access_as)
  if (!canManageStore(session.user, orig.store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // 2. Llamar RPC atómica duplicate_inventory_adjustment
  const { data: result, error: rpcError } = await supabase.rpc('duplicate_inventory_adjustment', {
    p_original_id: parsed.data.original_id,
    p_user_id: session.user.id,
  });

  if (rpcError) {
    logger.error('DATABASE', 'DUPLICATE_ADJ_RPC_FAILED', {
      error: rpcError.message,
      originalId: parsed.data.original_id,
      userId: session.user.id,
    });

    const msg = rpcError.message || '';
    let status = 500;
    if (msg.includes('ERR_UNAUTHORIZED')) status = 403;
    else if (msg.includes('ERR_ADJUSTMENT_NOT_FOUND')) status = 404;
    return NextResponse.json({ error: msg }, { status });
  }

  logger.info('DATABASE', 'ADJUSTMENT_DUPLICATED', {
    originalId: parsed.data.original_id,
    newId: result?.id,
    itemsDuplicated: result?.items_duplicated,
    userId: session.user.id,
  });

  return NextResponse.json(result);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/inventory/adjustments/duplicate');
