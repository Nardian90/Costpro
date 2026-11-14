import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { invalidateCacheForStore } from '@/app/api/inventory/costeo-dinamico/route';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
// F-21: validar tasa_cambio_recepcion en backfill masivo
import { TASA_CAMBIO_MINIMA_NO_CUP } from '@/lib/receipt-items-validation';

export const runtime = 'nodejs';

const backfillSchema = z.object({
  store_id: uuidLoose,
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  moneda: z.enum(['USD', 'EUR', 'MLC']),
  // F-21: la tasa debe ser > 1.5 para monedas no-CUP. Zod refina el positive
  // original para garantizar que el backfill no genere items inválidos.
  tasa: z
    .number()
    .positive()
    .refine((v) => v > TASA_CAMBIO_MINIMA_NO_CUP, {
      message: `tasa debe ser mayor a ${TASA_CAMBIO_MINIMA_NO_CUP} CUP por unidad para moneda no-CUP (F-21)`,
    }),
  motivo: z.string().optional(),
});

/**
 * POST /api/inventory/receptions/backfill-tasas
 *
 * Backfill masivo: asigna moneda + tasa a las líneas de recepciones
 * PENDIENTES en un rango de fecha que todavía tienen tasa=1.0 (CUP).
 *
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — dos correcciones sobre el diseño
 * legacy:
 *   1. GUARD DE ESTADO: solo receipts.status='pending'. Antes el filtro era
 *      por tienda y fecha únicamente → mutaba en silencio líneas de
 *      recepciones CONFIRMADAS/ANULADAS/REVERTIDAS (rompía la inmutabilidad
 *      económica de documentos terminados).
 *   2. CONSISTENCIA DE CABECERA: cada mutación se delega a la RPC canónica
 *      update_receipt_item_tasa, que recalcula receipts.total_cost con
 *      calculate_receipt_total_cup y escribe auditoría dual
 *      (receipt_tasa_audit + audit_logs). Antes actualizaba las líneas con
 *      service_role SIN recalculo → la cabecera quedaba desfasada respecto a
 *      las líneas (WAC/kardex/CP-FIN ya aplicados + costeo dinámico y
 *      pendiente_cup con el nuevo valor: divergencia de 3 vías).
 *
 * Solo afecta receipt_items con tasa_cambio_recepcion = 1.0 (default) y
 * moneda 'CUP'. No toca items que ya tienen una tasa asignada manualmente.
 *
 * Autorización: pre-check has_store_access_as (membresía activa o rol
 * administrativo de plataforma) + revalidación por item en la RPC.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!isAdminLevel(session.user.role) && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = backfillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.format() }, { status: 400 });
  }

  const { store_id, date_from, date_to, moneda, tasa, motivo } = parsed.data;
  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // 0. Autorización de tienda ANTES de mutar nada (fail-fast: evita lotes
  // parcialmente aplicados seguidos de un 403). La RPC revalida por item.
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;
  const { data: accessOk, error: accessErr } = await supabase.rpc('has_store_access_as', {
    p_user_id: userId,
    p_store_id: store_id,
  });
  if (accessErr || accessOk !== true) {
    return NextResponse.json({
      error: 'Forbidden — sin acceso a la tienda indicada',
      code: 'ERR_UNAUTHORIZED',
    }, { status: 403 });
  }

  // 1. Encontrar receipt_items con tasa=1.0 (default CUP) en PENDING receipts
  // del rango de fecha. Guard CP-RECEIPT-INTEGRITY-001: receipts.status='pending'.
  let query = supabase
    .from('receipt_items')
    .select(`
      id, product_id,
      receipts!inner(id, status, store_id, reception_date)
    `)
    .eq('receipts.store_id', store_id)
    .eq('receipts.status', 'pending')
    .eq('tasa_cambio_recepcion', 1.0)
    .eq('moneda_recepcion', 'CUP');

  if (date_from) {
    query = query.gte('receipts.reception_date', `${date_from}T00:00:00`);
  }
  if (date_to) {
    query = query.lte('receipts.reception_date', `${date_to}T23:59:59`);
  }

  const { data: itemsToUpdate, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!itemsToUpdate || itemsToUpdate.length === 0) {
    return NextResponse.json({
      success: true,
      updated: 0,
      recalculated_receipts: 0,
      message: 'No se encontraron items con tasa default (1.0 CUP) en recepciones PENDIENTES del rango especificado.',
    });
  }

  // 2. Actualizar cada item vía la RPC canónica (auditoría + recalculo de
  // cabecera atómico por línea + guard de estado revalidado en el servidor).
  let updated = 0;
  let failed = 0;
  const failedItems: Array<{ itemId: string; error: string }> = [];
  const totalsByReceipt = new Map<string, number>();

  for (const item of itemsToUpdate) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_receipt_item_tasa', {
      p_receipt_item_id: item.id,
      p_new_tasa_cambio_recepcion: tasa,
      p_new_moneda_recepcion: moneda,
      p_motivo: motivo || `Backfill masivo: tasa ${tasa} ${moneda}/CUP`,
      p_user_id: userId,
    });

    if (rpcError) {
      failed++;
      failedItems.push({ itemId: item.id, error: rpcError.message });
      logger.warn('DATABASE', 'BACKFILL_ITEM_UPDATE_FAILED', { itemId: item.id, error: rpcError.message });
      continue;
    }

    updated++;
    const receiptId = item.receipts?.id;
    if (receiptId && typeof rpcResult?.new_total_cost === 'number') {
      totalsByReceipt.set(receiptId, rpcResult.new_total_cost);
    } else if (receiptId) {
      totalsByReceipt.set(receiptId, Number(rpcResult?.new_total_cost ?? 0));
    }
  }

  // 3. Invalidar cache del costeo dinámico
  invalidateCacheForStore(store_id);

  logger.info('DATABASE', 'BACKFILL_TASAS_COMPLETED', {
    storeId: store_id, updated, failed, moneda, tasa, dateFrom: date_from, dateTo: date_to,
    receiptsRecalculados: totalsByReceipt.size,
  });

  return NextResponse.json({
    success: true,
    updated,
    failed,
    failed_items: failedItems,
    recalculated_receipts: totalsByReceipt.size,
    totals_por_recepcion: Object.fromEntries(totalsByReceipt),
    moneda,
    tasa,
    message: `${updated} items actualizados a ${moneda} ${tasa} CUP/${moneda} en recepciones pendientes; ${totalsByReceipt.size} cabeceras recalculadas.`,
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/inventory/receptions/backfill-tasas');
