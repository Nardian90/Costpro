import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
// F4-GAP1: Import cache invalidation
import { invalidateCacheForStore } from '@/app/api/inventory/costeo-dinamico/route';

/**
 * PATCH /api/inventory/receptions/[id]/items/[itemId]
 *
 * Actualiza la moneda y/o tasa de cambio de un item de recepción.
 * Genera un registro de auditoría en receipt_tasa_audit.
 *
 * FIX-GAP3: Permite al usuario corregir la tasa de cambio de una recepción
 * existente. Esto es esencial para que el motor de costeo dinámico funcione.
 */
async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const receiptId = pathParts[pathParts.indexOf('receptions') + 1];
  const itemId = pathParts[pathParts.indexOf('items') + 1];

  if (!receiptId || !itemId) {
    return NextResponse.json({ error: 'Receipt ID e Item ID son requeridos' }, { status: 400 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
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

  // 1. Obtener valor actual para auditoría
  const { data: currentItem, error: fetchError } = await supabase
    .from('receipt_items')
    .select('moneda_recepcion, tasa_cambio_recepcion')
    .eq('id', itemId)
    .single();

  if (fetchError || !currentItem) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
  }

  const oldMoneda = currentItem.moneda_recepcion;
  const oldTasa = currentItem.tasa_cambio_recepcion;
  const newMoneda = moneda_recepcion || oldMoneda;
  const newTasa = tasa_cambio_recepcion !== undefined ? tasa_cambio_recepcion : oldTasa;

  // 2. Actualizar el item
  const { error: updateError } = await supabase
    .from('receipt_items')
    .update({
      moneda_recepcion: newMoneda,
      tasa_cambio_recepcion: newTasa,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (updateError) {
    logger.error('DATABASE', 'UPDATE_RECEIPT_ITEM_TASA_FAILED', { itemId, error: updateError.message });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 3. Registrar en auditoría (siempre, incluso si no cambió)
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;

  await supabase.from('receipt_tasa_audit').insert({
    receipt_item_id: itemId,
    valor_anterior: oldTasa,
    valor_nuevo: newTasa,
    moneda_anterior: oldMoneda,
    moneda_nueva: newMoneda,
    modificado_por: userId,
    motivo: motivo || 'Actualización manual de tasa de cambio',
  });

  logger.info('DATABASE', 'RECEIPT_ITEM_TASA_UPDATED', { itemId, oldTasa, newTasa, userId });

  // F4-GAP1: Invalidate cache after tasa update
  // Get store_id from the receipt
  const { data: receipt } = await supabase
    .from('receipts')
    .select('store_id')
    .eq('id', receiptId)
    .single();
  if (receipt?.store_id) {
    invalidateCacheForStore(receipt.store_id);
  }

  return NextResponse.json({
    success: true,
    itemId,
    previous: { moneda: oldMoneda, tasa: oldTasa },
    current: { moneda: newMoneda, tasa: newTasa },
  });
}

export const PATCH = withTracing(withAuth(patchHandler) as any, 'PATCH /api/inventory/receptions/[id]/items/[itemId]');
