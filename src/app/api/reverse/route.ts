/**
 * POST /api/reverse — reversión de documentos contables
 *
 * Body: { type: 'transaction'|'receipt'|'transfer'|'adjustment'|'devolution'|'production_order', id: UUID, reason: string }
 *
 * Invoca la RPC correspondiente para revertir la operación:
 * - Devuelve/descuenta stock afectado (productos + lotes + output de producción)
 * - Crea kardex entries de reversión (reference_type='reversal')
 * - Marca el documento como 'reversed'/'REVERSADA'
 * - Registra quien revirtió y por qué (reversed_at, reversed_by, reversal_reason)
 *
 * V2.3: añadido soporte para production_order + limpiado código muerto.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const reverseSchema = z.object({
  type: z.enum(['transaction', 'receipt', 'transfer', 'adjustment', 'devolution', 'production_order']),
  id: z.string().min(1),
  reason: z.string().min(3).max(500),
});

/** V2.3: cada tipo mapea a (rpc_name, id_param_name). SÓLO ese param se envía. */
const RPC_MAP: Record<string, { rpc: string; idParam: string }> = {
  transaction:      { rpc: 'reverse_transaction',        idParam: 'p_transaction_id' },
  receipt:          { rpc: 'reverse_receipt',            idParam: 'p_receipt_id' },
  transfer:         { rpc: 'reverse_transfer',           idParam: 'p_transfer_id' },
  adjustment:       { rpc: 'reverse_adjustment',         idParam: 'p_adjustment_id' },
  devolution:       { rpc: 'reverse_devolution',         idParam: 'p_devolution_id' },
  production_order: { rpc: 'reverse_production_order',   idParam: 'p_order_id' },
};

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`reverse:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = reverseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const mapping = RPC_MAP[parsed.data.type];
  if (!mapping) {
    return NextResponse.json({ error: 'Tipo de documento no soportado' }, { status: 400 });
  }

  // V2.3: enviar SOLO los params relevantes a la RPC
  const rpcParams: Record<string, unknown> = {
    [mapping.idParam]: parsed.data.id,
    p_reason: parsed.data.reason,
    p_user_id: session.user.id,
  };

  const { data: rpcResult, error: rpcError } = await supabase.rpc(mapping.rpc, rpcParams);

  if (rpcError) {
    logger.error('DATABASE', 'REVERSE_FAILED', {
      type: parsed.data.type, id: parsed.data.id, error: rpcError.message, userId: session.user.id,
    });
    // Mensaje amigable para errores conocidos
    const msg = rpcError.message || '';
    let status = 500;
    if (msg.includes('ERR_ALREADY_REVERSED')) status = 409;
    else if (msg.includes('ERR_ALREADY_VOIDED')) status = 409;
    else if (msg.includes('ERR_NOT_CONFIRMED')) status = 422;
    else if (msg.includes('ERR_INVALID_TRANSITION')) status = 422;
    else if (msg.includes('ERR_UNAUTHORIZED')) status = 403;
    else if (msg.includes('ERR_') && msg.includes('_NOT_FOUND')) status = 404;
    return NextResponse.json({ error: msg }, { status });
  }

  logger.info('DATABASE', 'DOCUMENT_REVERSED', {
    type: parsed.data.type, id: parsed.data.id, userId: session.user.id,
    reason: parsed.data.reason, result: rpcResult,
  });

  return NextResponse.json(rpcResult);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/reverse');
