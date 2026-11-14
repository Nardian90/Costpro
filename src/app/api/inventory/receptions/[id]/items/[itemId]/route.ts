import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
// F4-GAP1: Import cache invalidation
import { invalidateCacheForStore } from '@/app/api/inventory/costeo-dinamico/route';
// F-21: validar tasa_cambio_recepcion antes de actualizar receipt_items
import { validateReceiptItemTasa } from '@/lib/receipt-items-validation';

/**
 * PATCH /api/inventory/receptions/[id]/items/[itemId]
 *
 * Actualiza la moneda y/o tasa de cambio de un item de recepción DELEGANDO
 * en la RPC canónica `update_receipt_item_tasa` (CP-RECEIPT-INTEGRITY-001,
 * 2026-11-14).
 *
 * Antes (FIX-GAP3 legacy): la ruta escribía receipt_items directamente con
 * service_role sin guard de estado y sin recalcular receipts.total_cost →
 * permitía mutaciones silenciosas de recepciones CONFIRMADAS/REVERSAS y
 * dejaba la cabecera desfasada respecto a las líneas (defecto demostrado en
 * la auditoría de FAC-VITALLCONS-001: edición a las 2026-11-14T12:15Z sobre
 * una recepción 'active' con recalculo omitido).
 *
 * Ahora: la RPC aporta el servicio completo — guard de estado (solo
 * 'pending' editable; 'voided'/'reversed'/'active' → ERR_NOT_EDITABLE /
 * ERR_ALREADY_VOIDED), autorización por membresía (has_store_access_as),
 * validación F-21, auditoría dual (receipt_tasa_audit + audit_logs) y
 * recalculo atómico del total de cabecera con calculate_receipt_total_cup.
 *
 * Para corregir una recepción YA confirmada existe el procedimiento
 * autorizado: reversión/anulación controlada + recepción correctiva, o la
 * corrección gobernada con escape hatch documentado (trigger de migración
 * 20261114160000). Nunca la edición silenciosa.
 */

