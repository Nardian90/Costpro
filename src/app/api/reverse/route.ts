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
 * W9.4.7 H5-B1: RPC `reverse_transaction` (V1) retirada de la DB; el entry
 * `transaction` de AMBOS mapas resuelve a `reverse_transaction_v2` (migración
 * 20260903030000). Ningún camino de ejecución puede alcanzar la V1.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';
// V2.4.4: usar uuidRegex del proyecto (permisivo, no exige variant bits como z.string().uuid())
import { uuidRegex } from '@/validation/schemas';

const reverseSchema = z.object({
  type: z.enum(['transaction', 'receipt', 'transfer', 'adjustment', 'devolution', 'production_order']),
  id: z.string().regex(uuidRegex, 'ID de documento inválido'),
  reason: z.string().min(3).max(500),
});

/** V2.3: cada tipo mapea a (rpc_name, id_param_name). SÓLO ese param se envía. */
const RPC_MAP_V1: Record<string, { rpc: string; idParam: string }> = {
  transaction:      { rpc: 'reverse_transaction_v2',    idParam: 'p_transaction_id' }, // W9.4.7 H5-B1: V1 retirada — fallback resuelve a V2
  receipt:          { rpc: 'reverse_receipt',            idParam: 'p_receipt_id' },
  transfer:         { rpc: 'reverse_transfer',           idParam: 'p_transfer_id' },
  adjustment:       { rpc: 'reverse_adjustment',         idParam: 'p_adjustment_id' },
  devolution:       { rpc: 'reverse_devolution',         idParam: 'p_devolution_id' },
  production_order: { rpc: 'reverse_production_order',   idParam: 'p_order_id' },
};

/** Iteración 11.3: RPCs v2 para tipos que tienen refactor */
const RPC_MAP_V2: Record<string, { rpc: string; idParam: string }> = {
  transaction:      { rpc: 'reverse_transaction_v2',    idParam: 'p_transaction_id' },
  receipt:          { rpc: 'reverse_receipt_v2',        idParam: 'p_receipt_id' },
  transfer:         { rpc: 'reverse_transfer',           idParam: 'p_transfer_id' }, // sin cambio
  adjustment:       { rpc: 'duplicate_inventory_adjustment_v2', idParam: 'p_original_id' }, // B-11: usa duplicate
  devolution:       { rpc: 'reverse_devolution',         idParam: 'p_devolution_id' }, // sin cambio en reverse_devolution
  production_order: { rpc: 'reverse_production_order',   idParam: 'p_order_id' }, // sin cambio
};

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`reverse:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  // V2.4.4: try/catch para body inválido (sin JSON, mal formado)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }

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

  // Iteración 11.3: seleccionar RPC v1 o v2 según feature flag
  const { FEATURES } = await import('@/config/features');
  const rpcMap = FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1;
  const mapping = rpcMap[parsed.data.type];
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
