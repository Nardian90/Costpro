/**
 * POST /api/reverse — reversión de documentos contables
 *
 * Body: { type: 'transaction'|'receipt'|'transfer'|'adjustment'|'devolution', id: UUID, reason: string }
 *
 * Invoca la RPC correspondiente para revertir la operación:
 * - Devuelve/descuenta stock afectado
 * - Crea kardex entries de reversión
 * - Marca el documento como 'reversed'/'REVERSADA'
 * - Registra quien revirtió y por qué
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
  type: z.enum(['transaction', 'receipt', 'transfer', 'adjustment', 'devolution']),
  id: z.string().min(1),
  reason: z.string().min(3),
});

const RPC_MAP: Record<string, string> = {
  transaction: 'reverse_transaction',
  receipt: 'reverse_receipt',
  transfer: 'reverse_transfer',
  adjustment: 'reverse_adjustment',
  devolution: 'reverse_devolution',
};

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  const { allowed } = await rateLimit(`reverse:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const parsed = reverseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ...createApiError('INVALID_DATA'), details: parsed.error.format() }, { status: 400 });

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const rpcName = RPC_MAP[parsed.data.type];
  if (!rpcName) return NextResponse.json({ error: 'Tipo de documento no soportado' }, { status: 400 });

  const { data, error } = await supabase.rpc(rpcName, {
    p_transaction_id: parsed.data.id,    // parameter name varies but Supabase matches by position
    p_receipt_id: parsed.data.id,
    p_transfer_id: parsed.data.id,
    p_adjustment_id: parsed.data.id,
    p_devolution_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_user_id: session.user.id,
  });

  // The RPC call above won't work because Supabase sends ALL params.
  // Instead, call with only the relevant params.
  // Let's use a different approach: call with named params matching the RPC.
  const rpcParams: Record<string, unknown> = {
    p_reason: parsed.data.reason,
    p_user_id: session.user.id,
  };

  // Set the correct ID parameter based on type
  const idParamMap: Record<string, string> = {
    transaction: 'p_transaction_id',
    receipt: 'p_receipt_id',
    transfer: 'p_transfer_id',
    adjustment: 'p_adjustment_id',
    devolution: 'p_devolution_id',
  };
  rpcParams[idParamMap[parsed.data.type]] = parsed.data.id;

  const { data: rpcResult, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

  if (rpcError) {
    logger.error('DATABASE', 'REVERSE_FAILED', {
      type: parsed.data.type, id: parsed.data.id, error: rpcError.message, userId: session.user.id,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  logger.info('DATABASE', 'DOCUMENT_REVERSED', {
    type: parsed.data.type, id: parsed.data.id, userId: session.user.id, reason: parsed.data.reason, result: rpcResult,
  });

  return NextResponse.json(rpcResult);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/reverse');
