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
 * REM-V2-3: los entries `receipt`/`adjustment` de AMBOS mapas resuelven a
 * `reverse_receipt_v2` / `reverse_inventory_adjustment_v2` (misma firma).
 * Ningún caller de aplicación alcanza ya `reverse_receipt` ni
 * `reverse_adjustment` V1 (retiro de DB diferido — ver audit-evidence/REM-V2-3).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
// V2.4.4: usar uuidRegex del proyecto (permisivo, no exige variant bits como uuidLoose)
import { uuidRegex } from '@/validation/schemas';

const reverseSchema = z.object({
  type: z.enum(['transaction', 'receipt', 'transfer', 'adjustment', 'devolution', 'production_order']),
  id: z.string().regex(uuidRegex, 'ID de documento inválido'),
  reason: z.string().min(3).max(500),
  // MISIÓN DE CIERRE (§4): recuperación explícita del dinero de una devolución
  // con reembolso liquidado. La reversión es ATÓMICA con la recuperación: la
  // moneda y el importe los fija el SERVIDOR desde las filas refund (el
  // payload solo declara el riel real de cobro y la fecha). Sin esto, una
  // reversión documental liberaba el tope como si el dinero hubiera vuelto.
  recovery: z.array(z.object({
    currency: z.enum(['CUP', 'USD']),
    method: z.enum(['cash', 'transfer', 'zelle']),
    operation_date: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  })).max(2).optional(),
});

/**
 * FINALIZE-V2: mapa ÚNICO de reversal (RPC_MAP_V1/RPC_MAP_V2 eran contenido
 * idéntico tras las retiradas progresivas — colapsados; el feature flag
 * USE_V2_REVERSE fue eliminado). create_devolution_v2 / create_sale_v2 son
 * los únicos caminos de creación; el reversal siempre resuelve a esta tabla.
 */
