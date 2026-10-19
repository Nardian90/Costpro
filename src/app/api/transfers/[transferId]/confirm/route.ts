/**
 * POST /api/transfers/[id]/confirm — Confirmar transferencia
 *
 * Iteración RLS (v2.21.0) Fix RLS-B6:
 * Antes no existía endpoint para confirmar transferencias — quedaban PENDIENTE
 * perpetuamente. El RPC confirm_transfer ya existía en DB pero no se llamaba
 * desde ninguna API route.
 *
 * Lógica:
 * - Validar transfer existe + status PENDIENTE
 * - Validar usuario tiene canManageStore en destination_store_id (quien recibe confirma)
 * - Llamar RPC confirm_transfer
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
// MISIÓN POLÍTICA TEMPORAL (2026-10-18): esta ruta aceptaba `operation_date`
// arbitraria del cliente y la propagaba SIN validación al Kardex/inventario
// vía register_stock_movement (confirm_transfer no tiene gate BD). Ahora se
// valida: parseable + no futura (día de negocio America/Havana) → 422.
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';

async function postHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`transfer-confirm:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Extraer transferId de la URL (patrón /api/transfers/[transferId]/confirm)
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const transferId = pathParts[pathParts.length - 2]; // penúltimo segmento ([transferId])
  if (!transferId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferId)) {
    return NextResponse.json({ error: 'Invalid transfer_id' }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Verificar que el transfer existe y obtener store_ids
  const { data: transfer, error: transferError } = await admin
    .from('transfers')
    .select('id, origin_store_id, destination_store_id, status')
    .eq('id', transferId)
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
  }

  // El usuario debe tener acceso a la tienda DESTINO (quien recibe confirma)
  if (!canManageStore(session.user, transfer.destination_store_id)) {
    return NextResponse.json({ error: 'Forbidden — no access to destination store' }, { status: 403 });
  }

  if (transfer.status !== 'PENDIENTE') {
    return NextResponse.json(
      { error: `Transfer is ${transfer.status}, not PENDIENTE` },
      { status: 409 }
    );
  }

  // Parse body (opcional — operation_date)
  let operationDate: Date | undefined;
  try {
    const body = await req.json();

    // REM-COSTPRO4-CI: contrato del body con Zod (body opcional; solo
    // operation_date, cuya validez temporal la valida new Date() abajo).
    const ConfirmTransferSchema = z.object({
      operation_date: z.string().optional(),
    }).passthrough();
    const parsedBody = ConfirmTransferSchema.safeParse(body ?? {});
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }

    if (body?.operation_date) {
      // MISIÓN POLÍTICA TEMPORAL: la fecha de recepción de la transferencia
      // es un dato de cliente NO confiable — validar antes de tocar stock.
      const parsed = new Date(body.operation_date);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({
          error: 'La fecha de recepción enviada no es una fecha válida.',
          code: 'ERR_INVALID_OPERATION_DATE',
        }, { status: 422 });
      }
      const dateCheck = checkNotFutureOperationDate(body.operation_date);
      if (!dateCheck.ok) {
        return NextResponse.json({ error: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' }, { status: 422 });
      }
      operationDate = parsed;
    }
  } catch {
    // body opcional
  }

  // Llamar al RPC confirm_transfer
  const { data, error } = await admin.rpc('confirm_transfer', {
    p_transfer_id: transferId,
    p_user_id: session.user.id,
    p_operation_date: operationDate || new Date(),
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    if (msg.includes('ERR_TRANSFER_NOT_PENDING') || msg.includes('NOT_PENDING')) {
      return NextResponse.json({ error: 'Transfer no está pendiente' }, { status: 409 });
    }
    if (msg.includes('ERR_TRANSFER_NOT_FOUND') || msg.includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Transfer no encontrada' }, { status: 404 });
    }
    // MISIÓN POLÍTICA TEMPORAL: rechazos del gate de fechas (migración pend)
    if (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT')) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/transfers/[id]/confirm'
);
