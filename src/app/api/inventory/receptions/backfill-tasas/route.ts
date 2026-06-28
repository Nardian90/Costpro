import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { invalidateCacheForStore } from '@/app/api/inventory/costeo-dinamico/route';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const runtime = 'nodejs';

const backfillSchema = z.object({
  store_id: z.string().uuid(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  moneda: z.enum(['USD', 'EUR', 'MLC']),
  tasa: z.number().positive(),
  motivo: z.string().optional(),
});

/**
 * POST /api/inventory/receptions/backfill-tasas
 *
 * Backfill masivo: asigna moneda + tasa a todas las recepciones
 * en un rango de fecha que todavía tienen tasa=1.0 (CUP).
 *
 * Solo afecta receipt_items con tasa_cambio_recepcion = 1.0 (default).
 * No toca items que ya tienen una tasa asignada manualmente.
 *
 * Genera auditoría por cada item actualizado.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
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

  // 1. Encontrar receipt_items con tasa=1.0 (default CUP) en el rango de fecha
  let query = supabase
    .from('receipt_items')
    .select(`
      id, product_id,
      receipts!inner(store_id, reception_date)
    `)
    .eq('receipts.store_id', store_id)
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
      message: 'No se encontraron items con tasa default (1.0 CUP) en el rango especificado.',
    });
  }

  // 2. Actualizar cada item + crear auditoría
  const userId = session.user.id;
  let updated = 0;
  const auditRows: any[] = [];

  for (const item of itemsToUpdate) {
    // Update the item
    const { error: updateError } = await supabase
      .from('receipt_items')
      .update({
        moneda_recepcion: moneda,
        tasa_cambio_recepcion: tasa,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (updateError) {
      logger.error('DATABASE', 'BACKFILL_ITEM_UPDATE_FAILED', { itemId: item.id, error: updateError.message });
      continue;
    }

    // Prepare audit row
    auditRows.push({
      receipt_item_id: item.id,
      valor_anterior: 1.0,
      valor_nuevo: tasa,
      moneda_anterior: 'CUP',
      moneda_nueva: moneda,
      modificado_por: userId,
      motivo: motivo || `Backfill masivo: tasa ${tasa} ${moneda}/CUP`,
    });
    updated++;
  }

  // 3. Insertar auditoría en batch
  if (auditRows.length > 0) {
    await supabase.from('receipt_tasa_audit').insert(auditRows);
  }

  // 4. Invalidar cache del costeo dinámico
  invalidateCacheForStore(store_id);

  logger.info('DATABASE', 'BACKFILL_TASAS_COMPLETED', {
    storeId: store_id, updated, moneda, tasa, dateFrom: date_from, dateTo: date_to,
  });

  return NextResponse.json({
    success: true,
    updated,
    moneda,
    tasa,
    message: `${updated} items actualizados a ${moneda} ${tasa} CUP/${moneda}`,
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/inventory/receptions/backfill-tasas');