const RPC_MAP: Record<string, { rpc: string; idParam: string }> = {
  transaction:      { rpc: 'reverse_transaction_v2',    idParam: 'p_transaction_id' },
  receipt:          { rpc: 'reverse_receipt_v2',        idParam: 'p_receipt_id' },
  transfer:         { rpc: 'reverse_transfer',           idParam: 'p_transfer_id' }, // sin refactor propio (V1≡V2)
  adjustment:       { rpc: 'reverse_inventory_adjustment_v2', idParam: 'p_adjustment_id' }, // W9.5 B-10: inversión verdadera
  devolution:       { rpc: 'reverse_devolution',         idParam: 'p_devolution_id' }, // sin refactor propio (V1≡V2)
  production_order: { rpc: 'reverse_production_order',   idParam: 'p_order_id' }, // sin refactor propio (V1≡V2)
};
/** W9.5 B-10: entidad y columna de tienda por tipo (para el boundary). */
const REVERSE_ENTITY: Record<string, { table: string; storeCol: string }> = {
  receipt:          { table: 'receipts',                storeCol: 'store_id' },
  transfer:         { table: 'transfers',               storeCol: 'origin_store_id' },
  adjustment:       { table: 'inventory_adjustments',   storeCol: 'store_id' },
  devolution:       { table: 'devolutions',             storeCol: 'store_id' },
  production_order: { table: 'production_orders',       storeCol: 'store_id' },
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

  // W9.5 B-8/B-10: API authorization boundary para TODOS los tipos. Cada
  // operación resuelve su propia semántica vía la MISMA función normativa DB:
  //   transaction      → can_admin_reverse_transaction (B-8, MODELO C ventas)
  //   receipt/transfer/adjustment/devolution/production_order
  //                    → can_reverse_document(actor, store, type) (B-10)
  // La DB sigue siendo la última barrera; el API no reimplementa reglas.
  if (parsed.data.type === 'transaction') {
    const { data: txRow, error: txErr } = await supabase
      .from('transactions')
      .select('store_id')
      .eq('id', parsed.data.id)
      .single();

    if (txErr || !txRow) {
      return NextResponse.json({ error: 'ERR_TRANSACTION_NOT_FOUND' }, { status: 404 });
    }

    const { data: canReverse, error: authzErr } = await supabase.rpc(
      'can_admin_reverse_transaction',
      { p_actor: session.user.id, p_store_id: txRow.store_id },
    );

    if (authzErr) {
      logger.error('DATABASE', 'REVERSE_AUTHZ_CHECK_FAILED', {
        id: parsed.data.id, userId: session.user.id, error: authzErr.message,
      });
      return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
    }

    if (canReverse !== true) {
      logger.warn('DATABASE', 'REVERSE_FORBIDDEN_ROLE', {
        id: parsed.data.id, userId: session.user.id, storeId: txRow.store_id,
      });
      return NextResponse.json(
        { error: 'ERR_INSUFFICIENT_ROLE: la reversión administrativa requiere rol admin/manager/encargado en la tienda de la venta' },
        { status: 403 },
      );
    }
  } else {
    // W9.5 B-10: boundary de los 5 tipos restantes (política por tipo en DB).
    const entity = REVERSE_ENTITY[parsed.data.type];
    const { data: docRow, error: docErr } = await supabase
      .from(entity.table)
      .select(entity.storeCol)
      .eq('id', parsed.data.id)
      .single();

    if (docErr || !docRow) {
      return NextResponse.json({ error: `ERR_${parsed.data.type.toUpperCase()}_NOT_FOUND` }, { status: 404 });
    }

    const storeId = (docRow as unknown as Record<string, unknown>)[entity.storeCol] as string;
    const { data: allowed, error: authzErr } = await supabase.rpc(
      'can_reverse_document',
      { p_actor: session.user.id, p_store_id: storeId, p_operation: parsed.data.type },
    );

    if (authzErr) {
      logger.error('DATABASE', 'REVERSE_AUTHZ_CHECK_FAILED', {
        type: parsed.data.type, id: parsed.data.id, userId: session.user.id, error: authzErr.message,
      });
      return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
    }

    if (allowed !== true) {
      logger.warn('DATABASE', 'REVERSE_FORBIDDEN_ROLE', {
        type: parsed.data.type, id: parsed.data.id, userId: session.user.id, storeId,
      });
      return NextResponse.json(
        { error: `ERR_INSUFFICIENT_ROLE: la reversión de ${parsed.data.type} requiere el rol operativo de su módulo en la tienda del documento` },
        { status: 403 },
      );
    }
  }

  // FINALIZE-V2: mapa único (sin feature flag)
  const rpcMap = RPC_MAP;
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
  // MISIÓN DE CIERRE: la recuperación acompaña la reversión de devoluciones
  // (p_recovery jsonb — firma 4-arg de 20261024400000). SOLO se envía para
  // devolution: el resto de las RPC no tiene el parámetro y PostgREST
  // resolvería PGRST202 si llegara un nombre inexistente.
  if (parsed.data.type === 'devolution' && parsed.data.recovery) {
    rpcParams.p_recovery = parsed.data.recovery;
  }

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
    // MISIÓN DE CIERRE (§4): la reversión de una devolución con reembolso
    // liquidado exige la recuperación atómica → 422 accionable (el modal
    // muestra el formulario de recuperación cuando el frontend detecta el código).
    else if (msg.includes('ERR_DEVOLUTION_REFUND_NOT_RECOVERED')) status = 422;
    else if (msg.includes('ERR_DEVOLUTION_RECOVERY')) status = 422;
    else if (msg.includes('ERR_DEVOLUTION_ALREADY_RECOVERED')) status = 409;
    return NextResponse.json({ error: msg }, { status });
  }

  logger.info('DATABASE', 'DOCUMENT_REVERSED', {
    type: parsed.data.type, id: parsed.data.id, userId: session.user.id,
    reason: parsed.data.reason, result: rpcResult,
  });

  return NextResponse.json(rpcResult);
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/reverse');