function mapRpcErrorToResponse(message: string): NextResponse | null {
  if (message.includes('ERR_RECEIPT_ITEM_NOT_FOUND')) {
    return NextResponse.json({ error: 'Item no encontrado', code: 'ERR_RECEIPT_ITEM_NOT_FOUND' }, { status: 404 });
  }
  if (message.includes('ERR_UNAUTHORIZED')) {
    return NextResponse.json({ error: 'Forbidden — sin acceso a la tienda de la recepción', code: 'ERR_UNAUTHORIZED' }, { status: 403 });
  }
  if (message.includes('ERR_ALREADY_VOIDED')) {
    return NextResponse.json({
      error: 'La recepción está anulada: sus líneas son inmutables',
      code: 'ERR_ALREADY_VOIDED',
      remedio: 'Registre una recepción correctiva nueva y deje la anulación trazada.',
    }, { status: 409 });
  }
  if (message.includes('ERR_NOT_EDITABLE')) {
    return NextResponse.json({
      error: 'La recepción ya no está pendiente: sus datos económicos son inmutables',
      code: 'ERR_NOT_EDITABLE',
      remedio: 'Use reversión/anulación controlada + recepción correctiva, o la corrección gobernada documentada (app.allow_receipt_item_edit).',
    }, { status: 409 });
  }
  if (message.includes('ERR_CUP_RATE_MUST_BE_1') || message.includes('ERR_INVALID_EXCHANGE_RATE') || message.includes('ERR_UNSUPPORTED_CURRENCY')) {
    return NextResponse.json({ error: message, code: 'ERR_F21_TASA_INVALIDA' }, { status: 400 });
  }
  if (message.includes('ERR_INVALID_RECEIPT_DATA')) {
    return NextResponse.json({ error: message, code: 'ERR_INVALID_RECEIPT_DATA' }, { status: 400 });
  }
  return null;
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const receiptId = pathParts[pathParts.indexOf('receptions') + 1];
  const itemId = pathParts[pathParts.indexOf('items') + 1];

  if (!receiptId || !itemId) {
    return NextResponse.json({ error: 'Receipt ID e Item ID son requeridos' }, { status: 400 });
  }

  if (!isAdminLevel(session.user.role) && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // REM-COSTPRO4-CI: contrato del body con Zod (campos opcionales — la
  // requeridad de moneda/tasa la aplica el check de abajo con mensaje
  // específico).
  const ReceptionItemPatchSchema = z.object({
    moneda_recepcion: z.string().optional(),
    tasa_cambio_recepcion: z.number().positive().optional(),
    motivo: z.string().optional(),
  }).passthrough();
  const parsedBody = ReceptionItemPatchSchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }

  const { moneda_recepcion, tasa_cambio_recepcion, motivo } = body;

  if (tasa_cambio_recepcion === undefined && moneda_recepcion === undefined) {
    return NextResponse.json({ error: 'Debe proporcionar moneda_recepcion o tasa_cambio_recepcion' }, { status: 400 });
  }

  if (tasa_cambio_recepcion !== undefined && (typeof tasa_cambio_recepcion !== 'number' || tasa_cambio_recepcion <= 0)) {
    return NextResponse.json({ error: 'tasa_cambio_recepcion debe ser un número positivo' }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // 1. Valor actual + estado de la recepción (join por FK) para auditoría de
  // respuesta y guard de estado UX-temprano. La RPC revalida todo en el
  // servidor (defensa en profundidad).
  const { data: currentItem, error: fetchError } = await supabase
    .from('receipt_items')
    .select('moneda_recepcion, tasa_cambio_recepcion, receipts(status, store_id)')
    .eq('id', itemId)
    .single();

  if (fetchError || !currentItem) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
  }

  const oldMoneda = currentItem.moneda_recepcion;
  const oldTasa = currentItem.tasa_cambio_recepcion;
  // CP-RECEIPT-INTEGRITY-001: el cliente Supabase no lleva el genérico Database,
  // así que el embed many-to-one `receipts(...)` se tipa como array aunque
  // PostgREST devuelva un objeto único. Normalizamos (misma convención que
  // costeo-dinamico) para acceder de forma type-safe sin cambiar el runtime.
  const receiptRow = Array.isArray(currentItem.receipts) ? currentItem.receipts[0] : currentItem.receipts;
  const receiptStatus = receiptRow?.status;
  const storeId = receiptRow?.store_id;
  const newMoneda = moneda_recepcion || oldMoneda;
  const newTasa = tasa_cambio_recepcion !== undefined ? tasa_cambio_recepcion : oldTasa;

  // CP-RECEIPT-INTEGRITY-001: guard de estado — los datos económicos de una
  // recepción confirmada/anulada/revertida son inmutables (regla del diseño).
  if (receiptStatus && receiptStatus !== 'pending') {
    return NextResponse.json({
      error: `La recepción está '${receiptStatus}': sus datos económicos son inmutables`,
      code: 'ERR_NOT_EDITABLE',
      remedio: 'Use reversión/anulación controlada + recepción correctiva, o la corrección gobernada documentada (app.allow_receipt_item_edit).',
    }, { status: 409 });
  }

  // F-21: validar que la combinación (newMoneda, newTasa) sea coherente.
  // Impide que un admin/manager "corrija" la moneda a USD pero deje tasa=1.0
  // (o cualquier valor <= 1.5), lo que generaría costeos absurdos.
  const tasaValidation = validateReceiptItemTasa(newMoneda, newTasa);
  if (!tasaValidation.valid) {
    return NextResponse.json(
      {
        error: tasaValidation.error,
        message: tasaValidation.details,
        code: 'ERR_F21_TASA_INVALIDA',
      },
      { status: 400 }
    );
  }

  // 2. Delegar la mutación completa a la RPC canónica: auditoría dual,
  // guard de estado autoritativo, recalculo de receipts.total_cost.
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;

  const { data: rpcResult, error: rpcError } = await supabase.rpc('update_receipt_item_tasa', {
    p_receipt_item_id: itemId,
    p_new_tasa_cambio_recepcion: newTasa,
    p_new_moneda_recepcion: moneda_recepcion || null,
    p_motivo: motivo || 'Actualización desde detalle de recepción',
    p_user_id: userId,
  });

  if (rpcError) {
    logger.error('DATABASE', 'UPDATE_RECEIPT_ITEM_TASA_FAILED', { itemId, error: rpcError.message });
    const mapped = mapRpcErrorToResponse(rpcError.message);
    return mapped ?? NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  logger.info('DATABASE', 'RECEIPT_ITEM_TASA_UPDATED', {
    itemId, oldTasa, newTasa, userId,
    status: rpcResult?.status,
    newTotalCost: rpcResult?.new_total_cost,
  });

  // F4-GAP1: Invalidar cache del costeo dinámico tras el cambio de tasa.
  if (storeId) {
    invalidateCacheForStore(storeId);
  }

  return NextResponse.json({
    success: true,
    status: rpcResult?.status ?? 'success',
    itemId,
    receipt_id: rpcResult?.receipt_id ?? receiptId,
    previous: { moneda: oldMoneda, tasa: oldTasa },
    current: { moneda: newMoneda, tasa: newTasa },
    // Total de cabecera recalculado por el servidor (CUP) — siempre fresco.
    receipt_total_cost_cup: rpcResult?.new_total_cost,
  });
}

export const PATCH = withTracing(withAuth(patchHandler) as any, 'PATCH /api/inventory/receptions/[id]/items/[itemId]');
